// Especialista de gobernanza: cuarta implementación real del mecanismo
// OKF-grafo (diseno_mecanismo_okf_grafo.md), después de escalado,
// plataformas y operaciones -- mismo patrón estructural exacto. Recupera
// contexto navegando el grafo de conceptos OKF del modelo de arquitectura
// corporativa incorruptible (Eric Ries, "Incorruptible") en vez de buscar
// por similitud vectorial en rag_chunks. Reusa specialistDecisionSchema sin
// cambios (agnóstico de contenido) y toda la infraestructura compartida
// (structuredOutputRetry, config/models).
//
// A diferencia de operaciones (primer especialista Emerging), los 4
// conceptos de esta fuente son Verified: el libro es una fuente publicada
// con ISBN real, no una categoría todavía en formación. buildSourceCitation()
// (src/okf/retrieval.ts) no antepone el marcador de "no validado" para
// ninguna cita de este especialista.
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

const ESPECIALISTA = "gobernanza";

const SYSTEM_PROMPT = `Eres el especialista de gobernanza de Startup-Next. Tu trabajo es generar recomendaciones concretas y accionables para la acción prioritaria que te asignó el orquestador, fundamentadas en los conceptos recuperados del modelo de arquitectura corporativa incorruptible: la gravedad financiera, la gobernanza constitucional, la sociedad holding espiritual, y la síntesis de longevidad institucional que las integra.

Tu foco es la estructura legal/estatutaria de la empresa y cómo blindar su misión frente a la extracción de valor cortoplacista (composición y deber fiduciario del directorio, clases de acciones y derechos de voto, estructuras de holding o fideicomiso, resiliencia ante adquisiciones hostiles o presión de inversores) -- no el diseño del modelo de negocio en sí (eso es responsabilidad del especialista de ideacion) ni el motor de crecimiento del negocio (eso es responsabilidad del especialista de escalado).

Reglas:
- Cada recomendación debe estar respaldada por al menos un concepto de los provistos -- cita su id en fuentes_citadas.
- No inventes conceptos ni cites ids que no te hayan sido provistos.
- Si ningún concepto recuperado es realmente relevante, dilo en el detalle en vez de forzar una cita que no corresponde -- puedes dejar fuentes_citadas vacío para esa recomendación.
- Si recibes la validación de un ciclo anterior rechazado, corrige específicamente lo que falló -- no repitas el mismo borrador.`;

function buildConceptsSection(concepts: RetrievedOkfConcept[]): string {
  if (concepts.length === 0) {
    return "No se recuperaron conceptos relevantes del modelo de arquitectura corporativa incorruptible para esta consulta.";
  }
  return concepts
    .map((c) => `id: ${c.conceptId}\n${c.sourceCitation}\n${c.texto}`)
    .join("\n\n---\n\n");
}

export async function runGobernanzaSpecialist(
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
    "Conceptos recuperados del modelo de arquitectura corporativa incorruptible:",
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
