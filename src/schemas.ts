// Fuente de verdad de las formas del contrato (diseno_startup_next.md,
// secciones 1 y 2). Zod primero, tipos TS inferidos — no se escriben a
// mano ni se definen dos veces (sección 7: "estrategia de schemas").

import { z } from "zod";

export const opcionPropuestaSchema = z.object({
  id: z.string(),
  titulo: z.string(),
  resumen: z.string(),
});
export type OpcionPropuesta = z.infer<typeof opcionPropuestaSchema>;

export const informeSituacionRefSchema = z.object({
  report_id: z.uuid(),
  source: z.string(),
  opciones_propuestas: z.array(opcionPropuestaSchema).min(1),
});
export type InformeSituacionRef = z.infer<typeof informeSituacionRefSchema>;

export const comentarioAsesorSchema = z.object({
  texto: z.string(),
  autor: z.string().optional(),
  aplica_a: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});
export type ComentarioAsesor = z.infer<typeof comentarioAsesorSchema>;

export const requestedBySchema = z.enum(["app", "hermes"]);
export type RequestedBy = z.infer<typeof requestedBySchema>;

export const hallazgoOntologiaSchema = z.object({
  rule_id: z.string(),
  hallazgos: z.string(),
});
export type HallazgoOntologia = z.infer<typeof hallazgoOntologiaSchema>;

export const conflictoComentarioAsesorSchema = z.discriminatedUnion("detectado", [
  z.object({ detectado: z.literal(false) }),
  z.object({ detectado: z.literal(true), rule_id: z.string(), descripcion: z.string() }),
]);
export type ConflictoComentarioAsesor = z.infer<typeof conflictoComentarioAsesorSchema>;

export const especialistaRoleSchema = z.enum([
  "ideacion",
  "mvp",
  "pmf",
  "operaciones",
  "escalado",
  "plataformas",
]);
export type EspecialistaRole = z.infer<typeof especialistaRoleSchema>;

export const accionNextSchema = z.object({
  id: z.string(),
  titulo: z.string(),
  descripcion: z.string(),
  justificacion: z.string(),
  opciones_descartadas: z.array(z.string()),
  validado_contra_ontologia: z.boolean(),
  hallazgos_ontologia: z.array(hallazgoOntologiaSchema),
  conflicto_comentario_asesor: conflictoComentarioAsesorSchema,
  especialista_requerido: especialistaRoleSchema,
  especialista_disponible: z.boolean(),
  resuelto_sin_aclaracion_completa: z.boolean().optional(),
});
export type AccionNext = z.infer<typeof accionNextSchema>;

export const runStatusSchema = z.enum([
  "draft",
  "needs_clarification",
  "running",
  "approved",
  "max_cycles_reached",
  "sin_especialista",
  "peticion_incoherente",
  "failed",
]);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const validacionCicloSchema = z.object({
  aprobado: z.boolean(),
  fidelidad_a_la_accion: z.object({ cumple: z.boolean(), notas: z.string() }),
  coherencia_ontologia: z.object({
    cumple: z.boolean(),
    hallazgos_ontologia: z.array(hallazgoOntologiaSchema),
  }),
  calidad_y_fuentes: z.object({ cumple: z.boolean(), notas: z.string() }),
  observaciones: z.string(),
});
export type ValidacionCiclo = z.infer<typeof validacionCicloSchema>;

export const recomendacionSchema = z.object({
  titulo: z.string(),
  detalle: z.string(),
  fuentes: z.array(z.string()),
});
export type Recomendacion = z.infer<typeof recomendacionSchema>;

export const borradorSchema = z.object({
  // Interno — parte del borrador (auditable vía ciclos), no de
  // informe_final. Se promueve al contrato público solo si, al revisar
  // el contenido real de corridas de prueba, resulta que aporta algo que
  // el fundador necesita ver — no de forma especulativa ahora.
  resumen_estrategia: z.string(),
  recomendaciones: z.array(recomendacionSchema),
  consideraciones_metodologicas: z.array(hallazgoOntologiaSchema),
});
export type Borrador = z.infer<typeof borradorSchema>;

