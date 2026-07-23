import { interrupt } from "@langchain/langgraph";
import { getChatModel, getOrchestratorModelConfig } from "../../config/models.js";
import { invokeStructured } from "../../lib/structuredOutputRetry.js";
import {
  orchestratorDecisionSchema,
  type AccionNext,
  type ConflictoComentarioAsesor,
  type HallazgoOntologia,
  type OpcionPropuesta,
  type OrchestratorDecision,
  type Resultado,
} from "../../schemas.js";
import type { StartupNextStateType } from "../state.js";
import {
  buildHallazgosPrerequisitoGenerico,
  evaluarConflictoModoBase,
  getPrerequisitosParaEspecialista,
  resolveOntologyContext,
  type OntologyContext,
} from "./orchestratorModoBase.js";

const SYSTEM_PROMPT = `Eres el orquestador de Startup-Next. Tu trabajo es decidir, entre las opciones propuestas por el informe de situación de una startup, cuál es la acción prioritaria a trabajar ahora — sopesando el comentario del asesor humano (si existe) y el estado metodológico real de la startup (hallazgos de la ontología Lean Startup).

Reglas:
- Antes que cualquier otra cosa: evalúa si las opciones propuestas describen una tarea o intención de negocio real de una startup. Si ninguna opción es reconocible como tal (por ejemplo, el contenido es una factura, un documento no relacionado, texto corrupto o sin sentido, o cualquier cosa que no sea una posible acción vinculada a construir/operar una startup), marca peticion_incoherente=true y explica en motivo_incoherencia qué identificaste en la entrada que no corresponde a una tarea reconocible — no completes el resto de los campos (elegido_id, especialista_requerido, justificacion, conflicto_detectado, etc.) en ese caso. Esto NO es lo mismo que ambigüedad: una tarea real pero vaga o difícil de priorizar no es peticion_incoherente, es candidata a necesita_aclaracion.
- La ontología es una restricción dura: si el comentario del asesor sugiere priorizar una dirección que contradice un hallazgo activo de la ontología, no la adoptes sin más — marca el conflicto explícitamente (conflicto_detectado, conflicto_rule_id, conflicto_descripcion) y prioriza igual según el estado metodológico.
- Si hay ambigüedad real (opciones empatadas en importancia, comentario del asesor ambiguo o contradictorio consigo mismo), no fuerces una elección: pide una aclaración con necesita_aclaracion=true y una pregunta concreta.
- Si se te indica que ya no quedan rondas de aclaración disponibles, tienes que resolver igual con la información que tengas — no vuelvas a pedir una aclaración.
- especialista_requerido debe ser el rol que mejor atiende la acción elegida: ideacion, mvp, financiacion, modelo_negocio, escalado, organizacion, o administracion.`;

function buildUserPrompt(
  opciones: OpcionPropuesta[],
  comentario: StartupNextStateType["comentarioAsesor"],
  ontologyContext: OntologyContext,
  intercambios: string[],
  forzarDecision: boolean,
): string {
  const partes: string[] = [];

  partes.push("Opciones propuestas por el informe de situación:");
  for (const o of opciones) {
    partes.push(`- id="${o.id}" | ${o.titulo}: ${o.resumen}`);
  }

  if (comentario) {
    partes.push("\nComentario del asesor humano:");
    partes.push(`texto: "${comentario.texto}"`);
    if (comentario.autor) partes.push(`autor: ${comentario.autor}`);
    if (comentario.aplica_a?.length) partes.push(`aplica_a: ${comentario.aplica_a.join(", ")}`);
    if (comentario.tags?.length) partes.push(`tags: ${comentario.tags.join(", ")}`);
  } else {
    partes.push("\nNo hay comentario del asesor — el fundador pide prioridad sin opinión humana.");
  }

  if (ontologyContext.mode === "enriquecido") {
    partes.push("\nHallazgos activos de la ontología para esta startup:");
    partes.push(
      ontologyContext.hallazgos.length > 0
        ? ontologyContext.hallazgos.map((h) => `- ${h.rule_id}: ${h.hallazgos}`).join("\n")
        : "(ninguno — no hay reglas activas sobre esta startup ahora mismo)",
    );
  } else {
    partes.push(
      "\nModo base: no hay hechos reales registrados para esta startup en la ontología. No evalúes conflicto_detectado contra hallazgos — no los hay todavía. Elegí igual la mejor opción según el comentario del asesor y el sentido metodológico general.",
    );
  }

  if (intercambios.length > 0) {
    partes.push("\nRondas de aclaración previas con el fundador/Hermes:");
    intercambios.forEach((respuesta, i) => partes.push(`Respuesta ${i + 1}: ${respuesta}`));
  }

  if (forzarDecision) {
    partes.push(
      "\nYa se agotaron las rondas de aclaración disponibles. Resuelve con lo que tienes — no pidas otra aclaración.",
    );
  }

  return partes.join("\n");
}

