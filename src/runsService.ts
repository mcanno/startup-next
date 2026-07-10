// Ciclo de vida de un run: crear, arrancar, responder a una aclaración, y
// construir la respuesta de GET /runs/{id}. El razonamiento real
// (orquestador/especialista/validador) vive en el grafo de LangGraph
// (src/graph/); este módulo invoca/resume el grafo y sincroniza el
// resultado hacia next_action_runs, que sigue siendo el único contrato
// que expone la API — el checkpointer de LangGraph es estado interno de
// ejecución, no el contrato (sección 7).
//
// Sección 7 (continuación): /start y /respond devuelven el control a la
// API apenas accion_next queda resuelto (o se dispara needs_clarification)
// — no esperan a que termine el loop especialista↔validador completo. Se
// logra consumiendo el stream del grafo a mano (no con for-await, que
// mataría el generador al hacer break) hasta el primer punto de "soltar",
// y drenando el resto en una tarea sin awaitear (fire-and-forget) que
// sincroniza cada ciclo hacia next_action_runs a medida que llega y
// dispara el webhook opcional al terminar.

import { Command, INTERRUPT, isInterrupted } from "@langchain/langgraph";
import * as queries from "./db/queries.js";
import type { NextActionRun } from "./db/schema.js";
import { getGraph } from "./graph/index.js";
import type { StartupNextStateType } from "./graph/state.js";
import type { ComentarioAsesor, InformeSituacionRef, RequestedBy } from "./schemas.js";

export type CreateRunInput = {
  startupId: string;
  informeSituacionRef: InformeSituacionRef;
  comentarioAsesor?: ComentarioAsesor;
  requestedBy: RequestedBy;
  callbackUrl?: string;
};

export async function createRun(input: CreateRunInput): Promise<NextActionRun> {
  return queries.createRun({
    startupId: input.startupId,
    informeSituacionRefId: input.informeSituacionRef.report_id,
    informeSituacionRef: input.informeSituacionRef,
    comentarioAsesor: input.comentarioAsesor?.texto,
    comentarioAsesorAutor: input.comentarioAsesor?.autor,
    comentarioAsesorAplicaA: input.comentarioAsesor?.aplica_a ?? null,
    comentarioAsesorTags: input.comentarioAsesor?.tags ?? null,
    requestedBy: input.requestedBy,
    callbackUrl: input.callbackUrl ?? null,
    status: "draft",
  });
}

export type AdvanceRunResult =
  | { ok: true; run: NextActionRun }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "invalid_state"; status: string }
  | { ok: false; reason: "no_pending_question" };

function reconstructComentario(run: NextActionRun): ComentarioAsesor | undefined {
  if (!run.comentarioAsesor) return undefined;
  return {
    texto: run.comentarioAsesor,
    autor: run.comentarioAsesorAutor ?? undefined,
    aplica_a: run.comentarioAsesorAplicaA ?? undefined,
    tags: run.comentarioAsesorTags ?? undefined,
  };
}

const TERMINAL_STATUSES_WITH_CALLBACK = new Set([
  "approved",
  "max_cycles_reached",
  "sin_especialista",
  "peticion_incoherente",
]);

async function fireCallbackIfNeeded(run: NextActionRun): Promise<void> {
  if (!run.callbackUrl || !TERMINAL_STATUSES_WITH_CALLBACK.has(run.status)) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    await fetch(run.callbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run_id: run.id, status: run.status }),
      signal: controller.signal,
    });
  } catch {
    // Best-effort: un webhook caído o lento no debe romper el ciclo de
    // vida del run — el cliente siempre puede hacer GET /runs/{id}.
  } finally {
    clearTimeout(timeout);
  }
}

// Persiste un chunk del stream del grafo (o su pausa por interrupt())
// hacia next_action_runs, que es el único contrato expuesto por la API.
async function syncChunkToRun(runId: string, chunk: unknown): Promise<NextActionRun> {
  if (isInterrupted<{ pregunta: string }>(chunk)) {
    const pregunta = chunk[INTERRUPT][0]?.value?.pregunta ?? "¿Podés dar más contexto sobre la prioridad?";
    await queries.createClarification({ runId, pregunta, respuesta: null });
    return queries.updateRun(runId, { status: "needs_clarification" });
  }

  const state = chunk as StartupNextStateType;
  return queries.updateRun(runId, {
    status: state.status,
    accionNext: state.accionNext ?? null,
    cycle: state.cycle,
    ciclos: state.ciclos,
    especialistaUsado: state.especialistaUsado ?? null,
    resultado: state.resultado ?? null,
  });
}

