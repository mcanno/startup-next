// Formas del formato OKF (Open Knowledge Format) tal como se importan a
// este repo -- ver diseno_mecanismo_okf_grafo.md. El frontmatter real de
// la fuente (TRABAJO/FUENTES/) no trae "---" de apertura en la mayoría de
// los ficheros ni el campo "especialistas" (agregado acá al importar,
// Punto 1 del diseño) -- este schema describe la forma YA NORMALIZADA que
// vive en okf/**/*.okf.md, no la fuente cruda.

import { z } from "zod";
import { especialistaRoleSchema } from "../schemas.js";

export const okfSourceSchema = z.object({
  resource: z.string(),
  title: z.string(),
  authors: z.array(z.string()),
  source_type: z.string(),
  extraction_method: z.string(),
});
export type OkfSource = z.infer<typeof okfSourceSchema>;

export const okfConceptFrontmatterSchema = z.object({
  id: z.string(),
  type: z.literal("Concept"),
  title: z.string(),
  version: z.string(),
  status: z.enum(["Verified", "Emerging"]),
  verified: z.boolean(),
  created_at: z.string(),
  sources: z.array(okfSourceSchema).min(1),
  tags: z.array(z.string()),
  especialistas: z.array(especialistaRoleSchema),
  relations: z.object({
    prerequisites: z.array(z.string()),
    related_concepts: z.array(z.string()),
  }),
});
export type OkfConceptFrontmatter = z.infer<typeof okfConceptFrontmatterSchema>;

// Concepto ya cargado y parseado: frontmatter + cuerpo Markdown crudo
// (sin parsear a AST -- se inyecta como texto al prompt, mismo criterio
// que RetrievedChunk.texto). filePath solo para mensajes de error.
export type OkfConcept = OkfConceptFrontmatter & {
  body: string;
  filePath: string;
};

// Análogo a RetrievedChunk (db/ragQueries.ts) pero para el mecanismo OKF:
// conceptId es la clave que el especialista cita en fuentes_citadas y que
// el validador verifica; sourceCitation es el linaje legible (libro +
// autor) que translateOkfFuentes antepone con el marcador de
// Verified/Emerging (Punto 5 del diseño); texto son las secciones 1, 2 y
// 4 del cuerpo (se omite la 3, diagramas ASCII de bajo valor accionable).
export type RetrievedOkfConcept = {
  conceptId: string;
  title: string;
  status: "Verified" | "Emerging";
  sourceCitation: string;
  texto: string;
};
