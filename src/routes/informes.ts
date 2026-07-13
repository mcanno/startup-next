import multipart from "@fastify/multipart";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { buildOpcionDesdeTextoLibre, extractOpcionesDesdeTexto } from "../informes/parseOpciones.js";
import { authenticate } from "../lib/auth.js";
import { extractTextFromPdf } from "../lib/pdfParser.js";
import { resolveStartupIdFromPdfText } from "../lib/pdfVerification.js";

const textoLibreBodySchema = z.object({
  texto_libre: z.string().min(1),
});

// Sin comentario del asesor acá a propósito (sección 8): se agrega después,
// en POST /runs, una vez que ya existen ids de opciones reales contra qué
// aplicarlo (aplica_a). Reusable tal cual por la UI web y por Hermes.
export async function informesRoutes(app: FastifyInstance) {
  await app.register(multipart);
  app.addHook("preHandler", authenticate);

  app.post("/informes/parse", async (req, reply) => {
    const contentType = req.headers["content-type"] ?? "";

    if (contentType.startsWith("multipart/")) {
      const file = await req.file();
      if (!file) return reply.code(400).send({ error: "no se recibió ningún archivo" });

      const buffer = await file.toBuffer();
      const texto = await extractTextFromPdf(buffer);
      if (!texto.trim()) {
        return reply.code(400).send({ error: "no se pudo extraer texto del PDF" });
      }

      const startupId = resolveStartupIdFromPdfText(texto);
      const opciones = await extractOpcionesDesdeTexto(texto);
      return reply.code(200).send({ opciones_propuestas: opciones, startup_id: startupId });
    }

    const parsed = textoLibreBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid request body", details: parsed.error.issues });
    }

    // Texto libre nunca tiene id que extraer -- siempre modo base con UUID
    // generado (seccion 9).
    const opcion = buildOpcionDesdeTextoLibre(parsed.data.texto_libre);
    return reply.code(200).send({ opciones_propuestas: [opcion], startup_id: crypto.randomUUID() });
  });
}
