// Especialista de operaciones: tercera implementación real del mecanismo
// OKF-grafo (diseno_mecanismo_okf_grafo.md), después de escalado y
// plataformas -- mismo patrón estructural exacto. Recupera contexto
// navegando el grafo de conceptos OKF de "startup nativa de IA" (Kim &
// Koning, Odewahn, Roberts, Dans) en vez de buscar por similitud vectorial
// en rag_chunks. Reusa specialistDecisionSchema sin cambios (agnóstico de
// contenido) y toda la infraestructura compartida (structuredOutputRetry,
// config/models).
//
// Primer especialista con fuente status: Emerging (no Verified) -- el
// marcador "[Conocimiento emergente, no validado]" que antepone
// buildSourceCitation() (src/okf/retrieval.ts, Punto 5 del diseño) se
// ejercita acá por primera vez con datos reales, no un override sintético.
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

const ESPECIALISTA = "operaciones";

const SYSTEM_PROMPT = `Eres el especialista de operaciones de Startup-Next. Tu trabajo es generar recomendaciones concretas y accionables para la acción prioritaria que te asignó el orquestador, fundamentadas en los conceptos recuperados del marco de startup nativa de IA: el canal de producto de la IA, la capa experta en inteligencia organizacional, la legibilidad organizacional para la IA, y la ontología empresarial optimizable.

Tu foco es cómo se organiza y ejecuta el trabajo interno una vez el negocio funciona (procesos, estructura, adopción de IA en la operación) -- no la estrategia de crecimiento externo (eso es responsabilidad del especialista de escalado) ni la validación de mercado (eso es responsabilidad del especialista de pmf).

Reglas:
- Cada recomendación debe estar respaldada por al menos un concepto de los provistos -- cita su id en fuentes_citadas.
- No inventes conceptos ni cites ids que no te hayan sido provistos.
- Los conceptos de este marco son conocimiento emergente, todavía no validado con el mismo rigor que otras fuentes del sistema -- sus citas van a llegar marcadas como tal ante el fundador. Trátalos con cautela al redactar: no los presentes con la misma autoridad que un hallazgo consolidado, y no ocultes esa incertidumbre en el detalle de la recomendación.
- Si ningún concepto recuperado es realmente relevante, dilo en el detalle en vez de forzar una cita que no corresponde -- puedes dejar fuentes_citadas vacío para esa recomendación.
- Si recibes la validación de un ciclo anterior rechazado, corrige específicamente lo que falló -- no repitas el mismo borrador.`;

function buildConceptsSection(concepts: RetrievedOkfConcept[]): string {
  if (concepts.length === 0) {
    return "No se recuperaron conceptos relevantes del marco de startup nativa de IA para esta consulta.";
  }
  return concepts
    .map((c) => `id: ${c.conceptId}\n${c.sourceCitation}\n${c.texto}`)
    .join("\n\n---\n\n");
}

export async function runOperacionesSpecialist(
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
    "Conceptos recuperados de startup nativa de IA:",
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
