-- drizzle-kit no emite esto automáticamente: la extensión pgvector debe
-- existir antes de que la columna "vector(1024)" pueda crearse.
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "next_action_clarifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"pregunta" text NOT NULL,
	"respuesta" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "next_action_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"startup_id" uuid NOT NULL,
	"informe_situacion_ref_id" uuid,
	"informe_situacion_ref" jsonb NOT NULL,
	"comentario_asesor" text,
	"comentario_asesor_autor" text,
	"comentario_asesor_aplica_a" jsonb,
	"comentario_asesor_tags" jsonb,
	"requested_by" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"accion_next" jsonb,
	"cycle" integer DEFAULT 0 NOT NULL,
	"max_cycles" integer DEFAULT 3 NOT NULL,
	"max_clarifications" integer DEFAULT 2 NOT NULL,
	"ciclos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"especialista_usado" text,
	"resultado" jsonb,
	"error" text,
	"callback_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rag_chunks" (
	"chunk_id" text PRIMARY KEY NOT NULL,
	"libro" text NOT NULL,
	"capitulo" text,
	"seccion" text,
	"indice_en_seccion" integer NOT NULL,
	"texto" text NOT NULL,
	"especialista_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "next_action_clarifications" ADD CONSTRAINT "next_action_clarifications_run_id_next_action_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."next_action_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rag_chunks_embedding_idx" ON "rag_chunks" USING hnsw ("embedding" vector_cosine_ops);