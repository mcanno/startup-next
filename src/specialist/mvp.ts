// Especialista real de MVP: busca contexto relevante en rag_chunks
// (embedding de la consulta vía Voyage, similitud por coseno) y genera el
// borrador con Claude — reemplaza src/specialist/mvpMock.ts del Hito 1/2.
//
// No se sanean acá los chunk_ids citados por el modelo: el validador es
// quien debe detectar una cita inventada (calidad_y_fuentes) comparando
// contra los chunks realmente recuperados — filtrarlos acá taparía
// justo lo que esa dimensión del validador tiene que atrapar.

import { getChatModel, getSpecialistModelConfig } from "../config/models.js";
import { searchRagChunks, type RetrievedChunk } from "../db/ragQueries.js";
import { invokeStructured } from "../lib/structuredOutputRetry.js";
import { embedQuery } from "../lib/voyage.js";
import { specialistDecisionSchema, type AccionNext, type Borrador, type ValidacionCiclo } from "../schemas.js";

const ESPECIALISTA = "mvp";

const SYSTEM_PROMPT = `Sos el especialista de MVP de Startup-Next. Tu trabajo es generar recomendaciones concretas y accionables para la acción prioritaria que te asignó el orquestador, fundamentadas en los fragmentos recuperados de los libros base (Business Model Canvas, Customer Development, Lean Startup).

Reglas:
- Cada recomendación debe estar respaldada por al menos un fragmento de los provistos — citá su chunk_id en chunk_ids_citados.
- No inventes fragmentos ni cites chunk_ids que no te hayan sido provistos.
- Si ningún fragmento recuperado es realmente relevante, decilo en el detalle en vez de forzar una cita que no corresponde — podés dejar chunk_ids_citados vacío para esa recomendación.
- Si recibís la validación de un ciclo anterior rechazado, corregí específicamente lo que falló — no repitas el mismo borrador.`;

function buildQueryText(accionNext: AccionNext, feedbackValidacion?: ValidacionCiclo): string {
  const partes = [accionNext.titulo, accionNext.descripcion, accionNext.justificacion];
  if (feedbackValidacion && !feedbackValidacion.aprobado) {
    partes.push(feedbackValidacion.fidelidad_a_la_accion.notas);
  }
  return partes.join(" — ");
}

function buildChunksSection(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return "No se recuperaron fragmentos relevantes del corpus para esta consulta.";
  }
  return chunks
    .map((c) => {
      const ubicacion = [c.libro, c.capitulo, c.seccion].filter(Boolean).join(" — ");
      return `chunk_id: ${c.chunkId}\n${ubicacion}\n${c.texto}`;
    })
    .join("\n\n---\n\n");
}

export async function runMvpSpecialist(
  accionNext: AccionNext,
  feedbackValidacion?: ValidacionCiclo,
): Promise<{ borrador: Borrador; retrievedChunks: RetrievedChunk[] }> {
  const queryEmbedding = await embedQuery(buildQueryText(accionNext, feedbackValidacion));
  const chunks = await searchRagChunks(queryEmbedding, ESPECIALISTA);

  const llm = getChatModel(getSpecialistModelConfig(), { maxTokens: 2048, effort: "medium" }).withStructuredOutput(
    specialistDecisionSchema,
    { name: "generar_borrador" },
  );

  const userContent = [
    `accion_next: "${accionNext.titulo}" — ${accionNext.descripcion}`,
    `justificacion: ${accionNext.justificacion}`,
    feedbackValidacion && !feedbackValidacion.aprobado
      ? `El ciclo anterior fue rechazado. fidelidad_a_la_accion: ${feedbackValidacion.fidelidad_a_la_accion.notas}`
      : "",
    "",
    "Fragmentos recuperados:",
    buildChunksSection(chunks),
  ]
    .filter(Boolean)
    .join("\n");

  const decision = await invokeStructured(() =>
    llm.invoke([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ]),
  );

  const borrador: Borrador = {
    // Interno por ahora (ver nota en schemas.ts) — se guarda en el
    // borrador auditable de cada ciclo, no se expone en informe_final.
    resumen_estrategia: decision.resumen_estrategia,
    recomendaciones: decision.recomendaciones.map((r) => ({
      titulo: r.titulo,
      detalle: r.detalle,
      fuentes: r.chunk_ids_citados,
    })),
    consideraciones_metodologicas: accionNext.hallazgos_ontologia,
  };

  return { borrador, retrievedChunks: chunks };
}