function buildAccionNext(
  decision: OrchestratorDecision,
  opciones: OpcionPropuesta[],
  hallazgosOntologia: HallazgoOntologia[],
  conflicto: ConflictoComentarioAsesor,
  resueltoSinAclaracionCompleta: boolean,
): AccionNext {
  const elegido = opciones.find((o) => o.id === decision.elegido_id) ?? opciones[0];
  const especialistaRequerido = decision.especialista_requerido ?? "mvp";

  return {
    id: elegido.id,
    titulo: elegido.titulo,
    descripcion: elegido.resumen,
    justificacion: decision.justificacion ?? "",
    opciones_descartadas: opciones.filter((o) => o.id !== elegido.id).map((o) => o.id),
    validado_contra_ontologia: hallazgosOntologia.length === 0,
    hallazgos_ontologia: hallazgosOntologia,
    conflicto_comentario_asesor: conflicto,
    especialista_requerido: especialistaRequerido,
    especialista_disponible: especialistaRequerido === "mvp" || especialistaRequerido === "ideacion",
    ...(resueltoSinAclaracionCompleta ? { resuelto_sin_aclaracion_completa: true } : {}),
  };
}

function buildResultadoSinEspecialista(especialistaRequerido: string): Resultado {
  return {
    no_respuesta: {
      tipo: "sin_especialista",
      especialista_faltante: especialistaRequerido,
      motivo_principal: `la acción prioritaria requiere el especialista de ${especialistaRequerido}, que todavía no está implementado en esta fase`,
      hallazgos_ontologia: [],
      ciclos_intentados: 0,
    },
  };
}

function buildResultadoPeticionIncoherente(motivoIncoherencia: string | undefined): Resultado {
  return {
    no_respuesta: {
      tipo: "peticion_incoherente",
      motivo_principal: motivoIncoherencia ?? "el documento no contiene una recomendación ni tarea identificable de startup",
      hallazgos_ontologia: [],
      ciclos_intentados: 0,
    },
  };
}

// Conflicto del comentario del asesor en modo enriquecido viene del mismo
// LLM call principal (juicio contra hechos reales, sin cambios respecto al
// Hito 2/3). En modo base no hay hechos contra los que ese juicio tenga
// sentido — se resuelve aparte, en resolveConflictoYHallazgos.
function conflictoDesdeDecisionPrincipal(decision: OrchestratorDecision): ConflictoComentarioAsesor {
  return decision.conflicto_detectado
    ? {
        detectado: true,
        rule_id: decision.conflicto_rule_id ?? "desconocido",
        descripcion: decision.conflicto_descripcion ?? "",
      }
    : { detectado: false };
}

