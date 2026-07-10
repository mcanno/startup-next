import { eq, and, isNull } from "drizzle-orm";
import { db } from "./index.js";
import {
  nextActionRuns,
  nextActionClarifications,
  type NewNextActionRun,
  type NewNextActionClarification,
} from "./schema.js";

export async function createRun(input: NewNextActionRun) {
  const [row] = await db.insert(nextActionRuns).values(input).returning();
  return row;
}

export async function getRunById(id: string) {
  const [row] = await db.select().from(nextActionRuns).where(eq(nextActionRuns.id, id)).limit(1);
  return row;
}

export async function updateRun(id: string, patch: Partial<NewNextActionRun>) {
  const [row] = await db
    .update(nextActionRuns)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(nextActionRuns.id, id))
    .returning();
  return row;
}

export async function createClarification(input: NewNextActionClarification) {
  const [row] = await db.insert(nextActionClarifications).values(input).returning();
  return row;
}

export async function listClarifications(runId: string) {
  return db
    .select()
    .from(nextActionClarifications)
    .where(eq(nextActionClarifications.runId, runId))
    .orderBy(nextActionClarifications.createdAt);
}

export async function getPendingClarification(runId: string) {
  const [row] = await db
    .select()
    .from(nextActionClarifications)
    .where(and(eq(nextActionClarifications.runId, runId), isNull(nextActionClarifications.respuesta)))
    .orderBy(nextActionClarifications.createdAt)
    .limit(1);
  return row;
}

export async function answerClarification(id: string, respuesta: string) {
  const [row] = await db
    .update(nextActionClarifications)
    .set({ respuesta })
    .where(eq(nextActionClarifications.id, id))
    .returning();
  return row;
}
