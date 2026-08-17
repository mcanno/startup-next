// Fase 1, Paso 2 de diseno_observabilidad_evaluacion.md: instrumenta UNA
// ejecución real del grafo compilado (src/graph/index.ts) con un árbol de
// spans -- un span raíz "consulta" y un span hijo por cada paso del stream
// (uno por nodo que corre: orchestrator/specialist/validator, tantas veces
// como el ciclo especialista↔validador se repita). Solo campos de SALUD en
// la metadata (§2-3 del diseño) -- nada de situacion cruda, fuente_texto ni
// recomendaciones completas todavía (eso es "calidad", paso posterior).
//
// Reusa getGraph() tal cual -- el mismo objeto compilado que runsService.ts
// usa en producción -- para que la instrumentación sea fiel al grafo real,
// no una reimplementación de sus edges (orchestrator -> specialist ->
// validator -> [approved: END | max_cycles: END | si no, de vuelta a
// orchestrator]).
//
// Nota de precisión, con la misma honestidad epistémica que el resto del
// proyecto: streamMode "updates" entrega el resultado de un nodo cuando
// termina, no una señal de cuándo empieza. La "latencia" de cada span se
// aproxima por el tiempo entre la llegada de un chunk y el anterior --
// válido porque el grafo es secuencial (sin fan-out paralelo), pero no es
// un start/end exacto medido dentro del propio nodo.
//
// Marca es_prueba=true en el span raíz: hoy todo es prueba, pero deja el
// campo listo para que, cuando haya casos reales, sea trivial condicionar
// qué metadata se envía (cortafuegos de confidencialidad, §4 del diseño).
//
// Uso: npx tsx scripts/langfuse-trace-run.ts

import { config } from "dotenv";
config({ path: ".env.local" });

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { startActiveObservation, startObservation } from "@langfuse/tracing";
import { getGraph } from "../src/graph/index.js";
import { buildOpcionDesdeTextoLibre } from "../src/informes/parseOpciones.js";
import type { StartupNextStateType } from "../src/graph/state.js";

function getLangfuseConfig() {
  return {
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_BASE_URL,
  };
}

function getVersionSistema(): string {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
}

// Misma situación real de ideacion-001 (ver sesión de diseño de casos de
// prueba) -- caso simple, de un solo ciclo, ideal para confirmar el árbol
// de spans sin ruido de reintentos.
const SITUACION_PRUEBA =
  "Tengo una idea para una app de gestión de gastos para autónomos. Estoy convencido de que la necesitan. Aún no he hablado con ninguno ni he construido nada. ¿Cuál es mi siguiente paso?";

function buildInitialState(runId: string): StartupNextStateType {
  const opcion = buildOpcionDesdeTextoLibre(SITUACION_PRUEBA);
  return {
    runId,
    startupId: runId,
    opciones: [opcion],
    comentarioAsesor: undefined,
    maxCycles: 2,
    maxClarifications: 0,
    hallazgosOntologia: [],
    accionNext: undefined,
    retrievedChunks: [],
    retrievedConcepts: [],
    borrador: undefined,
    cycle: 0,
    especialistaUsado: undefined,
    ciclos: [],
    status: "running",
    resultado: undefined,
  };
}

// Extrae, por nodo, solo los campos de salud del esquema (§6 del diseño).
// Nunca situacion, fuente_texto ni recomendaciones completas -- eso queda
// para el paso de "calidad".
function buildHealthMetadata(nodeName: string, partial: Partial<StartupNextStateType>): Record<string, unknown> {
  if (nodeName === "orchestrator") {
    return {
      especialista_usado: partial.accionNext?.especialista_requerido,
      // "running" -> fue a especialista; "sin_especialista" / "peticion_incoherente" -> terminal sin especialista.
      enrutamiento: partial.status,
    };
  }
  if (nodeName === "specialist") {
    return {
      conceptos_recuperados: [
        ...(partial.retrievedChunks ?? []).map((c) => c.chunkId),
        ...(partial.retrievedConcepts ?? []).map((c) => c.conceptId),
      ],
      n_recomendaciones: partial.borrador?.recomendaciones.length,
    };
  }
  if (nodeName === "validator") {
    return {
      n_intentos: partial.cycle,
      status: partial.status,
      especialista_usado: partial.especialistaUsado,
    };
  }
  return {};
}

async function main() {
  const { publicKey, secretKey, baseUrl } = getLangfuseConfig();
  if (!publicKey || !secretKey) {
    console.error(
      "Faltan LANGFUSE_PUBLIC_KEY y/o LANGFUSE_SECRET_KEY en .env.local -- completalas antes de correr este script.",
    );
    process.exit(1);
  }

  const spanProcessor = new LangfuseSpanProcessor({ publicKey, secretKey, baseUrl, exportMode: "immediate" });
  const tracerProvider = new NodeTracerProvider({ spanProcessors: [spanProcessor] });
  tracerProvider.register();

  const runId = randomUUID();
  const versionSistema = getVersionSistema();
  const initialState = buildInitialState(runId);
  const startedAt = Date.now();
  let finalStatus = "running";
  let nodeCount = 0;

  try {
    await startActiveObservation("consulta", async (rootSpan) => {
      rootSpan.update({
        metadata: { run_id: runId, es_prueba: true, version_sistema: versionSistema },
      });

      const stream = await getGraph().stream(initialState, {
        configurable: { thread_id: runId },
        streamMode: "updates",
      });

      let lastChunkAt = Date.now();
      for await (const chunk of stream) {
        const now = Date.now();
        const latenciaMs = now - lastChunkAt;
        lastChunkAt = now;

        for (const [nodeName, partial] of Object.entries(chunk as Record<string, Partial<StartupNextStateType>>)) {
          nodeCount += 1;
          const nodeSpan = startObservation(
            nodeName,
            { metadata: { ...buildHealthMetadata(nodeName, partial), latencia_ms: latenciaMs } },
            { asType: "span" },
          );
          nodeSpan.end();

          if (partial.status) finalStatus = partial.status;
        }
      }

      rootSpan.update({
        metadata: {
          run_id: runId,
          es_prueba: true,
          version_sistema: versionSistema,
          status_final: finalStatus,
          latencia_total_ms: Date.now() - startedAt,
        },
      });
    });

    await spanProcessor.forceFlush();
    await spanProcessor.shutdown();
    console.log(
      `Traza 'consulta' enviada (run_id=${runId}, ${nodeCount} spans de nodo, status_final=${finalStatus}). ` +
        "Verificá el árbol en el dashboard de Langfuse (Traces).",
    );
  } catch (err) {
    console.error("Fallo instrumentando la ejecución:", err);
    await spanProcessor.shutdown().catch(() => {});
    process.exit(1);
  }
}

await main();
