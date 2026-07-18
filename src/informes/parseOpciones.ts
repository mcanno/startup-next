// Lógica de POST /informes/parse (sección 8, Pieza A) separada de la ruta
// Fastify — mismo patrón que src/specialist/mvp.ts.

import { getChatModel, getInformesParseModelConfig } from "../config/models.js";
import { invokeStructured } from "../lib/structuredOutputRetry.js";
import { informeParseDecisionSchema, type OpcionPropuesta } from "../schemas.js";

const SYSTEM_PROMPT = `Eres el extractor de opciones de Startup-Next. Recibes el texto de un informe de situación generado por startup-advisor y tienes que identificar las acciones/opciones concretas que ese informe propone como posibles próximos pasos para la startup.

Reglas:
- Cada opción necesita un título corto y un resumen que explique de qué se trata y por qué importa — no copies párrafos enteros, sintetiza.
- Si el informe propone una sola dirección clara, devuelve una sola opción — no inventes alternativas que el informe no plantea.
- No agregues opciones genéricas de relleno ("mejorar el producto") si el texto no las sugiere específicamente.`;

export async function extractOpcionesDesdeTexto(texto: string): Promise<OpcionPropuesta[]> {
  const llm = getChatModel(getInformesParseModelConfig(), { maxTokens: 2048, effort: "medium" }).withStructuredOutput(
    informeParseDecisionSchema,
    { name: "extraer_opciones", includeRaw: true },
  );

  const decision = await invokeStructured(informeParseDecisionSchema, "informeParseDecisionSchema", () =>
    llm.invoke([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: texto },
    ]),
  );

  return decision.opciones.map((o) => ({ id: crypto.randomUUID(), ...o }));
}

// Texto libre: "la intención tal cual, sin nada que elegir" (sección 8) —
// sin llamada a LLM, una sola opción determinística. titulo se trunca para
// que tenga sentido como encabezado corto; resumen conserva el texto
// completo, sin pérdida.
const TITULO_MAX_LENGTH = 80;

export function buildOpcionDesdeTextoLibre(textoLibre: string): OpcionPropuesta {
  const texto = textoLibre.trim();
  const titulo = texto.length > TITULO_MAX_LENGTH ? `${texto.slice(0, TITULO_MAX_LENGTH).trimEnd()}…` : texto;
  return { id: crypto.randomUUID(), titulo, resumen: texto };
}
