// Especialista de plataformas: segunda implementación real del mecanismo
// OKF-grafo (diseno_mecanismo_okf_grafo.md), después de escalado -- mismo
// patrón estructural exacto que escalado.ts/mvp.ts/ideacion.ts/pmf.ts.
// Recupera contexto navegando el grafo de conceptos OKF de Platform Scale
// (Sangeet Paul Choudary) en vez de buscar por similitud vectorial en
// rag_chunks. Reusa specialistDecisionSchema sin cambios (agnóstico de
// contenido) y toda la infraestructura compartida (structuredOutputRetry,
// config/models).
//
// No se sanean acá los ids citados por el modelo: el validador es quien
// debe detectar una cita inventada (calidad_y_fuentes) comparando contra
// los conceptos realmente recuperados -- mismo criterio que el resto de
// los especialistas.

import { getChatModel, getSpecialistModelConfig } from "../config/models.js";
import { invokeStructured } from "../lib/structuredOutputRetry.js";
import { retrieveOkfConcepts } from "../okf/retrieval.js";
import type { RetrievedOkfConcept } from "../okf/types.js";
import { specialistDecisionSchema, type AccionNext, type Borrador, type ValidacionCiclo } from "../schemas.js";
import type { RetrievedChunk } from "../db/ragQueries.js";

const ESPECIALISTA = "plataformas";

const SYSTEM_PROMPT = `Eres el especialista de plataformas de Startup-Next. Tu trabajo es generar recomendaciones concretas y accionables para la acción prioritaria que te asignó el orquestador, fundamentadas en los conceptos recuperados del marco de Platform Scale (Sangeet Paul Choudary): la interacción central, la pila de la plataforma, el motor Pull-Facilitate-Match, la resolución del huevo y la gallina, el lienzo de la plataforma, el marco TRIE, el valor acumulativo, la matriz de tracción-fricción y los efectos de red inversos.

Tu foco es el negocio como plataforma: dos o más lados de mercado, efectos de red, y las dinámicas específicas de diseñar, arrancar y escalar un ecosistema multifacético -- no la estrategia de crecimiento de un negocio lineal (eso es responsabilidad del especialista de escalado) ni la operación interna del día a día (eso es responsabilidad del especialista de operaciones).

Reglas:
- Cada recomendación debe estar respaldada por al menos un concepto de los provistos -- cita su id en fuentes_citadas.
- No inventes conceptos ni cites ids que no te hayan sido provistos.
- Si algún concepto recuperado marca "[Conocimiento emergente, no validado]" en su cita, trátalo con la misma cautela al redactar: no lo presentes con la misma autoridad que un concepto validado.
- Si ningún concepto recuperado es realmente relevante, dilo en el detalle en vez de forzar una cita que no corresponde -- puedes dejar fuentes_citadas vacío para esa recomendación.
- Si recibes la validación de un ciclo anterior rechazado, corrige específicamente lo que falló -- no repitas el mismo borrador.`;

function buildConceptsSection(concepts: RetrievedOkfConcept[]): string {
  if (concepts.length === 0) {
    return "No se recuperaron conceptos relevantes del marco de Platform Scale para esta consulta.";
  }
  return concepts
    .map((c) => `id: ${c.conceptId}\n${c.sourceCitation}\n${c.texto}`)
    .join("\n\n---\n\n");
}

export async function runPlataformasSpecialist(
  accionNext: AccionNext,
  feedbackValidacion?: ValidacionCiclo,
): Promise<{ borrador: Borrador; retrievedChunks: RetrievedChunk[]; retrievedConcepts: RetrievedOkfConcept[] }> {
  const concepts = await retrieveOkfConcepts(ESPECIALISTA, accionNext);

  const llm = getChatModel(getSpecialistModelConfig(), { maxTokens: 2048, effort: "medium" }).withStructuredOutput(
    specialistDecisionSchema,
    { name: "generar_borrador", includeRaw: true },
  );

  const userContent = [
    `accion_next: "${accionNext.titulo}" — ${accionNext.descripcion}`,
    `justificacion: ${accionNext.justificacion}`,
    feedbackValidacion && !feedbackValidacion.aprobado
      ? `El ciclo anterior fue rechazado. fidelidad_a_la_accion: ${feedbackValidacion.fidelidad_a_la_accion.notas}`
      : "",
    "",
    "Conceptos recuperados de Platform Scale:",
    buildConceptsSection(concepts),
  ]
    .filter(Boolean)
    .join("\n");

  const decision = await invokeStructured(specialistDecisionSchema, "specialistDecisionSchema", () =>
    llm.invoke([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ]),
  );

  const borrador: Borrador = {
    resumen_estrategia: decision.resumen_estrategia,
    recomendaciones: decision.recomendaciones.map((r) => ({
      titulo: r.titulo,
      detalle: r.detalle,
      fuentes: r.fuentes_citadas,
    })),
    consideraciones_metodologicas: accionNext.hallazgos_ontologia,
  };

  return { borrador, retrievedChunks: [], retrievedConcepts: concepts };
}
