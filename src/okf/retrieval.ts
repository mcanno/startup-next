// Orquesta loader + graph para producir la lista final de RetrievedOkfConcept
// a inyectar en el prompt de un especialista OKF -- diseno_mecanismo_okf_grafo.md,
// Punto 4 (selección de ancla, BFS acotado, serialización) y Punto 5
// (formato de cita/atribución).

import { getChatModel, getSpecialistModelConfig } from "../config/models.js";
import { invokeStructured } from "../lib/structuredOutputRetry.js";
import { okfSeleccionAnclaSchema, type AccionNext, type EspecialistaRole } from "../schemas.js";
import { bfsFromAnchors, inducedSubgraph } from "./graph.js";
import { getOkfGraph } from "./loader.js";
import type { OkfConcept, RetrievedOkfConcept } from "./types.js";

// Solo estas 3 secciones se inyectan en el prompt -- se omite la 3
// (Componentes y Estructura, diagramas ASCII de bajo valor accionable para
// el modelo y costo de tokens no trivial, confirmado por inspección real
// de los 9 ficheros). Ver diseno_mecanismo_okf_grafo.md, Punto 4, Paso 4.
const PROMPT_SECTIONS = [1, 2, 4];

function splitSections(body: string): Map<number, string> {
  const lines = body.split("\n");
  const sections = new Map<number, string[]>();
  let current: number | null = null;

  for (const line of lines) {
    const match = /^##\s+(\d+)\./.exec(line);
    if (match) {
      current = Number(match[1]);
      sections.set(current, [line]);
    } else if (current !== null) {
      sections.get(current)!.push(line);
    }
  }

  return new Map([...sections].map(([n, ls]) => [n, ls.join("\n").trim()]));
}

export function extractPromptSections(body: string, include: number[] = PROMPT_SECTIONS): string {
  const sections = splitSections(body);
  return include
    .map((n) => sections.get(n))
    .filter((s): s is string => Boolean(s))
    .join("\n\n");
}

// Linaje legible (Punto 5): título del concepto + libro/autor de sources[0]
// -- ya presente en el frontmatter, no hay que inventar metadata nueva.
// Antepone el marcador fijo de "no validado" si el concepto es Emerging,
// mismo mecanismo ya usado para FRASE_ENCUADRE en orchestratorModoBase.ts.
export function buildSourceCitation(concept: OkfConcept): string {
  const source = concept.sources[0];
  const linaje = [source.title, source.authors.join(", "), concept.title].filter(Boolean).join(" — ");
  return concept.status === "Verified" ? linaje : `[Conocimiento emergente, no validado] ${linaje}`;
}

function toRetrievedConcept(concept: OkfConcept): RetrievedOkfConcept {
  return {
    conceptId: concept.id,
    title: concept.title,
    status: concept.status,
    sourceCitation: buildSourceCitation(concept),
    texto: extractPromptSections(concept.body),
  };
}

const ANCHOR_SYSTEM_PROMPT = `Eres un clasificador que elige, dentro de un conjunto cerrado de conceptos, cuáles anclan mejor una tarea de startup. Te dan el título y un resumen ejecutivo de cada concepto disponible, y una tarea concreta. Elegí 1 o 2 ids de concepto (nunca inventes ids que no estén en la lista) que mejor encuadren la tarea -- el resto del contexto se recupera navegando el grafo desde tu elección, así que preferí el concepto más específico y directamente relevante, no el más genérico.`;

function buildAnchorUserPrompt(accionNext: AccionNext, candidates: OkfConcept[]): string {
  const partes = [
    `Tarea: "${accionNext.titulo}" — ${accionNext.descripcion}`,
    `Justificación: ${accionNext.justificacion}`,
    "",
    "Conceptos disponibles:",
  ];
  for (const c of candidates) {
    const resumen = splitSections(c.body).get(1) ?? "";
    partes.push(`- id="${c.id}" | ${c.title}: ${resumen}`);
  }
  return partes.join("\n");
}

async function selectAnchors(accionNext: AccionNext, subgraph: Map<string, OkfConcept>): Promise<string[]> {
  const candidates = [...subgraph.values()];

  const llm = getChatModel(getSpecialistModelConfig(), { maxTokens: 256, effort: "low" }).withStructuredOutput(
    okfSeleccionAnclaSchema,
    { name: "seleccionar_ancla_okf", includeRaw: true },
  );

  const decision = await invokeStructured(okfSeleccionAnclaSchema, "okfSeleccionAnclaSchema", () =>
    llm.invoke([
      { role: "system", content: ANCHOR_SYSTEM_PROMPT },
      { role: "user", content: buildAnchorUserPrompt(accionNext, candidates) },
    ]),
  );

  // Nunca confiar ciegamente en que el modelo respetó "de los provistos" --
  // filtra cualquier id inventado antes de pasarlo a bfsFromAnchors (que ya
  // ignora anclas fuera del subgrafo con gracia, pero mejor no depender de
  // ese fallback silencioso para este caso esperado).
  return decision.conceptos_ancla.filter((id) => subgraph.has(id));
}

// Punto principal del módulo: dado el especialista y la accion_next, arma
// la lista final de conceptos a inyectar en su prompt. Si el especialista
// todavía no tiene conceptos OKF asignados (subgrafo vacío), degrada con
// gracia a [] -- mismo criterio que getPrerequisitos()/searchRagChunks()
// ante ausencia de datos, nunca un error.
export async function retrieveOkfConcepts(
  especialista: EspecialistaRole,
  accionNext: AccionNext,
): Promise<RetrievedOkfConcept[]> {
  const graph = getOkfGraph();
  const subgraph = inducedSubgraph(graph, especialista);
  if (subgraph.size === 0) return [];

  const anchors = await selectAnchors(accionNext, subgraph);
  if (anchors.length === 0) return [];

  const conceptIds = bfsFromAnchors(subgraph, anchors);
  return conceptIds.map((id) => toRetrievedConcept(subgraph.get(id)!));
}

// Usado por validator.ts (Punto 6.3): traduce concept_id -> cita legible,
// análogo a translateFuentes() para RAG pero con el linaje OKF (Punto 5).
export function translateOkfFuentes(conceptIds: string[], retrievedConcepts: RetrievedOkfConcept[]): string[] {
  const byId = new Map(retrievedConcepts.map((c) => [c.conceptId, c]));
  return conceptIds
    .map((id) => byId.get(id))
    .filter((c): c is RetrievedOkfConcept => Boolean(c))
    .map((c) => c.sourceCitation);
}
