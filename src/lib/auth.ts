import type { FastifyReply, FastifyRequest } from "fastify";
import type { RequestedBy } from "../schemas.js";

// Dos invocadores fijos, decisión definitiva (sección 3): app y hermes, cada
// uno con su propia API key vía env var. Tabla next_action_api_keys
// descartada del diseño, no solo pospuesta — se reconsidera únicamente si
// aparece un tercer invocador. Rotación = cambiar la env var + redeploy.
//
// Se leen dentro de authenticate(), no en una const de módulo: en ESM los
// módulos importados se evalúan antes que el código de nivel superior de
// quien los importa, así que si esto se capturara al cargar el módulo,
// quedaría en `undefined` cuando main.ts llama a dotenv config() después
// de sus imports (aunque aparezca antes en el texto).
function getKeys(): Record<RequestedBy, string | undefined> {
  return {
    app: process.env.API_KEY_APP,
    hermes: process.env.API_KEY_HERMES,
  };
}

export function authenticate(req: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    reply.code(401).send({ error: "missing Authorization: Bearer <key>" });
    return;
  }

  const keys = getKeys();
  const invoker = (Object.keys(keys) as RequestedBy[]).find((name) => keys[name] && keys[name] === token);
  if (!invoker) {
    reply.code(401).send({ error: "invalid API key" });
    return;
  }

  req.invoker = invoker;
  done();
}

// Guard de una sola key específica, no "cualquiera de las conocidas" —
// para /admin/*, donde cada ruta necesita exactamente una key y ninguna
// otra debe servir (sección 9). Factory reusada dos veces en vez de
// duplicar la función, aplicada por ruta (no por plugin, a diferencia de
// authenticate()) porque las rutas de /admin/* no comparten la misma key.
function requireApiKey(getExpectedKey: () => string | undefined) {
  return function (req: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

    if (!token) {
      reply.code(401).send({ error: "missing Authorization: Bearer <key>" });
      return;
    }

    const expected = getExpectedKey();
    if (!expected || token !== expected) {
      reply.code(401).send({ error: "invalid API key" });
      return;
    }

    done();
  };
}

export const authenticateApp = requireApiKey(() => process.env.API_KEY_APP);
export const authenticateAdmin = requireApiKey(() => process.env.API_KEY_ADMIN);

declare module "fastify" {
  interface FastifyRequest {
    invoker?: RequestedBy;
  }
}
