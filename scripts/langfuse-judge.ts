// Juez (LLM-as-judge), subpaso 2: evaluación real con la rúbrica completa --
// diseno_juez.md, rubrica_juez.md. Evolución de langfuse-judge-smoke.ts (que
// solo confirmó el circuito leer/llamar/escribir): esta versión arma el
// prompt del juez a partir de la rúbrica real (tronco común + ficha del
// especialista activado), evalúa UNA traza con Gemini vía structured output,
// y escribe un score CATEGÓRICO por dimensión en Langfuse. Todavía UNA sola
// traza -- nada de lote, ver diseno_juez.md §6 (pendiente de fontanería).
//
// Uso: npx tsx scripts/langfuse-judge.ts [traceId]
//   Sin argumento: toma la traza "consulta" más reciente (hoy, ideacion-001).
//   Con argumento: usa ese id de traza DE LANGFUSE (no confundir con
//   metadata.run_id, nuestro propio campo interno -- ver nota en
//   langfuse-judge-smoke.ts).
//
// Uso: npx tsx scripts/langfuse-judge.ts --print [traceId]
//   Modo de solo lectura: relee los scores YA escritos de una traza (vía
//   LangfuseAPIClient) y los reimprime con su razonamiento completo, sin
//   volver a llamar al juez -- para revisar un caso ya evaluado sin gastar
//   otra llamada a Gemini. No requiere JUDGE_API_KEY.
//
// Uso: npx tsx scripts/langfuse-judge.ts --caso <archivo.json>
//   Subpaso 3: evaluación DIRECTA de un caso fabricado a mano (misma forma
//   que el juez ya extrae de una traza: especialista/situacion/respuesta,
//   ver scripts/casos-prueba/ideacion-alucinacion.json), sin leer NI escribir
//   nada en Langfuse -- solo imprime el veredicto en consola. Mismo prompt,
//   misma rúbrica, mismo Gemini que el modo normal; cambia únicamente de
//   dónde sale el caso. Pensado para probar que el juez discrimina (¿caza un
//   fallo fabricado a propósito?), sin ensuciar Langfuse con trazas
//   sintéticas. No requiere LANGFUSE_PUBLIC_KEY/_SECRET_KEY, sí JUDGE_API_KEY.
//
// Nota Windows: los errores de main() se señalan con `process.exitCode = 1;
// return;`, nunca `process.exit(1)` -- un `exit()` forzado mientras el fetch
// keep-alive de LangfuseAPIClient todavía está cerrando su socket dispara
// "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" en libuv (visto
// en vivo, Node 24 / Windows). Dejar que el proceso termine solo, con el
// código de salida ya seteado, evita la carrera.

import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { LangfuseAPIClient, NotFoundError } from "@langfuse/core";
import { getChatModel, getJudgeModelConfig } from "../src/config/models.js";
import { invokeStructured } from "../src/lib/structuredOutputRetry.js";
import { especialistaRoleSchema, type EspecialistaRole } from "../src/schemas.js";

const ESPECIALISTAS_RAG = new Set<EspecialistaRole>(["ideacion", "mvp", "pmf"]);

// --- 1. Rúbrica: parseo de rubrica_juez.md por encabezados "## " -------

function splitRubricaSections(raw: string): Map<string, string> {
  const lines = raw.split(/\r?\n/);
  const sections = new Map<string, string[]>();
  let current: string | null = null;

  for (const line of lines) {
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match) {
      current = match[1];
      sections.set(current, [line]);
    } else if (current !== null) {
      sections.get(current)!.push(line);
    }
  }
  return new Map([...sections].map(([heading, ls]) => [heading, ls.join("\n").trim()]));
}

type DimensionSpec = { id: string; etiqueta: string };

