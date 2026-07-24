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
} from "./orchestratorModoBase.js";
import { ESPECIALISTAS_IMPLEMENTADOS } from "../especialistasImplementados.js";

const SYSTEM_PROMPT = `Eres el orquestador de Startup-Next. Tu trabajo es decidir, entre las opciones propuestas por el informe de situación de una startup, cuál es la acción prioritaria a trabajar ahora — sopesando el comentario del asesor humano (si existe) y el estado metodológico real de la startup (hallazgos de la ontología Lean Startup).

Reglas:
- Antes que cualquier otra cosa: evalúa si las opciones propuestas describen una tarea o intención de negocio real de una startup. Si ninguna opción es reconocible como tal (por ejemplo, el contenido es una factura, un documento no relacionado, texto corrupto o sin sentido, o cualquier cosa que no sea una posible acción vinculada a construir/operar una startup), marca peticion_incoherente=true y explica en motivo_incoherencia qué identificaste en la entrada que no corresponde a una tarea reconocible — no completes el resto de los campos (elegido_id, especialista_requerido, justificacion, conflicto_detectado, etc.) en ese caso. Esto NO es lo mismo que ambigüedad: una tarea real pero vaga o difícil de priorizar no es peticion_incoherente, es candidata a necesita_aclaracion.
- La ontología es una restricción dura: si el comentario del asesor sugiere priorizar una dirección que contradice un hallazgo activo de la ontología, no la adoptes sin más — marca el conflicto explícitamente (conflicto_detectado, conflicto_rule_id, conflicto_descripcion) y prioriza igual según el estado metodológico.
- Si hay ambigüedad real (opciones empatadas en importancia, comentario del asesor ambiguo o contradictorio consigo mismo), no fuerces una elección: pide una aclaración con necesita_aclaracion=true y una pregunta concreta.
- Si se te indica que ya no quedan rondas de aclaración disponibles, tienes que resolver igual con la información que tengas — no vuelvas a pedir una aclaración.
- especialista_requerido debe ser el rol que mejor atiende la acción elegida, según estas fronteras:
  - ideacion: el problema, el cliente o el segmento todavía no están validados, o la tarea es diseñar/ajustar el modelo de negocio (Business Model Canvas) en su forma inicial — antes de construir nada.
  - mvp: construir y probar una primera versión real del producto (prototipado, experimentos, métricas), incluyendo decisiones de diseño sobre economías de escala del producto en sí — no todavía escalar el negocio.
  - pmf: ya existe un producto y clientes reales; la tarea es validar o mejorar el encaje producto-mercado (desarrollo de clientes en fase de validación, Jobs To Be Done) — no construir el producto por primera vez (eso es mvp) ni escalar (eso es escalado).
  - operaciones: cómo se organiza y ejecuta el trabajo interno una vez el negocio funciona (procesos, estructura, adopción de IA en la operación) — no la estrategia de crecimiento externo (escalado) ni la validación de mercado (pmf).
  - escalado: crecer de forma defendible una vez hay encaje producto-mercado (motor de crecimiento, contraposicionamiento, recursos protegidos) — no la operación interna del día a día (operaciones).
  - plataformas: el negocio en sí es una plataforma (dos o más lados de mercado, efectos de red, problema del huevo y la gallina). Es transversal: si la tarea trata específicamente la dinámica de plataforma (precios multi-lado, arranque de red), elegí plataformas aunque la startup también esté en fase de ideación o escalado; si no, clasificá por fase como de costumbre aunque el negocio sea una plataforma.`;

function buildUserPrompt(
  opciones: OpcionPropuesta[],
  comentario: StartupNextStateType["comentarioAsesor"],
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

  partes.push(
    "\nModo base: no hay hechos reales registrados para esta startup en la ontología. No evalúes conflicto_detectado contra hallazgos — no los hay todavía. Elegí igual la mejor opción según el comentario del asesor y el sentido metodológico general.",
  );

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
    especialista_disponible: ESPECIALISTAS_IMPLEMENTADOS.has(especialistaRequerido),
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

// El concepto ancla depende de especialista_requerido, que recién se
// conoce después de la decisión principal — por eso prerequisitos y el
// conflicto contra ellos se resuelven acá, no antes.
async function resolveConflictoYHallazgos(
  decision: OrchestratorDecision,
  accionElegida: { titulo: string; descripcion: string },
  comentarioAsesor: StartupNextStateType["comentarioAsesor"],
): Promise<{ hallazgos: HallazgoOntologia[]; conflicto: ConflictoComentarioAsesor }> {
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
          content: buildUserPrompt(state.opciones, state.comentarioAsesor, intercambios, forzarDecision),
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
      const { hallazgos, conflicto } = await resolveConflictoYHallazgos(
        decision,
        { titulo: elegido.titulo, descripcion: elegido.resumen },
        state.comentarioAsesor,
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
