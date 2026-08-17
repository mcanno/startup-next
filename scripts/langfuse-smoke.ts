// Prueba mínima ("hola mundo") de la tubería de observabilidad -- Fase 1,
// Paso 1 de diseno_observabilidad_evaluacion.md. Confirma que la conexión a
// Langfuse Cloud funciona antes de instrumentar el sistema real (orquestador/
// especialista/validador). No toca ningún nodo del grafo.
//
// SDK: @langfuse/tracing + @langfuse/otel (generación actual, basada en
// OpenTelemetry) -- NO el paquete `langfuse` (v3), que el propio fabricante
// marca como deprecado en favor de esta generación.
//
// Uso: npx tsx scripts/langfuse-smoke.ts

import { config } from "dotenv";
config({ path: ".env.local" });

import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { startActiveObservation } from "@langfuse/tracing";

// Lectura perezosa dentro de una función, no en consts de módulo -- mismo
// criterio que src/config/models.ts (comentario de cabecera, sección 6 del
// diseño: dotenv.config() de arriba corre antes de que esto se llame, pero
// solo porque nunca se lee process.env en el nivel superior del archivo).
function getLangfuseSmokeConfig() {
  return {
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    // LANGFUSE_BASE_URL, no LANGFUSE_HOST -- nombre de la generación actual
    // del SDK (@langfuse/otel), distinto del de la v3 deprecada.
    baseUrl: process.env.LANGFUSE_BASE_URL,
  };
}

async function main() {
  const { publicKey, secretKey, baseUrl } = getLangfuseSmokeConfig();

  if (!publicKey || !secretKey) {
    console.error(
      "Faltan LANGFUSE_PUBLIC_KEY y/o LANGFUSE_SECRET_KEY en .env.local -- " +
        "completalas con tus claves reales de Langfuse Cloud antes de correr este script.",
    );
    process.exit(1);
  }

  const spanProcessor = new LangfuseSpanProcessor({
    publicKey,
    secretKey,
    baseUrl, // undefined si no está seteada -- el SDK cae a su propio default (cloud.langfuse.com)
    exportMode: "immediate", // recomendado para procesos de vida corta como este script, no para el servidor real
  });

  const tracerProvider = new NodeTracerProvider({
    spanProcessors: [spanProcessor],
  });
  tracerProvider.register();

  try {
    await startActiveObservation("smoke-test", async (span) => {
      span.update({
        input: { proposito: "verificar conexión a Langfuse Cloud" },
        metadata: {
          fase: "Fase 1 -- observabilidad de salud (diseno_observabilidad_evaluacion.md)",
          origen: "scripts/langfuse-smoke.ts",
        },
      });
      span.update({ output: { resultado: "ok" } });
    });

    // exportMode "immediate" ya exporta al cerrar el span, pero un script
    // que termina rápido puede matar el proceso antes de que la petición
    // HTTP en vuelo complete -- flush explícito antes de salir.
    await spanProcessor.forceFlush();
    await spanProcessor.shutdown();

    console.log("Traza 'smoke-test' enviada. Verificá en el dashboard de Langfuse Cloud (Traces) que aparece.");
  } catch (err) {
    console.error("Fallo al enviar la traza a Langfuse:", err);
    await spanProcessor.shutdown().catch(() => {});
    process.exit(1);
  }
}

await main();