const DIMENSIONES_TRONCO: DimensionSpec[] = [
  { id: "enrutamiento", etiqueta: "Dimensión 1 — Enrutamiento" },
  { id: "correccion_metodologica", etiqueta: "Dimensión 2 — Corrección metodológica" },
  { id: "deteccion_riesgos", etiqueta: "Dimensión 3 — Detección de riesgos y anti-patrones" },
  { id: "fidelidad_fuente", etiqueta: "Dimensión 4 — Fidelidad a la fuente" },
];
const DIMENSION_ADECUACION_FASE: DimensionSpec = { id: "adecuacion_fase", etiqueta: "Dimensión 5a — Adecuación a fase" };
const DIMENSION_ADECUACION_DESAFIO: DimensionSpec = { id: "adecuacion_desafio", etiqueta: "Dimensión 5b — Adecuación al desafío" };
const DIMENSION_HONESTIDAD_EPISTEMICA: DimensionSpec = { id: "honestidad_epistemica", etiqueta: "Dimensión 6 — Honestidad epistémica" };

function dimensionesAplicables(especialista: EspecialistaRole): DimensionSpec[] {
  if (ESPECIALISTAS_RAG.has(especialista)) return [...DIMENSIONES_TRONCO, DIMENSION_ADECUACION_FASE];
  return [...DIMENSIONES_TRONCO, DIMENSION_ADECUACION_DESAFIO, DIMENSION_HONESTIDAD_EPISTEMICA];
}

// Tronco común (dims. 1-4) + cómo se emite el veredicto; para OKF, además la
// sección compartida del mecanismo Verified/Emerging (dim. 6, redactada una
// sola vez); y siempre la ficha del especialista activado (que ya trae
// embebida su 5a o 5b, y para OKF su línea específica de dim. 6).
function buildRubricaTexto(sections: Map<string, string>, especialista: EspecialistaRole): string {
  const partes: string[] = [];

  for (const [heading, body] of sections) {
    if (/^Dimensión [1-4] —/.test(heading) || heading === "Cómo emite el juez su veredicto") {
      partes.push(body);
    }
  }
  if (!ESPECIALISTAS_RAG.has(especialista)) {
    for (const [heading, body] of sections) {
      if (heading.startsWith("La dimensión 6")) partes.push(body);
    }
  }
  // No es igualdad exacta: "Ficha: pmf" en el fichero real es
  // "Ficha: pmf (encaje producto-mercado)" -- match por prefijo con límite
  // de palabra, no por el heading completo.
  const fichaPrefix = new RegExp(`^Ficha: ${especialista}\\b`);
  const fichaEntry = [...sections.entries()].find(([heading]) => fichaPrefix.test(heading));
  if (!fichaEntry) {
    throw new Error(`rubrica_juez.md: no se encontró la sección "## Ficha: ${especialista}"`);
  }
  partes.push(fichaEntry[1]);

  return partes.join("\n\n---\n\n");
}

// --- 2. Traza: lectura y extracción del contenido de calidad ------------

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
        "o pasá un id de traza explícito: npx tsx scripts/langfuse-judge.ts <traceId>.",
    );
  }
  return mostRecent.id;
}

const fuenteTrazaSchema = z.object({
  fuente_chunk_id: z.string(),
  fuente_cita: z.string().optional(),
  fuente_texto: z.string().optional(),
});
const recomendacionTrazaSchema = z.object({
  titulo: z.string(),
  detalle: z.string(),
  fuentes: z.array(fuenteTrazaSchema),
});
const respuestaTrazaSchema = z.array(recomendacionTrazaSchema);
type RespuestaTraza = z.infer<typeof respuestaTrazaSchema>;

type CasoAEvaluar = {
  traceId: string;
  especialista: EspecialistaRole;
  situacion: string;
  respuesta: RespuestaTraza;
};

// Forma de un archivo de caso fabricado a mano (--caso) -- misma forma que
// leerCaso() extrae de una traza real, más una nota libre de documentación
// del fallo inyectado (ignorada por el juez, solo para el humano que lee la
// consola).
const casoArchivoSchema = z.object({
  especialista: especialistaRoleSchema,
  situacion: z.string(),
  respuesta: respuestaTrazaSchema,
  _nota_prueba: z.string().optional(),
});

function leerCasoDeArchivo(rutaArchivo: string): { caso: CasoAEvaluar; notaPrueba: string | undefined } {
  const raw = JSON.parse(readFileSync(rutaArchivo, "utf8"));
  const parsed = casoArchivoSchema.parse(raw);
  return {
    caso: { traceId: `(caso local: ${rutaArchivo})`, especialista: parsed.especialista, situacion: parsed.situacion, respuesta: parsed.respuesta },
    notaPrueba: parsed._nota_prueba,
  };
}

