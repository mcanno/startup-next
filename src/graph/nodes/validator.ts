import { getChatModel, getValidatorModelConfig } from "../../config/models.js";
import type { RetrievedChunk } from "../../db/ragQueries.js";
import { invokeStructured } from "../../lib/structuredOutputRetry.js";
import { translateOkfFuentes } from "../../okf/retrieval.js";
import type { RetrievedOkfConcept } from "../../okf/types.js";
import {
  validatorDecisionSchema,
  type Borrador,
  type Ciclo,
  type HallazgoOntologia,
  type InformeFinal,
} from "../../schemas.js";
import type { StartupNextStateType } from "../state.js";

const SYSTEM_PROMPT = `Eres el validador de Startup-Next. Juzgas si el borrador que produjo el especialista es aceptable, en dos dimensiones:

1. fidelidad_a_la_accion: ¿el borrador atiende efectivamente la accion_next que le asignó el orquestador, o se desvía hacia otra cosa?
2. coherencia_ontologia: ¿el borrador es coherente con los hallazgos ya conocidos de la ontología para esta startup? Si hay hallazgos activos que el borrador contradice o ignora sin abordarlos, no cumple.

No evalúes calidad de redacción — eso queda diferido hasta que aparezca evidencia real de que hace falta (sección 4). La verificación de fuentes (¿las citas vienen de chunks realmente recuperados?) se resuelve en código, no la juzgues tú.`;

// calidad_y_fuentes real: pertenencia de conjunto, hecho determinístico —
// no vale la pena otra llamada a Claude para verificar algo que el código
// ya puede comprobar con exactitud (sección 4).
//
// Unión de RAG (chunkId) + OKF (conceptId) -- un especialista RAG deja
// retrievedConcepts en [] y uno OKF deja retrievedChunks en [], nunca
// ambos poblados a la vez (diseno_mecanismo_okf_grafo.md, Punto 6.3), así
// que la unión nunca mezcla ids de dos mecanismos distintos en la
// práctica, solo evita tener que ramificar por especialista acá.
function checkCalidadYFuentes(
  borrador: Borrador,
  retrievedChunks: RetrievedChunk[],
  retrievedConcepts: RetrievedOkfConcept[],
): { cumple: boolean; notas: string } {
  const validIds = new Set([...retrievedChunks.map((c) => c.chunkId), ...retrievedConcepts.map((c) => c.conceptId)]);
  const inventadas = borrador.recomendaciones
    .flatMap((r) => r.fuentes)
    .filter((id) => !validIds.has(id));

  if (inventadas.length > 0) {
    return {
      cumple: false,
      notas: `El borrador cita ${inventadas.length} fuente(s) que no vienen de los chunks/conceptos recuperados en esta búsqueda: ${inventadas.join(", ")}.`,
    };
  }
  return { cumple: true, notas: "todas las fuentes citadas provienen de chunks/conceptos realmente recuperados." };
}

// El chunk_id/concept_id es detalle interno — informe_final (lo que ve el
// fundador) lleva citas legibles: armadas con la metadata de rag_chunks
// para RAG, o el linaje OKF (translateOkfFuentes) para escalado. Prueba
// primero como chunk, si no resuelve prueba como concepto -- nunca ambos
// a la vez en la práctica (ver nota de checkCalidadYFuentes arriba).
function translateFuentes(
  ids: string[],
  retrievedChunks: RetrievedChunk[],
  retrievedConcepts: RetrievedOkfConcept[],
): string[] {
  const byId = new Map(retrievedChunks.map((c) => [c.chunkId, c]));
  const chunkCitas = ids
    .map((id) => byId.get(id))
    .filter((chunk): chunk is RetrievedChunk => Boolean(chunk))
    .map((chunk) => [chunk.libro, chunk.capitulo, chunk.seccion].filter(Boolean).join(" — "));

  const conceptIds = ids.filter((id) => !byId.has(id));
  return [...chunkCitas, ...translateOkfFuentes(conceptIds, retrievedConcepts)];
}

function buildInformeFinal(
  borrador: Borrador,
  retrievedChunks: RetrievedChunk[],
  retrievedConcepts: RetrievedOkfConcept[],
  aprobado: boolean,
): InformeFinal {
  return {
    recomendaciones: borrador.recomendaciones.map((r) => ({
      titulo: r.titulo,
      detalle: r.detalle,
      fuentes: translateFuentes(r.fuentes, retrievedChunks, retrievedConcepts),
    })),
    consideraciones_metodologicas: borrador.consideraciones_metodologicas,
    aprobado,
  };
}