export const cicloSchema = z.object({
  cycle: z.number(),
  accion_decidida: accionNextSchema,
  especialista: z.string(),
  borrador: borradorSchema,
  validacion: validacionCicloSchema,
  created_at: z.string(),
});
export type Ciclo = z.infer<typeof cicloSchema>;

// omit(resumen_estrategia): informe_final es lo público, no hereda ese
// campo interno del borrador aunque ambos compartan el resto de la forma.
export const informeFinalSchema = borradorSchema.omit({ resumen_estrategia: true }).extend({
  aprobado: z.boolean(),
});
export type InformeFinal = z.infer<typeof informeFinalSchema>;

export const noRespuestaSchema = z.object({
  tipo: z.enum(["ontologia", "sin_especialista", "peticion_incoherente"]),
  especialista_faltante: z.string().optional(),
  motivo_principal: z.string(),
  hallazgos_ontologia: z.array(hallazgoOntologiaSchema),
  otros_motivos: z.array(z.string()).optional(),
  ciclos_intentados: z.number(),
});
export type NoRespuesta = z.infer<typeof noRespuestaSchema>;

export const resultadoSchema = z.object({
  informe_final: informeFinalSchema.optional(),
  no_respuesta: noRespuestaSchema.optional(),
});
export type Resultado = z.infer<typeof resultadoSchema>;

// --- Schemas "LLM-facing": subconjunto, no la forma completa (sección 7) ---
// El orquestador y el validador solo deciden una parte de accion_next /
// validacion; el resto (hallazgos_ontologia reales, opciones_descartadas,
// calidad_y_fuentes mock) lo completa el código a partir de datos ya
// conocidos, no se le pide de vuelta al modelo.

export const orchestratorDecisionSchema = z.object({
  peticion_incoherente: z
    .boolean()
    .describe(
      "True si ninguna opción propuesta describe una tarea o intención de negocio real identificable — no una tarea ambigua, sino la ausencia de una tarea de startup reconocible.",
    ),
  motivo_incoherencia: z
    .string()
    .optional()
    .describe("Solo si peticion_incoherente es true: qué se identificó en la entrada que no corresponde a una tarea de startup reconocible."),
  necesita_aclaracion: z.boolean(),
  pregunta: z
    .string()
    .optional()
    .describe("Solo si necesita_aclaracion es true: la pregunta a hacerle al fundador/Hermes."),
  elegido_id: z
    .string()
    .optional()
    .describe("Solo si necesita_aclaracion es false: el id de la opción priorizada."),
  justificacion: z
    .string()
    .optional()
    .describe("Por qué se priorizó esta opción, citando el comentario del asesor y/o el estado de la ontología."),
  especialista_requerido: especialistaRoleSchema
    .optional()
    .describe("Rol especialista que debe atender la acción elegida."),
  conflicto_detectado: z
    .boolean()
    .optional()
    .describe("True si el comentario del asesor sugiere una dirección que contradice un hallazgo activo de la ontología."),
  conflicto_rule_id: z.string().optional(),
  conflicto_descripcion: z.string().optional(),
});
export type OrchestratorDecision = z.infer<typeof orchestratorDecisionSchema>;

export const validatorDecisionSchema = z.object({
  fidelidad_cumple: z
    .boolean()
    .describe("True si el borrador atiende efectivamente la accion_next asignada, sin desviarse."),
  fidelidad_notas: z.string(),
  coherencia_cumple: z
    .boolean()
    .describe("True si el borrador es coherente con los hallazgos ya conocidos de la ontología (ninguno los contradice)."),
  coherencia_notas: z.string(),
});
export type ValidatorDecision = z.infer<typeof validatorDecisionSchema>;