async function leerCaso(client: LangfuseAPIClient, traceId: string): Promise<CasoAEvaluar> {
  const trace = await client.trace.get(traceId);

  const situacion = (trace.metadata as Record<string, unknown> | undefined)?.situacion;
  if (typeof situacion !== "string") {
    throw new Error(
      "La traza no tiene metadata.situacion -- ¿fue capturada como caso de prueba (es_prueba=true) con " +
        "scripts/langfuse-trace-run.ts tras el commit 15a4911 (captura de calidad)?",
    );
  }

  // especialista_usado vive tanto en el span "orchestrator" (accion_next
  // recién decidida) como en "validator" (mismo valor, confirmado al cerrar
  // el ciclo) -- cualquiera de los dos alcanza, se prueba orchestrator
  // primero por ser el primero en el árbol.
  const especialistaRaw = trace.observations
    .map((o) => (o.metadata as Record<string, unknown> | undefined)?.especialista_usado)
    .find((v): v is string => typeof v === "string");
  const especialista = especialistaRoleSchema.parse(especialistaRaw);

  const specialistObs = trace.observations.find((o) => o.name === "specialist");
  const respuestaRaw = (specialistObs?.metadata as Record<string, unknown> | undefined)?.respuesta;
  if (!respuestaRaw) {
    throw new Error(
      "El span 'specialist' de la traza no tiene metadata.respuesta -- mismo requisito que situacion arriba.",
    );
  }
  const respuesta = respuestaTrazaSchema.parse(respuestaRaw);

  return { traceId, especialista, situacion, respuesta };
}

// --- 3. Prompt del juez y structured output ------------------------------

const SYSTEM_PROMPT = `Eres el juez de calidad (LLM-as-judge) de Startup-Next. Evalúas, DESPUÉS de que el sistema ya respondió, si esa respuesta fue buena -- no decides nada en producción, es una señal para el análisis humano.

Para cada dimensión de la lista que se te da:
1. Razona primero (breve): qué observás en la respuesta respecto a esa dimensión, contrastando la situación del fundador, las fuentes citadas (con su texto íntegro) y la ficha del especialista.
2. Puntuá: PASS, PASS_PARCIAL o FAIL, según la graduación que define cada dimensión en la rúbrica.
3. Justificá en una frase por qué esa puntuación.

Evaluá EXACTAMENTE las dimensiones listadas, ni una más ni una menos, usando el identificador exacto que se te da para cada una en el campo "dimension". No emitas una nota global: cada dimensión se reporta por separado.`;

function buildRespuestaSeccion(respuesta: RespuestaTraza): string {
  return respuesta
    .map((r, i) => {
      const fuentes = r.fuentes
        .map((f) => `    - fuente_chunk_id: ${f.fuente_chunk_id}\n      fuente_cita: ${f.fuente_cita ?? "(sin cita)"}\n      fuente_texto: ${f.fuente_texto ?? "(sin texto -- posible cita sin fuente real)"}`)
        .join("\n");
      return `${i + 1}. ${r.titulo}\n   ${r.detalle}\n   Fuentes:\n${fuentes || "    (ninguna fuente citada)"}`;
    })
    .join("\n\n");
}

function buildUserPrompt(caso: CasoAEvaluar, rubricaTexto: string, dims: DimensionSpec[]): string {
  return [
    "RÚBRICA APLICABLE (tronco común + ficha del especialista activado):",
    rubricaTexto,
    "",
    "DIMENSIONES A EVALUAR (evaluar exactamente estas, una por una, usando este identificador exacto en 'dimension'):",
    ...dims.map((d) => `- ${d.id}  (${d.etiqueta})`),
    "",
    "CASO A EVALUAR:",
    `Especialista activado: ${caso.especialista}`,
    "",
    "Situación del fundador:",
    caso.situacion,
    "",
    "Respuesta generada (recomendaciones y sus fuentes):",
    buildRespuestaSeccion(caso.respuesta),
  ].join("\n");
}

const veredictoSchema = z.enum(["PASS", "PASS_PARCIAL", "FAIL"]);

