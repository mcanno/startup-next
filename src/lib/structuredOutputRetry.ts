// Capa de robustez permanente para las cinco llamadas .withStructuredOutput()
// del grafo (orchestrator/orchestratorModoBase/specialist/validator/informes
// parse): Claude puede, de forma intermitente, devolver un tool call que no
// cumple el schema (ver bug real encontrado en specialist.ts con el corpus
// real: resumen_estrategia ausente del tool call pese a ser obligatorio) —
// no es específico de un nodo ni de un schema, así que se resuelve una sola
// vez acá.
//
// Reparación determinística antes de reintentar (investigación real, sesión
// de startup-next-ui): agregar un segundo campo de nivel superior
// (resumen_estrategia, Hito 3) no alcanza para evitar que un campo
// array-de-objetos se emita como un string con el JSON completo adentro en
// vez de como array nativo — medido ~6% por llamada en 32 corridas reales
// contra specialistDecisionSchema, con stop_reason "tool_use" (no es
// truncamiento por maxTokens). En ese caso el contenido serializado suele
// ser JSON válido y completo: JSON.parse() sobre el/los campo(s) que Zod
// señala como mal tipados, seguido de una re-validación, recupera el
// resultado sin gastar una llamada nueva al modelo. Solo se reintenta con
// una llamada nueva si la reparación también falla.

import type { z } from "zod";

const MAX_ATTEMPTS = 3;

type StructuredCallResult<T> = {
  raw: unknown;
  parsed: T | null;
  parsingError?: Error;
};

function extractToolArgs(raw: unknown): Record<string, unknown> | undefined {
  const message = raw as
    | { tool_calls?: Array<{ args?: Record<string, unknown> }> }
    | null
    | undefined;
  return message?.tool_calls?.[0]?.args;
}

type RepairResult<T> = {
  data: T;
  repairedFields: string[];
  // "campo": reparación previa (Hito 3) — el string de un campo roto
  // parseaba directo al valor esperado para ESE campo.
  // "desanidado": caso nuevo (investigación real de pmf, 2026-07-24,
  // diseno_expansion_especialistas.md) — el string de un campo roto no es
  // el valor de ese campo, es el objeto COMPLETO de nivel superior
  // (todos los campos del schema) serializado y anidado un nivel de más.
  kind: "campo" | "desanidado";
};

// Repara únicamente los campos que Zod señaló como inválidos (vía
// error.issues), no cualquier string del objeto al azar — evita tocar
// campos que legítimamente son texto libre y que por coincidencia
// parseen como JSON.
function attemptRepair<T>(
  schema: z.ZodType<T>,
  args: Record<string, unknown>,
  schemaName: string,
): RepairResult<T> | null {
  const firstPass = schema.safeParse(args);
  if (firstPass.success) return null; // no hacía falta reparar nada

  const repaired: Record<string, unknown> = { ...args };
  const repairedFields: string[] = [];
  const brokenKeys = new Set(
    firstPass.error.issues
      .map((issue) => issue.path[0])
      .filter((key): key is string => typeof key === "string"),
  );

  for (const key of brokenKeys) {
    const value = repaired[key];
    if (typeof value !== "string") continue;

    let parsedValue: unknown;
    try {
      parsedValue = JSON.parse(value);
    } catch {
      continue; // no era JSON válido, no se puede reparar este campo
    }

    // Caso "desanidado": el contenido parseado no es el valor de ESTE
    // campo, es un objeto que, tal cual, ya satisface el schema COMPLETO
    // de nivel superior (Claude metió todo un nivel de más adentro de un
    // solo campo). Se comprueba de forma genérica contra el schema
    // entero, no contra ningún nombre de campo hardcodeado — aplica a
    // cualquiera de los 5 nodos LLM-facing que usan esta capa, no solo a
    // specialistDecisionSchema. Conservador: si no valida completo, no se
    // fuerza nada, cae al camino normal de abajo (reparación campo a
    // campo, y de ahí al reintento si tampoco alcanza).
    if (parsedValue !== null && typeof parsedValue === "object" && !Array.isArray(parsedValue)) {
      const unwrapped = schema.safeParse(parsedValue);
      if (unwrapped.success) {
        return { data: unwrapped.data, repairedFields: [key], kind: "desanidado" };
      }
    }

    repaired[key] = parsedValue;
    repairedFields.push(key);
  }

  const secondPass = repairedFields.length > 0 ? schema.safeParse(repaired) : firstPass;
  if (secondPass.success) return { data: secondPass.data, repairedFields, kind: "campo" };

  // No se pudo reparar del todo — loguea un diagnóstico por cada campo
  // que sigue roto, sin importar la causa exacta (JSON.parse pudo haber
  // tenido éxito en un campo y el fallo real venir de otro campo distinto
  // que quedó ausente/mal tipado, o el campo nunca fue JSON válido en
  // primer lugar): preview (inicio/fin + longitud) si es string, para
  // distinguir truncamiento (corta a mitad de valor, el final no cierra)
  // de otras causas, sin guardar el valor completo en logs (ver
  // diseno_expansion_especialistas.md, hipótesis de maxTokens señalada al
  // investigar el hallazgo de pmf).
  for (const key of brokenKeys) {
    const value = args[key];
    const detalle =
      typeof value === "string"
        ? `longitud=${value.length} inicio="${value.slice(0, 150)}" fin="${value.slice(-150)}"`
        : `valor=${JSON.stringify(value)}`;
    console.error(`structured output: campo "${key}" sigue inválido tras reparación (schema="${schemaName}") tipo=${typeof value} ${detalle}`);
  }
  return null;
}

