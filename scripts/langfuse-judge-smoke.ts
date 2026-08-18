// Juez (LLM-as-judge), subpaso 1: circuito puro -- diseno_juez.md. Confirma
// las tres conexiones ANTES de meter la rúbrica: leer una traza de Langfuse,
// llamar al modelo del juez (Gemini), escribir un score de vuelta en
// Langfuse. Nada de rúbrica ni dimensiones todavía -- es el "hola mundo" del
// juez, hermano de langfuse-smoke.ts (conexión) y langfuse-trace-run.ts
// (captura), pero para el lado de LECTURA + escritura de scores, capacidad
// nueva en este repo.
//
// SDK de lectura/escritura: @langfuse/core (LangfuseAPIClient), el cliente
// REST tipado -- @langfuse/tracing y @langfuse/otel (los que ya usan
// langfuse-smoke.ts / langfuse-trace-run.ts) son capa de generación de spans
// vía OpenTelemetry, no exponen lectura. LangfuseAPIClient sí, con el mismo
// par de claves: se construye con `username: publicKey, password: secretKey,
// baseUrl` (mismo mapeo que usa internamente LangfuseSpanProcessor, ver
// node_modules/@langfuse/otel/dist/index.cjs) y `environment: ""` (noop
// obligatorio del tipo cuando baseUrl ya está seteado).
//
// Esta llamada es una petición REST simple, awaited hasta su respuesta --a
// diferencia de los scripts que emiten spans por OpenTelemetry, acá no hay
// span processor ni batching de por medio, así que no hace falta
// forceFlush()/shutdown(): no hay nada en vuelo que perder al salir.
//
// Uso: npx tsx scripts/langfuse-judge-smoke.ts [traceId]
//   Sin argumento: toma la traza "consulta" más reciente. Con argumento: usa
//   ese id de traza DE LANGFUSE (el que se ve en la URL del dashboard o en
//   `client.trace.list()`) -- no confundir con nuestro propio campo
//   metadata.run_id (un UUID interno que colgamos nosotros dentro de la
//   traza, distinto del id que Langfuse le asigna a la traza en sí).

import { config } from "dotenv";
config({ path: ".env.local" });

import { LangfuseAPIClient } from "@langfuse/core";
import { getChatModel, getJudgeModelConfig } from "../src/config/models.js";

function getLangfuseConfig() {
  return {
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_BASE_URL,
  };
}

async function resolveTraceId(client: LangfuseAPIClient, traceIdArg: string | undefined): Promise<string> {
  if (traceIdArg) return traceIdArg;

  const { data } = await client.trace.list({ name: "consulta", limit: 1, orderBy: "timestamp.desc" });
  const mostRecent = data[0];
  if (!mostRecent) {
    throw new Error(
      "No hay ninguna traza 'consulta' en Langfuse todavía -- corré scripts/langfuse-trace-run.ts primero, " +
        "o pasá un id de traza explícito: npx tsx scripts/langfuse-judge-smoke.ts <traceId>.",
    );
  }
  return mostRecent.id;
}

async function main() {
  const { publicKey, secretKey, baseUrl } = getLangfuseConfig();
  if (!publicKey || !secretKey) {
    console.error(
      "Faltan LANGFUSE_PUBLIC_KEY y/o LANGFUSE_SECRET_KEY en .env.local -- completalas antes de correr este script.",
    );
    process.exitCode = 1;
    return;
  }

  const judgeConfig = getJudgeModelConfig();
  if (!judgeConfig.apiKey) {
    console.error(
      `Falta JUDGE_API_KEY en .env.local -- completala con una API key de ${judgeConfig.provider === "google" ? "Google AI Studio / Gemini" : judgeConfig.provider} antes de correr este script.`,
    );
    process.exitCode = 1;
    return;
  }

  const client = new LangfuseAPIClient({ baseUrl, username: publicKey, password: secretKey, environment: "" });

  // 1. LEER una traza real de Langfuse.
  let traceId: string;
  try {
    traceId = await resolveTraceId(client, process.argv[2]);
    const trace = await client.trace.get(traceId);
    const situacion = (trace.metadata as Record<string, unknown> | undefined)?.situacion;
    console.log(
      `[1/3] LEÍDO ok -- trace_id=${traceId}, situacion=${
        typeof situacion === "string" ? `"${situacion.slice(0, 80)}${situacion.length > 80 ? "…" : ""}"` : "(sin campo situacion en la metadata de esta traza)"
      }`,
    );
  } catch (err) {
    console.error("[1/3] LEÍDO fallo:", err);
    process.exitCode = 1;
    return;
  }

  // 2. LLAMAR al modelo del juez con un prompt trivial (sin rúbrica).
  let respuesta: string;
  try {
    const llm = getChatModel(judgeConfig, { maxTokens: 16, effort: "low" });
    const result = await llm.invoke([{ role: "user", content: "Responde únicamente con la palabra OK." }]);
    respuesta = typeof result.content === "string" ? result.content : JSON.stringify(result.content);
    console.log(`[2/3] LLAMADO ok -- modelo=${judgeConfig.model} (${judgeConfig.provider}), respuesta="${respuesta.trim()}"`);
  } catch (err) {
    console.error("[2/3] LLAMADO fallo:", err);
    process.exitCode = 1;
    return;
  }

  // 3. ESCRIBIR un score de prueba de vuelta en la traza leída.
  try {
    const score = await client.scores.create({
      traceId,
      name: "smoke-juez",
      value: 1,
      comment: `circuito de prueba -- el juez (${judgeConfig.model}) respondió: "${respuesta.trim()}"`,
    });
    console.log(`[3/3] ESCRITO ok -- score_id=${score.id} en trace_id=${traceId}.`);
  } catch (err) {
    console.error("[3/3] ESCRITO fallo:", err);
    process.exitCode = 1;
    return;
  }

  console.log("Circuito puro del juez completo. Verificá en el dashboard de Langfuse que el score 'smoke-juez' aparece en la traza.");
}

await main();