function buildJudgeDecisionSchema(dims: DimensionSpec[]) {
  const ids = dims.map((d) => d.id) as [string, ...string[]];
  return z.object({
    evaluaciones: z
      .array(
        z.object({
          dimension: z.enum(ids).describe("El identificador exacto de la dimensión evaluada, tal como se te dio -- no inventes ni renombres."),
          razonamiento: z.string().describe("Cadena de pensamiento breve: qué observás en la respuesta respecto a esta dimensión."),
          veredicto: veredictoSchema,
          justificacion: z.string().describe("Justificación de una frase de por qué ese veredicto."),
        }),
      )
      .length(dims.length),
  });
}

type Evaluacion = z.infer<ReturnType<typeof buildJudgeDecisionSchema>>["evaluaciones"][number];

// Arma tronco + ficha para un especialista, leyendo rubrica_juez.md del
// disco -- compartido entre el modo normal (traza real) y --caso (archivo
// local): la rúbrica es la misma sin importar de dónde vino el caso.
function buildRubricaParaEspecialista(especialista: EspecialistaRole): { dims: DimensionSpec[]; rubricaTexto: string } {
  const raw = readFileSync(join(process.cwd(), "rubrica_juez.md"), "utf8");
  const sections = splitRubricaSections(raw);
  const dims = dimensionesAplicables(especialista);
  const rubricaTexto = buildRubricaTexto(sections, especialista);
  return { dims, rubricaTexto };
}

// Llama a Gemini con structured output (misma capa de reparación que el
// resto del repo) e imprime cada veredicto -- compartido entre el modo
// normal y --caso; solo cambia si el llamador después escribe scores.
async function evaluarConGemini(caso: CasoAEvaluar, judgeConfig: ReturnType<typeof getJudgeModelConfig>, dims: DimensionSpec[], rubricaTexto: string): Promise<Evaluacion[]> {
  const schema = buildJudgeDecisionSchema(dims);
  const llm = getChatModel(judgeConfig, { maxTokens: 8192, effort: "medium" }).withStructuredOutput(schema, {
    name: "evaluar_dimensiones",
    includeRaw: true,
  });
  const decision = await invokeStructured(schema, "judgeDecisionSchema", () =>
    llm.invoke([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(caso, rubricaTexto, dims) },
    ]),
  );

  for (const ev of decision.evaluaciones) {
    const dim = dims.find((d) => d.id === ev.dimension);
    imprimirVeredicto(dim?.etiqueta ?? ev.dimension, ev.veredicto, ev.justificacion, ev.razonamiento);
  }
  console.log();
  return decision.evaluaciones;
}

// --- 4. Escritura de scores (categóricos -- Langfuse los soporta nativos) -

// value=el veredicto en sí (string), dataType="CATEGORICAL": más fiel a la
// rúbrica que mapear a un número (PASS=1/PARCIAL=0.5/FAIL=0 perdería la
// distinción semántica sin ganar nada, y Langfuse ya sabe graficar
// categóricos). El razonamiento completo va en metadata (no en comment, que
// es la justificación de una frase) para no perder la cadena de pensamiento.
async function escribirScore(client: LangfuseAPIClient, traceId: string, dim: DimensionSpec, ev: Evaluacion) {
  return client.scores.create({
    traceId,
    name: ev.dimension,
    value: ev.veredicto,
    dataType: "CATEGORICAL",
    comment: ev.justificacion,
    metadata: { razonamiento: ev.razonamiento, etiqueta: dim.etiqueta },
  });
}

// Da un mensaje más útil que el 404 crudo de la API cuando el id de traza no
// existe -- el error real que lo motivó: un usuario pasó "ideacion-001" (el
// nombre informal que usamos en la conversación para el caso de prueba), no
// el id real que Langfuse le asigna a la traza (un hash, visible en la URL
// del dashboard o en la salida de scripts/langfuse-trace-run.ts).
function describirErrorDeTraza(err: unknown, traceIdArg: string | undefined): string {
  if (err instanceof NotFoundError && traceIdArg) {
    return (
      `No existe ninguna traza con id "${traceIdArg}" en Langfuse. Ese id no es un nombre informal de caso ` +
      `(como "ideacion-001") ni nuestro metadata.run_id interno -- es el id que Langfuse le asigna a la traza ` +
      `en sí (un hash largo, visible en la URL del dashboard: /traces/<id>). Corré el script sin argumento de ` +
      `traza para usar la más reciente, o copiá el id real desde el dashboard.`
    );
  }
  return `Fallo leyendo la traza: ${err}`;
}