export async function validatorNode(state: StartupNextStateType): Promise<Partial<StartupNextStateType>> {
  if (!state.accionNext || !state.borrador) {
    throw new Error("validatorNode invocado sin accion_next/borrador resueltos");
  }
  // Ligados a locales angostados: la guarda de arriba no sobrevive dentro
  // del closure que pasa a invokeStructured (TS no puede probar que state
  // no cambia entre la guarda y la ejecución del closure).
  const accionNext = state.accionNext;
  const borrador = state.borrador;

  const llm = getChatModel(getValidatorModelConfig(), { maxTokens: 1024, effort: "low" }).withStructuredOutput(
    validatorDecisionSchema,
    { name: "evaluar_ciclo", includeRaw: true },
  );

  // ontology-engine es TBox puro (sin ABox de ninguna startup real, ver
  // diseno_ontology_engine_solo_consulta.md) — no hay hallazgos reales
  // contra los que verificar coherencia.
  const hallazgosOntologia: HallazgoOntologia[] = [];

  const decision = await invokeStructured(validatorDecisionSchema, "validatorDecisionSchema", () =>
    llm.invoke([
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          `accion_next asignada: "${accionNext.titulo}" — ${accionNext.descripcion}`,
          `justificacion del orquestador: ${accionNext.justificacion}`,
          "",
          "Borrador del especialista:",
          ...borrador.recomendaciones.map((r) => `- ${r.titulo}: ${r.detalle}`),
          "",
          "Hallazgos activos de la ontología para esta startup:",
          hallazgosOntologia.length > 0
            ? hallazgosOntologia.map((h) => `- ${h.rule_id}: ${h.hallazgos}`).join("\n")
            : "(ninguno)",
        ].join("\n"),
      },
    ]),
  );

  const calidadYFuentes = checkCalidadYFuentes(state.borrador, state.retrievedChunks, state.retrievedConcepts);
  const aprobado = decision.fidelidad_cumple && decision.coherencia_cumple && calidadYFuentes.cumple;

  const validacion = {
    aprobado,
    fidelidad_a_la_accion: { cumple: decision.fidelidad_cumple, notas: decision.fidelidad_notas },
    coherencia_ontologia: { cumple: decision.coherencia_cumple, hallazgos_ontologia: hallazgosOntologia },
    calidad_y_fuentes: calidadYFuentes,
    observaciones: aprobado
      ? "ciclo aprobado"
      : "ciclo rechazado: ver fidelidad_a_la_accion / coherencia_ontologia / calidad_y_fuentes",
  };

  const cycle = state.cycle + 1;
  const ciclo: Ciclo = {
    cycle,
    accion_decidida: state.accionNext,
    especialista: accionNext.especialista_requerido,
    borrador: state.borrador,
    validacion,
    created_at: new Date().toISOString(),
  };

  const patch: Partial<StartupNextStateType> = {
    ciclos: [ciclo],
    cycle,
    especialistaUsado: accionNext.especialista_requerido,
  };

  if (validacion.aprobado) {
    patch.status = "approved";
    patch.resultado = {
      informe_final: buildInformeFinal(state.borrador, state.retrievedChunks, state.retrievedConcepts, true),
    };
  } else if (cycle >= state.maxCycles) {
    patch.status = "max_cycles_reached";
    patch.resultado = {
      informe_final: buildInformeFinal(state.borrador, state.retrievedChunks, state.retrievedConcepts, false),
      no_respuesta: buildNoRespuestaOntologia([...state.ciclos, ciclo]),
    };
  }

  return patch;
}

function buildNoRespuestaOntologia(ciclos: Ciclo[]) {
  const todosHallazgos = ciclos.flatMap((c) => c.validacion.coherencia_ontologia.hallazgos_ontologia);
  const counts = new Map<string, number>();
  for (const h of todosHallazgos) counts.set(h.rule_id, (counts.get(h.rule_id) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];

  // Orden de prioridad (sección 2): (1) hallazgo de ontología recurrente,
  // (2) notas reales de la dimensión que efectivamente falló, nunca un
  // texto genérico inventado.
  const ultimaValidacion = ciclos[ciclos.length - 1]?.validacion;
  let motivo: string;
  if (top) {
    motivo = `La ontología marca "${top[0]}" activa de forma recurrente (${top[1]} de ${ciclos.length} ciclos) y ningún borrador logró resolver esa contradicción.`;
  } else if (ultimaValidacion && !ultimaValidacion.fidelidad_a_la_accion.cumple) {
    motivo = `El especialista no logró producir un borrador que atienda la acción asignada: ${ultimaValidacion.fidelidad_a_la_accion.notas}`;
  } else if (ultimaValidacion && !ultimaValidacion.calidad_y_fuentes.cumple) {
    motivo = `El especialista no logró respaldar sus recomendaciones con fuentes reales: ${ultimaValidacion.calidad_y_fuentes.notas}`;
  } else {
    motivo = ultimaValidacion?.observaciones ?? "no se logró armonizar las dimensiones del validador.";
  }

  return {
    tipo: "ontologia" as const,
    motivo_principal: motivo,
    hallazgos_ontologia: todosHallazgos,
    ciclos_intentados: ciclos.length,
  };
}