// Al especialista se le dan los chunks ya recuperados (texto + chunk_id);
// no se le pide que los reproduzca, solo qué recomienda y qué chunk_ids
// de los provistos respaldan cada recomendación (para poder verificar
// después que no citó nada inventado).
export const specialistDecisionSchema = z.object({
  // Con un único campo de nivel superior (un array), Claude devolvía un
  // JSON doblemente serializado (el array como string anidado dentro de
  // otro objeto con la misma clave), rompiendo el parseo — verificado en
  // una corrida real. Este campo no es un workaround vacío: recorta la
  // superficie de nivel superior a más de una propiedad, y de paso queda
  // disponible como resumen ejecutivo para uso futuro si el contrato de
  // informe_final llega a necesitarlo.
  resumen_estrategia: z.string().describe("Resumen de una frase de la estrategia general detrás de las recomendaciones."),
  recomendaciones: z
    .array(
      z.object({
        titulo: z.string(),
        detalle: z.string(),
        fuentes_citadas: z
          .array(z.string())
          .describe(
            "ids de las fuentes recuperadas que respaldan esta recomendación (chunk_id de RAG o id de concepto OKF, según el especialista). Deben ser de las provistas, nunca inventadas.",
          ),
      }),
    )
    .min(1)
    .max(6),
});
export type SpecialistDecision = z.infer<typeof specialistDecisionSchema>;

// POST /informes/parse (PDF): el id de cada opción lo asigna el código
// después de la extracción (determinístico, sin riesgo de duplicados o
// formatos raros) — al modelo solo se le pide título y resumen, no un id.
//
// resumen_fuente no es un campo de relleno: con un único campo de nivel
// superior (solo "opciones"), Claude devolvía el array entero como un
// string JSON anidado bajo esa misma clave — mismo bug de doble
// serialización ya documentado en specialistDecisionSchema, verificado de
// nuevo acá con una corrida real. Un segundo campo evita que colapse todo
// en una sola clave, y de paso queda disponible como resumen ejecutivo del
// documento de origen.
export const informeParseDecisionSchema = z.object({
  resumen_fuente: z.string().describe("Resumen de una frase de qué trata el documento de origen."),
  opciones: z
    .array(
      z.object({
        titulo: z.string(),
        resumen: z.string(),
      }),
    )
    .min(1),
});
export type InformeParseDecision = z.infer<typeof informeParseDecisionSchema>;

// Segunda llamada, chica, del orquestador en modo base (sección 8): compara
// el comentario del asesor contra los prerrequisitos genéricos del TBox
// (no hechos reales — no los hay en este modo). Nunca bloquea ni fuerza,
// solo informa — por eso no hay campo "gravedad" ni nada que se parezca a
// una validación dura.
// Selección de ancla para el mecanismo OKF-grafo (diseno_mecanismo_okf_grafo.md,
// Punto 4, Paso 2): llamada chica sobre un conjunto cerrado y pequeño de
// conceptos (el subgrafo ya inducido para el especialista), mismo patrón
// que modoBaseConflictoSchema debajo -- no hace falta embeddings para
// elegir entre un puñado de opciones.
export const okfSeleccionAnclaSchema = z.object({
  conceptos_ancla: z
    .array(z.string())
    .min(1)
    .max(2)
    .describe("ids de los 1-2 conceptos OKF que mejor anclan la tarea, de los provistos. Nunca inventados."),
});
export type OkfSeleccionAncla = z.infer<typeof okfSeleccionAnclaSchema>;

export const modoBaseConflictoSchema = z.object({
  conflicto_detectado: z.boolean(),
  conflicto_descripcion: z
    .string()
    .optional()
    .describe("Solo si conflicto_detectado es true: por qué el comentario del asesor podría no alinear con los prerrequisitos metodológicos genéricos."),
});
export type ModoBaseConflicto = z.infer<typeof modoBaseConflictoSchema>;