// --- 5. Impresión legible (lectura humana, sin ir al dashboard) ---------

// "Dimensión 4 — Fidelidad a la fuente" -> "FIDELIDAD A LA FUENTE".
function tituloDimension(etiqueta: string): string {
  return etiqueta.replace(/^Dimensión \S+ — /, "").toUpperCase();
}

function imprimirVeredicto(etiqueta: string, veredicto: string, justificacion: string, razonamiento: string): void {
  const titulo = tituloDimension(etiqueta);
  console.log(`\n── ${titulo} ${"─".repeat(Math.max(3, 48 - titulo.length))}`);
  console.log(`Veredicto: ${veredicto}`);
  console.log(`Justificación: ${justificacion}`);
  console.log(`Razonamiento: ${razonamiento}`);
}

// Modo --print: relee los scores ya escritos (client.trace.get ya los trae
// en trace.scores) y los reimprime con el mismo formato, sin llamar al juez.
async function modoImprimir(client: LangfuseAPIClient, traceIdArg: string | undefined): Promise<void> {
  const traceId = await resolveTraceId(client, traceIdArg);
  const trace = await client.trace.get(traceId);
  const categoricos = trace.scores.filter((s) => s.dataType === "CATEGORICAL");

  if (categoricos.length === 0) {
    console.log(`La traza ${traceId} no tiene scores categóricos del juez todavía -- corré "npx tsx scripts/langfuse-judge.ts ${traceId}" primero (sin --print).`);
    return;
  }

  console.log(`Veredictos ya escritos para la traza ${traceId} (${categoricos.length} dimensiones), releídos sin llamar a Gemini:`);
  for (const s of categoricos) {
    const metadata = s.metadata as Record<string, unknown> | undefined;
    const etiqueta = typeof metadata?.etiqueta === "string" ? metadata.etiqueta : s.name;
    const razonamiento = typeof metadata?.razonamiento === "string" ? metadata.razonamiento : "(sin razonamiento en la metadata del score)";
    imprimirVeredicto(etiqueta, s.stringValue, s.comment ?? "(sin justificación)", razonamiento);
  }
  console.log();
}

// Modo --caso: evalúa un caso fabricado a mano, leído de un archivo local
// (misma forma que leerCaso() extrae de una traza). Reusa exactamente la
// misma rúbrica/prompt/Gemini que el modo normal (buildRubricaParaEspecialista
// + evaluarConGemini) -- NO lee ni escribe nada en Langfuse.
async function modoCaso(rutaArchivo: string, judgeConfig: ReturnType<typeof getJudgeModelConfig>): Promise<void> {
  const { caso, notaPrueba } = leerCasoDeArchivo(rutaArchivo);
  if (notaPrueba) console.log(`Nota de prueba: ${notaPrueba}\n`);
  console.log(`[1/2] CASO cargado ok -- ${rutaArchivo}, especialista=${caso.especialista}, ${caso.respuesta.length} recomendaciones (sin leer de Langfuse).`);

  const { dims, rubricaTexto } = buildRubricaParaEspecialista(caso.especialista);
  console.log(`      RÚBRICA armada ok -- tronco + ficha "${caso.especialista}", ${dims.length} dimensiones aplicables: ${dims.map((d) => d.id).join(", ")}.`);

  const evaluaciones = await evaluarConGemini(caso, judgeConfig, dims, rubricaTexto);
  console.log(`[2/2] EVALUADO ok -- modelo=${judgeConfig.model} (${judgeConfig.provider}), ${evaluaciones.length} veredictos (arriba).`);
  console.log("\nCaso local evaluado. NADA se leyó ni se escribió en Langfuse -- este veredicto vive solo en esta consola.");
}

