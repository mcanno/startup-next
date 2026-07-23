// Modo base del orquestador (diseno_startup_next.md, sección 8): desde la
// conversión de ontology-engine a servicio puramente de consulta (TBox
// only, ver diseno_ontology_engine_solo_consulta.md), este es el único
// modo que existe — no hay hechos reales de ninguna startup contra los
// que razonar, así que el orquestador siempre pregunta al TBox en
// abstracto ("¿qué precede metodológicamente a esta tarea?") vía
// GET /concepts/{id}/prerequisitos.
//
// Vive separado de orchestrator.ts porque la segunda llamada LLM de este
// archivo es un concern propio, no el flujo principal de decidir
// accion_next.

import { getChatModel, getModoBaseModelConfig } from "../../config/models.js";
import { getPrerequisitos, type Prerequisito } from "../../lib/ontologyEngine.js";
import { conceptLabel, relationLabel } from "../../lib/ontologyLabels.js";
import { invokeStructured } from "../../lib/structuredOutputRetry.js";
import {
  modoBaseConflictoSchema,
  type ComentarioAsesor,
  type EspecialistaRole,
  type HallazgoOntologia,
} from "../../schemas.js";

// Solo 3 de los 7 roles tienen ancla en el TBox hoy (investigación del
// paso 1): mvp y modelo_negocio son match directo, escalado es una
// aproximación ya señalada como tal. Los otros 4 quedan sin mapear a
// propósito — GET /concepts/{id}/prerequisitos ya devuelve [] con gracia
// para un concept_id que no existe, así que no hace falta manejarlos como
// caso especial acá.
const ESPECIALISTA_A_CONCEPTO: Partial<Record<EspecialistaRole, string>> = {
  mvp: "MVP",
  modelo_negocio: "BusinessModelCanvas",
  escalado: "EngineOfGrowth",
};

export async function getPrerequisitosParaEspecialista(especialista: EspecialistaRole): Promise<Prerequisito[]> {
  const conceptId = ESPECIALISTA_A_CONCEPTO[especialista];
  if (!conceptId) return [];
  return getPrerequisitos(conceptId);
}

// Frase de encuadre fija (siempre antepuesta): el fundador no debe leer
// esto como una evaluación de su startup real — en modo base no hay
// hechos concretos, es solo el orden metodológico genérico del TBox.
const FRASE_ENCUADRE =
  "Esto es información general sobre el orden metodológico habitual de esta tarea según Lean Startup — no es una evaluación de tu startup real, que en este modo Startup-Next no conoce.";

// Narrativa ordenada por distancia ascendente ("antes de esto, conviene
// haber hecho X; y antes de eso, Y"), con concept_id/relacion traducidos a
// español (lib/ontologyLabels.ts) en vez de exponer los ids técnicos crudos
// del TBox. Reemplaza el join plano anterior (concept_id/relacion/distancia
// en crudo) que era ilegible para el fundador.
function narrarPrerequisitos(prerequisitos: Prerequisito[]): string {
  const ordenados = [...prerequisitos].sort((a, b) => a.distancia - b.distancia);
  const pasos = ordenados.map((p, i) => {
    const conector = i === 0 ? "Antes de esto, conviene haber trabajado en" : "Y antes de eso";
    return `${conector}: ${conceptLabel(p.concept_id)} (relación: ${relationLabel(p.relacion)})`;
  });
  return `${FRASE_ENCUADRE} ${pasos.join(". ")}.`;
}

// Reusa hallazgos_ontologia con un rule_id sintético en vez de sumar un
// campo nuevo al contrato (decisión confirmada, sección 8) — un solo
// hallazgo que junta todos los prerrequisitos en una sola narrativa legible.
export function buildHallazgosPrerequisitoGenerico(prerequisitos: Prerequisito[]): HallazgoOntologia[] {
  if (prerequisitos.length === 0) return [];
  return [{ rule_id: "PREREQUISITO_GENERICO", hallazgos: narrarPrerequisitos(prerequisitos) }];
}

const MODO_BASE_SYSTEM_PROMPT = `Estás evaluando, en modo base (sin hechos reales de ninguna startup), si el comentario de un asesor humano podría no alinear con los prerrequisitos metodológicos genéricos de la tarea elegida — según la ontología Lean Startup, en abstracto.

No estás verificando contra el estado real de una startup (no lo hay). Esto es solo información para que el fundador/asesor reconcilien con lo que saben de su situación real — nunca un bloqueo. Si el comentario del asesor no contradice ni ignora los prerrequisitos listados, o si no hay tensión real, marca conflicto_detectado=false. Márcalo true solo si el comentario sugiere saltear o ignorar explícitamente algo que la metodología presupone como paso previo.`;

function buildModoBaseUserPrompt(
  accion: { titulo: string; descripcion: string },
  comentario: ComentarioAsesor,
  prerequisitos: Prerequisito[],
): string {
  return [
    `Tarea elegida: "${accion.titulo}" — ${accion.descripcion}`,
    "",
    `Comentario del asesor: "${comentario.texto}"`,
    "",
    "Prerrequisitos metodológicos genéricos de esta tarea (según el TBox, no hechos de esta startup):",
    prerequisitos.map((p) => `- ${p.concept_id} (vía ${p.relacion}, distancia ${p.distancia})`).join("\n"),
  ].join("\n");
}

// Solo se llama cuando ya hay algo concreto que comparar (comentario del
// asesor Y al menos un prerrequisito) — si falta cualquiera de los dos, no
// hay tensión posible que evaluar y no vale la pena el costo de una
// llamada LLM para devolver conflicto_detectado=false igual.
export async function evaluarConflictoModoBase(
  accion: { titulo: string; descripcion: string },
  comentario: ComentarioAsesor,
  prerequisitos: Prerequisito[],
): Promise<{ detectado: boolean; descripcion: string }> {
  const llm = getChatModel(getModoBaseModelConfig(), { maxTokens: 512, effort: "low" }).withStructuredOutput(
    modoBaseConflictoSchema,
    { name: "evaluar_conflicto_modo_base", includeRaw: true },
  );

  const decision = await invokeStructured(modoBaseConflictoSchema, "modoBaseConflictoSchema", () =>
    llm.invoke([
      { role: "system", content: MODO_BASE_SYSTEM_PROMPT },
      { role: "user", content: buildModoBaseUserPrompt(accion, comentario, prerequisitos) },
    ]),
  );

  return { detectado: decision.conflicto_detectado, descripcion: decision.conflicto_descripcion ?? "" };
}
