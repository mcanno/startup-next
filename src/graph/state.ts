import { Annotation } from "@langchain/langgraph";
import type { RetrievedChunk } from "../db/ragQueries.js";
import type { RetrievedOkfConcept } from "../okf/types.js";
import type {
  AccionNext,
  Borrador,
  Ciclo,
  ComentarioAsesor,
  HallazgoOntologia,
  OpcionPropuesta,
  Resultado,
  RunStatus,
} from "../schemas.js";

export const StartupNextState = Annotation.Root({
  runId: Annotation<string>,
  startupId: Annotation<string>,
  opciones: Annotation<OpcionPropuesta[]>,
  comentarioAsesor: Annotation<ComentarioAsesor | undefined>,
  maxCycles: Annotation<number>,
  maxClarifications: Annotation<number>,
  // Se refetch en cada nodo que lo necesita (orchestrator al decidir,
  // validator al chequear el borrador) — no se cachea una sola vez.
  hallazgosOntologia: Annotation<HallazgoOntologia[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  accionNext: Annotation<AccionNext | undefined>,
  // Transitorio: seteado por specialist, leído por validator dentro del
  // mismo ciclo (y, si el ciclo aprueba, usado para traducir chunk_id ->
  // cita legible al construir informe_final).
  borrador: Annotation<Borrador | undefined>,
  retrievedChunks: Annotation<RetrievedChunk[]>({ reducer: (_left, right) => right, default: () => [] }),
  // Análogo a retrievedChunks pero para especialistas OKF-grafo (ver
  // diseno_mecanismo_okf_grafo.md, Punto 6.1) -- un especialista RAG deja
  // esto en [] (default), uno OKF deja retrievedChunks en []. Nunca ambos
  // poblados a la vez: especialista_requerido resuelve a un único rol por
  // ciclo.
  retrievedConcepts: Annotation<RetrievedOkfConcept[]>({ reducer: (_left, right) => right, default: () => [] }),
  cycle: Annotation<number>({ reducer: (_left, right) => right, default: () => 0 }),
  especialistaUsado: Annotation<string | undefined>,
  ciclos: Annotation<Ciclo[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  status: Annotation<RunStatus>({ reducer: (_left, right) => right, default: () => "running" }),
  resultado: Annotation<Resultado | undefined>,
});

export type StartupNextStateType = typeof StartupNextState.State;
