import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  vector,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { AccionNext, Ciclo, InformeSituacionRef, Resultado } from "../schemas.js";

// startup_id es un identificador libre, sin garantía referencial (sección
// 8 del diseño): startup-next corre contra su propio proyecto Neon,
// aislado de la base de startup-advisor/ontology-engine, así que no hay
// tabla startups que referenciar. Antes (Neon compartida) esto llevaba
// una FK agregada a mano en el SQL de migración generado; se retira al
// aislar el proyecto — startup_id sigue siendo uuid, solo deja de
// garantizar que exista una startup real detrás.
export const nextActionRuns = pgTable("next_action_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  startupId: uuid("startup_id").notNull(),
  informeSituacionRefId: uuid("informe_situacion_ref_id"),
  // Copia completa del objeto recibido en POST /runs (report_id, source,
  // opciones_propuestas). No está en la sección 2 del documento de diseño
  // tal cual (que solo preveía el uuid de referencia): sin esto, /start no
  // tendría de dónde leer opciones_propuestas si llega en una llamada
  // posterior separada. informe_situacion_ref_id se mantiene como FK lógica
  // a reports.id.
  informeSituacionRef: jsonb("informe_situacion_ref").$type<InformeSituacionRef>().notNull(),
  comentarioAsesor: text("comentario_asesor"),
  comentarioAsesorAutor: text("comentario_asesor_autor"),
  comentarioAsesorAplicaA: jsonb("comentario_asesor_aplica_a").$type<string[] | null>(),
  // No estaba en el esquema exacto de la sección 2 (que solo preveía texto/
  // autor/aplica_a): sin esto, los tags del comentario del asesor se pierden
  // al persistir el run y el orquestador nunca puede clasificar el
  // especialista_requerido a partir de ellos en /start o /respond.
  comentarioAsesorTags: jsonb("comentario_asesor_tags").$type<string[] | null>(),
  requestedBy: text("requested_by").notNull(),
  status: text("status").notNull().default("draft"),
  accionNext: jsonb("accion_next").$type<AccionNext | null>(),
  cycle: integer("cycle").notNull().default(0),
  maxCycles: integer("max_cycles").notNull().default(3),
  maxClarifications: integer("max_clarifications").notNull().default(2),
  ciclos: jsonb("ciclos").$type<Ciclo[]>().notNull().default(sql`'[]'::jsonb`),
  especialistaUsado: text("especialista_usado"),
  resultado: jsonb("resultado").$type<Resultado | null>(),
  error: text("error"),
  // Webhook opcional (sección 1 y 7): se dispara con { run_id, status }
  // cuando el run llega a approved, max_cycles_reached o sin_especialista.
  callbackUrl: text("callback_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const nextActionClarifications = pgTable("next_action_clarifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id")
    .notNull()
    .references(() => nextActionRuns.id),
  pregunta: text("pregunta").notNull(),
  respuesta: text("respuesta"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type NextActionRun = typeof nextActionRuns.$inferSelect;
export type NewNextActionRun = typeof nextActionRuns.$inferInsert;
export type NextActionClarification = typeof nextActionClarifications.$inferSelect;
export type NewNextActionClarification = typeof nextActionClarifications.$inferInsert;

// Corpus del RAG (sección 4): poblada offline por el notebook de ingesta,
// nunca escrita por el servicio en producción — solo lectura desde el
// especialista. chunk_id es determinístico (hash de libro/capitulo/
// seccion/indice_en_seccion), lo que permite upsert seguro al re-ingerir.
// Dimensión del embedding (1024) confirmada contra la documentación real
// de Voyage AI: voyage-4 soporta 256/512/1024(default)/2048, se usa el
// default salvo que se decida lo contrario.
export const ragChunks = pgTable(
  "rag_chunks",
  {
    chunkId: text("chunk_id").primaryKey(),
    libro: text("libro").notNull(),
    capitulo: text("capitulo"),
    seccion: text("seccion"),
    indiceEnSeccion: integer("indice_en_seccion").notNull(),
    texto: text("texto").notNull(),
    especialistaTags: jsonb("especialista_tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    embedding: vector("embedding", { dimensions: 1024 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("rag_chunks_embedding_idx").using("hnsw", table.embedding.op("vector_cosine_ops"))],
);

export type RagChunk = typeof ragChunks.$inferSelect;
export type NewRagChunk = typeof ragChunks.$inferInsert;

// Administración de acceso al login por magic link de startup-next-ui
// (sección 9): quién puede usar la herramienta en general, no qué
// startup_id puede tocar cada quien — sin tabla de roles ni permisos por
// startup. Sin prefijo next_action_, mismo criterio que rag_chunks: ese
// prefijo es para la familia de tablas del ciclo de vida de un run, esto
// es un concern de auth aparte.
export const allowedEmails = pgTable("allowed_emails", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AllowedEmail = typeof allowedEmails.$inferSelect;
export type NewAllowedEmail = typeof allowedEmails.$inferInsert;
