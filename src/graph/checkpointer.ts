import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

// Propio schema de Postgres ("langgraph"), separado de next_action_* y de
// public — el checkpointer guarda estado interno de ejecución del grafo,
// no el contrato de la API (sección 7). checkpointer.setup() se corre
// aparte, vía scripts/setup-checkpointer.ts, no en el arranque normal.
let cached: PostgresSaver | undefined;

export function getCheckpointer(): PostgresSaver {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    cached = PostgresSaver.fromConnString(url, { schema: "langgraph" });
  }
  return cached;
}
