import { z } from "zod";
import type { FastifyInstance } from "fastify";
import {
  addAllowedEmail,
  isEmailAllowed,
  listAllowedEmails,
  removeAllowedEmail,
} from "../db/allowedEmailsQueries.js";
import { authenticateAdmin, authenticateApp } from "../lib/auth.js";

const checkQuerySchema = z.object({ email: z.string().min(1) });
const addBodySchema = z.object({ email: z.email() });

// Sin hook de plugin (a diferencia de runsRoutes/informesRoutes): cada
// ruta necesita su propia key — /check la consume el flujo del magic link
// con API_KEY_APP, las otras tres son solo para quien administra la lista,
// con API_KEY_ADMIN. Ninguna de las dos keys debe servir para la ruta de
// la otra.
export async function adminRoutes(app: FastifyInstance) {
  app.get("/admin/allowed-emails/check", { preHandler: authenticateApp }, async (req, reply) => {
    const parsed = checkQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid query", details: parsed.error.issues });
    }
    const allowed = await isEmailAllowed(parsed.data.email.trim().toLowerCase());
    return reply.code(200).send({ allowed });
  });

  app.get("/admin/allowed-emails", { preHandler: authenticateAdmin }, async (_req, reply) => {
    const emails = await listAllowedEmails();
    return reply.code(200).send({ emails });
  });

  app.post("/admin/allowed-emails", { preHandler: authenticateAdmin }, async (req, reply) => {
    const parsed = addBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid request body", details: parsed.error.issues });
    }
    const row = await addAllowedEmail(parsed.data.email.trim().toLowerCase());
    return reply.code(201).send({ email: row?.email ?? parsed.data.email.trim().toLowerCase() });
  });

  app.delete("/admin/allowed-emails/:email", { preHandler: authenticateAdmin }, async (req, reply) => {
    const { email } = req.params as { email: string };
    const removed = await removeAllowedEmail(decodeURIComponent(email).trim().toLowerCase());
    if (!removed) return reply.code(404).send({ error: "email not found" });
    return reply.code(204).send();
  });
}
