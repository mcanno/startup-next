// Capa de robustez permanente para las tres llamadas .withStructuredOutput()
// del grafo (orchestrator/specialist/validator): Claude puede, de forma
// intermitente, devolver un tool call que no cumple el schema (ver bug real
// encontrado en specialist.ts con el corpus real: resumen_estrategia
// ausente del tool call pese a ser obligatorio) — no es específico de un
// nodo ni de un schema, así que se resuelve una sola vez acá.
//
// Solo reintenta OutputParserException (lc_error_code "OUTPUT_PARSING_FAILURE")
// — cualquier otro error (auth, red, rate limit) se propaga de inmediato:
// reintentarlos a ciegas escondería fallas reales en vez de una
// inconsistencia puntual del modelo.

import { OutputParserException } from "@langchain/core/output_parsers";

const MAX_ATTEMPTS = 3;

function isOutputParsingFailure(err: unknown): boolean {
  if (err instanceof OutputParserException) return true;
  return (err as { lc_error_code?: string } | null)?.lc_error_code === "OUTPUT_PARSING_FAILURE";
}

export async function invokeStructured<T>(call: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await call();
    } catch (err) {
      if (!isOutputParsingFailure(err) || attempt === MAX_ATTEMPTS) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}
