import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";

type DB = ReturnType<typeof drizzle<typeof schema>>;

let cached: DB | undefined;

export function getDb(): DB {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const sql = neon(url);
    cached = drizzle(sql, { schema });
  }
  return cached;
}

export const db = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});
