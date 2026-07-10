import { z } from "zod";
import type { FastifyInstance, FastifyReply } from "fastify";
import * as runsService from "../runsService.js";
import { authenticate } from "../lib/auth.js";
import type { NextActionRun } from "../db/schema.js";
import { comentarioAsesorSchema, informeSituacionRefSchema, requestedBySchema } from "../schemas.js";

const createRunBodySchema = z.object({
  startup_id: z.uuid(),
  informe_situacion_ref: informeSituacionRefSchema,
  comentario_asesor: comentarioAsesorSchema.optional(),
  requested_by: requestedBySchema,
  callback_url: z.url().optional(),
});

const respondBodySchema = z.object({
  respuesta: z.string().min(1),
});

const runIdParamsSchema = z.object({ id: z.uuid() });

async function serializeRun(run: NextActionRun) {
  const base = {
    run_id: run.id,
    startup_id: run.startupId,
    status: run.status,
    accion_next: run.accionNext ?? undefined,
    cycle: run.cycle,
    max_cycles: run.maxCycles,
    especialista_usado: run.especialistaUsado ?? undefined,
    informe_final: run.resultado?.informe_final ?? null,
    no_respuesta: run.resultado?.no_respuesta ?? null,
    created_at: run.createdAt.toISOString(),
    updated_at: run.updatedAt.toISOString(),
  };

  if (run.status === "needs_clarification") {
    const pregunta = await runsService.getPendingQuestion(run.id);
    return { ...base, pregunta };
  }

  return base;
}

export async function runsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.post("/runs", async (req, reply) => {
    const parsed = createRunBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid request body", details: parsed.error.issues });
    }

    const run = await runsService.createRun({
      startupId: parsed.data.startup_id,
      informeSituacionRef: parsed.data.informe_situacion_ref,
      comentarioAsesor: parsed.data.comentario_asesor,
      requestedBy: parsed.data.requested_by,
      callbackUrl: parsed.data.callback_url,
    });

    return reply.code(201).send({ run_id: run.id, status: run.status });
  });

  app.post("/runs/:id/start", async (req, reply) => {
    const params = runIdParamsSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: "invalid run id" });

    const result = await runsService.startRun(params.data.id);
    if (!result.ok) return handleAdvanceError(result, reply);

    const body = await serializeRun(result.run);
    return reply.code(body.status === "running" ? 202 : 200).send(body);
  });

  app.get("/runs/:id", async (req, reply) => {
    const params = runIdParamsSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: "invalid run id" });

    const run = await runsService.getRun(params.data.id);
    if (!run) return reply.code(404).send({ error: "run not found" });

    return reply.code(200).send(await serializeRun(run));
  });

  app.post("/runs/:id/respond", async (req, reply) => {
    const params = runIdParamsSchema.safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: "invalid run id" });

    const parsed = respondBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid request body", details: parsed.error.issues });
    }

    const result = await runsService.respondToRun(params.data.id, parsed.data.respuesta);
    if (!result.ok) return handleAdvanceError(result, reply);

    return reply.code(200).send(await serializeRun(result.run));
  });
}

function handleAdvanceError(
  result: Extract<Awaited<ReturnType<typeof runsService.startRun>>, { ok: false }>,
  reply: FastifyReply,
) {
  if (result.reason === "not_found") return reply.code(404).send({ error: "run not found" });
  if (result.reason === "no_pending_question") {
    return reply.code(409).send({ error: "run has no pending clarification question" });
  }
  return reply.code(409).send({ error: `run is in status '${result.status}', cannot proceed` });
}
