import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { invokeStructured } from "../../src/lib/structuredOutputRetry.js";
import { specialistDecisionSchema } from "../../src/schemas.js";
import { CAPTURED_NESTED_PAYLOADS } from "./fixtures/capturedNestedPayloads.js";

function rawWithArgs(args: Record<string, unknown>) {
  return { tool_calls: [{ args }] };
}

// Réplica exacta de specialistDecisionSchema tal como era al momento de
// esta captura real (2026-07-24, campo "chunk_ids_citados" -- renombrado a
// "fuentes_citadas" después, ver diseno_mecanismo_okf_grafo.md Punto 6.4).
// Deliberadamente NO se actualiza junto con el schema vigente: el valor de
// este test es reproducir el mecanismo genérico de reparación de
// attemptRepair() contra bytes reales congelados de producción, no seguir
// el contrato actual -- reescribir los fixtures para que calcen con el
// nombre nuevo falsificaría la evidencia real que representan.
const legacySpecialistDecisionSchema = z.object({
  resumen_estrategia: z.string(),
  recomendaciones: z
    .array(
      z.object({
        titulo: z.string(),
        detalle: z.string(),
        chunk_ids_citados: z.array(z.string()),
      }),
    )
    .min(1)
    .max(6),
});

describe("invokeStructured — reparación por desanidado (investigación real de pmf, 2026-07-24)", () => {
  it.each(CAPTURED_NESTED_PAYLOADS.map((payload, i) => [i, payload] as const))(
    "fixture real #%i: repara sin gastar reintento cuando resumen_estrategia está ausente y recomendaciones trae el objeto completo anidado",
    async (_i, payload) => {
      const call = vi.fn().mockResolvedValue({
        raw: rawWithArgs({ recomendaciones: payload }),
        parsed: null,
      });

      const result = await invokeStructured(legacySpecialistDecisionSchema, "specialistDecisionSchema", call);

      expect(call).toHaveBeenCalledTimes(1); // reparado en el primer intento, sin reintento
      expect(typeof result.resumen_estrategia).toBe("string");
      expect(result.resumen_estrategia.length).toBeGreaterThan(0);
      expect(Array.isArray(result.recomendaciones)).toBe(true);
      expect(result.recomendaciones.length).toBeGreaterThan(0);
      for (const r of result.recomendaciones) {
        expect(typeof r.titulo).toBe("string");
        expect(typeof r.detalle).toBe("string");
        expect(Array.isArray(r.chunk_ids_citados)).toBe(true);
      }
    },
  );

  it("no fuerza el desanidado si el objeto parseado no valida contra el schema completo — cae al reintento normal", async () => {
    // Objeto válido como JSON, pero que NO satisface specialistDecisionSchema
    // completo (le falta recomendaciones) — no debe "inventarse" una reparación.
    const noValidaComoTodo = JSON.stringify({ resumen_estrategia: "algo" });
    const call = vi.fn().mockResolvedValue({
      raw: rawWithArgs({ recomendaciones: noValidaComoTodo }),
      parsed: null,
      parsingError: new Error("boom"),
    });

    await expect(invokeStructured(specialistDecisionSchema, "specialistDecisionSchema", call)).rejects.toThrow();
    expect(call).toHaveBeenCalledTimes(3); // agotó los 3 reintentos, no reparó a ciegas
  });

  it("caso de reparación previo (campo a campo) sigue funcionando sin cambios: recomendaciones como array serializado, resumen_estrategia presente y válido", async () => {
    const recomendacionesComoString = JSON.stringify([
      { titulo: "t1", detalle: "d1", fuentes_citadas: ["a"] },
    ]);
    const call = vi.fn().mockResolvedValue({
      raw: rawWithArgs({ resumen_estrategia: "resumen real", recomendaciones: recomendacionesComoString }),
      parsed: null,
    });

    const result = await invokeStructured(specialistDecisionSchema, "specialistDecisionSchema", call);

    expect(call).toHaveBeenCalledTimes(1);
    expect(result.resumen_estrategia).toBe("resumen real");
    expect(result.recomendaciones).toEqual([{ titulo: "t1", detalle: "d1", fuentes_citadas: ["a"] }]);
  });

  it("JSON genuinamente corrupto (no parseable) sigue sin repararse a propósito — cae al reintento normal", async () => {
    const corrupto = '{"resumen_estrategia":"x","recomendaciones":[{"titulo":'; // cortado a mitad
    const call = vi.fn().mockResolvedValue({
      raw: rawWithArgs({ recomendaciones: corrupto }),
      parsed: null,
      parsingError: new Error("boom"),
    });

    await expect(invokeStructured(specialistDecisionSchema, "specialistDecisionSchema", call)).rejects.toThrow();
    expect(call).toHaveBeenCalledTimes(3);
  });
});