async function main() {
  const args = process.argv.slice(2);
  const printOnly = args[0] === "--print";
  const casoLocal = args[0] === "--caso";
  const traceIdArg = printOnly ? args[1] : casoLocal ? undefined : args[0];

  // --caso no toca Langfuse en absoluto (ni lectura ni escritura) -- se
  // resuelve antes de exigir LANGFUSE_PUBLIC_KEY/_SECRET_KEY, que este modo
  // no necesita.
  if (casoLocal) {
    const rutaArchivo = args[1];
    if (!rutaArchivo) {
      console.error("Uso: npx tsx scripts/langfuse-judge.ts --caso <archivo.json>");
      process.exitCode = 1;
      return;
    }
    const judgeConfig = getJudgeModelConfig();
    if (!judgeConfig.apiKey) {
      console.error(`Falta JUDGE_API_KEY en .env.local -- completala con una API key de ${judgeConfig.provider === "google" ? "Google AI Studio / Gemini" : judgeConfig.provider} antes de correr este script.`);
      process.exitCode = 1;
      return;
    }
    try {
      await modoCaso(rutaArchivo, judgeConfig);
    } catch (err) {
      console.error("Fallo evaluando el caso local:", err);
      process.exitCode = 1;
    }
    return;
  }

  const { publicKey, secretKey, baseUrl } = getLangfuseConfig();
  if (!publicKey || !secretKey) {
    console.error("Faltan LANGFUSE_PUBLIC_KEY y/o LANGFUSE_SECRET_KEY en .env.local -- completalas antes de correr este script.");
    process.exitCode = 1;
    return;
  }

  const client = new LangfuseAPIClient({ baseUrl, username: publicKey, password: secretKey, environment: "" });

  if (printOnly) {
    try {
      await modoImprimir(client, traceIdArg);
    } catch (err) {
      console.error(describirErrorDeTraza(err, traceIdArg));
      process.exitCode = 1;
    }
    return;
  }

  const judgeConfig = getJudgeModelConfig();
  if (!judgeConfig.apiKey) {
    console.error(`Falta JUDGE_API_KEY en .env.local -- completala con una API key de ${judgeConfig.provider === "google" ? "Google AI Studio / Gemini" : judgeConfig.provider} antes de correr este script.`);
    process.exitCode = 1;
    return;
  }

  let caso: CasoAEvaluar;
  try {
    const traceId = await resolveTraceId(client, traceIdArg);
    caso = await leerCaso(client, traceId);
    console.log(`[1/4] LEÍDO ok -- trace_id=${caso.traceId}, especialista=${caso.especialista}, ${caso.respuesta.length} recomendaciones.`);
  } catch (err) {
    console.error("[1/4] LEÍDO fallo:", describirErrorDeTraza(err, traceIdArg));
    process.exitCode = 1;
    return;
  }

  let rubricaTexto: string;
  let dims: DimensionSpec[];
  try {
    ({ dims, rubricaTexto } = buildRubricaParaEspecialista(caso.especialista));
    console.log(`[2/4] RÚBRICA armada ok -- tronco + ficha "${caso.especialista}", ${dims.length} dimensiones aplicables: ${dims.map((d) => d.id).join(", ")}.`);
  } catch (err) {
    console.error("[2/4] RÚBRICA fallo:", err);
    process.exitCode = 1;
    return;
  }

  let evaluaciones: Evaluacion[];
  try {
    evaluaciones = await evaluarConGemini(caso, judgeConfig, dims, rubricaTexto);
    console.log(`[3/4] EVALUADO ok -- modelo=${judgeConfig.model} (${judgeConfig.provider}), ${evaluaciones.length} veredictos (arriba).`);
  } catch (err) {
    console.error("[3/4] EVALUADO fallo:", err);
    process.exitCode = 1;
    return;
  }

  try {
    for (const ev of evaluaciones) {
      const dim = dims.find((d) => d.id === ev.dimension)!;
      const score = await escribirScore(client, caso.traceId, dim, ev);
      console.log(`[4/4] ESCRITO ok -- ${ev.dimension}=${ev.veredicto} (score_id=${score.id})`);
    }
  } catch (err) {
    console.error("[4/4] ESCRITO fallo:", err);
    process.exitCode = 1;
    return;
  }

  console.log(`\nEvaluación completa de la traza ${caso.traceId}. Verificá los ${evaluaciones.length} scores en el dashboard de Langfuse.`);
}

await main();