// LangChain no siempre popula parsingError cuando parsed es null (visto en
// vivo: args con recomendaciones como string con JSON invalido/truncado, no
// reparable con JSON.parse — ver comentario de arriba). Sin esto, el error
// guardado en la fila del run era un mensaje genérico sin ningún detalle,
// forzando a levantar un script de debug aparte cada vez para saber qué pasó
// realmente.
function buildDiagnosticError<T>(
  schemaName: string,
  parsingError: Error | undefined,
  schema: z.ZodType<T>,
  args: Record<string, unknown> | undefined,
): Error {
  if (parsingError) return parsingError;
  if (!args) return new Error(`structured output: sin tool_calls en la respuesta (schema="${schemaName}")`);

  const zodResult = schema.safeParse(args);
  if (zodResult.success) return new Error(`structured output: fallo inesperado sin issues (schema="${schemaName}")`);

  const issues = zodResult.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  return new Error(`structured output inválido (schema="${schemaName}"): ${issues}`);
}

export async function invokeStructured<T>(
  schema: z.ZodType<T>,
  schemaName: string,
  call: () => Promise<StructuredCallResult<T>>,
): Promise<T> {
  let lastErr: Error = new Error(`structured output parsing failed sin detalle (schema="${schemaName}")`);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const result = await call();
    if (result.parsed !== null) return result.parsed;

    const args = extractToolArgs(result.raw);
    if (args) {
      const repair = attemptRepair(schema, args, schemaName);
      if (repair) {
        // Reparación exitosa: distinto de un éxito normal a propósito, para
        // poder medir con datos reales de producción qué tan seguido pasa
        // esto (la medición de ~6% de hoy fue con prompts sintéticos, no con
        // el accion_next real armado por el orquestador) — y con el "kind"
        // en el mensaje mismo para poder medir por separado cuál de los dos
        // caminos de reparación actúa con qué frecuencia.
        const etiqueta =
          repair.kind === "desanidado" ? "reparado sin reintento (desanidado)" : "reparado sin reintento";
        console.warn(`structured output ${etiqueta}: schema="${schemaName}" campos=[${repair.repairedFields.join(", ")}]`);
        return repair.data;
      }
    }

    lastErr = buildDiagnosticError(schemaName, result.parsingError, schema, args);
    if (attempt === MAX_ATTEMPTS) throw lastErr;
  }

  throw lastErr;
}
