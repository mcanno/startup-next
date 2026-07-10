// Paso explícito de migración para el checkpointer de LangGraph — crea las
// tablas (checkpoints, checkpoint_blobs, checkpoint_writes) en el schema
// "langgraph" la primera vez. No corre dentro del arranque normal del
// servidor (mismo principio que las migraciones de Drizzle).
//
// Uso: npx tsx scripts/setup-checkpointer.ts

import { config } from "dotenv";
config({ path: ".env.local" });

import { getCheckpointer } from "../src/graph/checkpointer.js";

await getCheckpointer().setup();
console.log("Checkpointer de LangGraph configurado (schema: langgraph).");
