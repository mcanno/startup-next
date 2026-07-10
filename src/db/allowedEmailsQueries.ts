// Administración de acceso al login de startup-next-ui (sección 9) —
// archivo separado de queries.ts, mismo criterio que ragQueries.ts:
// queries.ts es para el ciclo de vida de next_action_runs/clarifications,
// esto es una tabla aparte con su propio concern.

import { eq } from "drizzle-orm";
import { db } from "./index.js";
import { allowedEmails } from "./schema.js";

export async function listAllowedEmails() {
  return db.select().from(allowedEmails).orderBy(allowedEmails.createdAt);
}

export async function isEmailAllowed(email: string): Promise<boolean> {
  const [row] = await db.select().from(allowedEmails).where(eq(allowedEmails.email, email)).limit(1);
  return Boolean(row);
}

export async function addAllowedEmail(email: string) {
  const [row] = await db
    .insert(allowedEmails)
    .values({ email })
    .onConflictDoNothing()
    .returning();
  return row;
}

export async function removeAllowedEmail(email: string): Promise<boolean> {
  const deleted = await db.delete(allowedEmails).where(eq(allowedEmails.email, email)).returning();
  return deleted.length > 0;
}