// Solo en modo base: el concepto ancla depende de especialista_requerido,
// que recién se conoce después de la decisión principal — por eso
// prerequisitos y el conflicto contra ellos se resuelven acá, no antes.
async function resolveConflictoYHallazgos(
  ontologyContext: OntologyContext,
  decision: OrchestratorDecision,
  accionElegida: { titulo: string; descripcion: string },
  comentarioAsesor: StartupNextStateType["comentarioAsesor"],
  hallazgosEnriquecido: HallazgoOntologia[],
): Promise<{ hallazgos: HallazgoOntologia[]; conflicto: ConflictoComentarioAsesor }> {
  if (ontologyContext.mode === "enriquecido") {
    return { hallazgos: hallazgosEnriquecido, conflicto: conflictoDesdeDecisionPrincipal(decision) };
  }

  const especialistaRequerido = decision.especialista_requerido ?? "mvp";
  const prerequisitos = await getPrerequisitosParaEspecialista(especialistaRequerido);
  const hallazgos = buildHallazgosPrerequisitoGenerico(prerequisitos);

  if (!comentarioAsesor || prerequisitos.length === 0) {
    return { hallazgos, conflicto: { detectado: false } };
  }

  const evaluacion = await evaluarConflictoModoBase(accionElegida, comentarioAsesor, prerequisitos);
  const conflicto: ConflictoComentarioAsesor = evaluacion.detectado
    ? { detectado: true, rule_id: "PREREQUISITO_GENERICO", descripcion: evaluacion.descripcion }
    : { detectado: false };
  return { hallazgos, conflicto };
}

export async function orchestratorNode(
  state: StartupNextStateType,
): Promise<Partial<StartupNextStateType>> {
  // Reentrada tras rechazo del validador: la prioridad ya fue decidida y
  // validada contra la ontología al principio del run. Lo que necesita
  // mejorar en un reintento es la ejecución del especialista, no la
  // elección de qué trabajar — pass-through sin LLM.
  if (state.accionNext) {
    return {};
  }

  const ontologyContext = await resolveOntologyContext(state.startupId);

  const llm = getChatModel(getOrchestratorModelConfig(), { maxTokens: 2048, effort: "medium" }).withStructuredOutput(
    orchestratorDecisionSchema,
    { name: "decidir_accion_next", includeRaw: true },
  );

  const intercambios: string[] = [];

  for (;;) {
    const forzarDecision = intercambios.length >= state.maxClarifications;
    const decision = await invokeStructured(orchestratorDecisionSchema, "orchestratorDecisionSchema", () =>
      llm.invoke([
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: buildUserPrompt(state.opciones, state.comentarioAsesor, ontologyContext, intercambios, forzarDecision),
        },
      ]),
    );

    if (decision.peticion_incoherente) {
      return {
        status: "peticion_incoherente",
        resultado: buildResultadoPeticionIncoherente(decision.motivo_incoherencia),
      };
    }

    if (!decision.necesita_aclaracion || forzarDecision) {
      const elegido = state.opciones.find((o) => o.id === decision.elegido_id) ?? state.opciones[0];
      const hallazgosEnriquecido = ontologyContext.mode === "enriquecido" ? ontologyContext.hallazgos : [];
      const { hallazgos, conflicto } = await resolveConflictoYHallazgos(
        ontologyContext,
        decision,
        { titulo: elegido.titulo, descripcion: elegido.resumen },
        state.comentarioAsesor,
        hallazgosEnriquecido,
      );

      const accionNext = buildAccionNext(decision, state.opciones, hallazgos, conflicto, forzarDecision);
      const disponible = accionNext.especialista_disponible;
      return {
        accionNext,
        hallazgosOntologia: hallazgos,
        status: disponible ? "running" : "sin_especialista",
        resultado: disponible ? undefined : buildResultadoSinEspecialista(accionNext.especialista_requerido),
      };
    }

    const respuesta = interrupt<{ pregunta: string }, string>({
      pregunta: decision.pregunta ?? "¿Cuál opción debería priorizarse?",
    });
    intercambios.push(respuesta);
  }
}