function isDecisionPoint(chunk: unknown): boolean {
  return isInterrupted(chunk) || Boolean((chunk as StartupNextStateType).accionNext);
}

// Drena el resto del stream sin bloquear al llamador — cada chunk se
// sincroniza a medida que llega, y al terminar (el grafo llegó a END)
// dispara el webhook si corresponde. No se awaitea desde afuera.
function continueInBackground(runId: string, iterator: AsyncIterator<unknown>): void {
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await iterator.next();
        if (done) return;
        const updated = await syncChunkToRun(runId, value);
        await fireCallbackIfNeeded(updated);
      }
    } catch (err) {
      await queries.updateRun(runId, {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();
}

// Tipo de entrada real que acepta el grafo compilado (estado inicial o un
// Command de resume) — se reusa tal cual en vez de tipar Command a mano,
// ya que su parámetro Nodes depende de los nombres de nodo del grafo.
type GraphInput = Parameters<ReturnType<typeof getGraph>["stream"]>[0];

// Consume el stream del grafo a mano hasta el primer punto de "soltar"
// (interrupt real, o accion_next ya resuelto) y devuelve ese estado
// sincronizado — sin esperar a que terminen los ciclos especialista↔
// validador restantes, que quedan corriendo en background.
async function driveGraph(
  runId: string,
  input: StartupNextStateType | InstanceType<typeof Command>,
): Promise<NextActionRun> {
  const stream = await getGraph().stream(input as GraphInput, {
    configurable: { thread_id: runId },
    streamMode: "values",
  });
  const iterator = stream[Symbol.asyncIterator]();

  let lastValue: unknown;
  let detachChunk: unknown;
  for (;;) {
    const { value, done } = await iterator.next();
    if (done) break;
    lastValue = value;
    if (isDecisionPoint(value)) {
      detachChunk = value;
      break;
    }
  }
  detachChunk ??= lastValue;

  const updated = await syncChunkToRun(runId, detachChunk);

  if (isInterrupted(detachChunk) || TERMINAL_STATUSES_WITH_CALLBACK.has(updated.status)) {
    await fireCallbackIfNeeded(updated);
  } else {
    continueInBackground(runId, iterator);
  }

  return updated;
}

export async function startRun(runId: string): Promise<AdvanceRunResult> {
  const run = await queries.getRunById(runId);
  if (!run) return { ok: false, reason: "not_found" };
  if (run.status !== "draft") return { ok: false, reason: "invalid_state", status: run.status };

  const initialState: StartupNextStateType = {
    runId,
    startupId: run.startupId,
    opciones: run.informeSituacionRef.opciones_propuestas,
    comentarioAsesor: reconstructComentario(run),
    maxCycles: run.maxCycles,
    maxClarifications: run.maxClarifications,
    hallazgosOntologia: [],
    accionNext: undefined,
    retrievedChunks: [],
    borrador: undefined,
    cycle: run.cycle,
    especialistaUsado: undefined,
    ciclos: run.ciclos,
    status: "running",
    resultado: undefined,
  };

  const updated = await driveGraph(runId, initialState);
  return { ok: true, run: updated };
}

export async function respondToRun(runId: string, respuesta: string): Promise<AdvanceRunResult> {
  const run = await queries.getRunById(runId);
  if (!run) return { ok: false, reason: "not_found" };
  if (run.status !== "needs_clarification") return { ok: false, reason: "invalid_state", status: run.status };

  const pending = await queries.getPendingClarification(runId);
  if (!pending) return { ok: false, reason: "no_pending_question" };

  await queries.answerClarification(pending.id, respuesta);

  const updated = await driveGraph(runId, new Command({ resume: respuesta }));
  return { ok: true, run: updated };
}

export async function getRun(runId: string) {
  return queries.getRunById(runId);
}

export async function getPendingQuestion(runId: string): Promise<string | undefined> {
  const pending = await queries.getPendingClarification(runId);
  return pending?.pregunta;
}
