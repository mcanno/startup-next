import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getInformesParseModelConfig,
  getModoBaseModelConfig,
  getOrchestratorModelConfig,
  getSpecialistModelConfig,
  getValidatorModelConfig,
} from "../../src/config/models.js";

const ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "ORCHESTRATOR_MODEL",
  "ORCHESTRATOR_ANTHROPIC_API_KEY",
  "ORCHESTRATOR_PROVIDER",
  "ORCHESTRATOR_GOOGLE_API_KEY",
  "VALIDATOR_MODEL",
  "VALIDATOR_ANTHROPIC_API_KEY",
  "SPECIALIST_MODEL",
  "SPECIALIST_ANTHROPIC_API_KEY",
  "INFORMES_PARSE_MODEL",
  "INFORMES_PARSE_ANTHROPIC_API_KEY",
  "MODO_BASE_MODEL",
  "MODO_BASE_ANTHROPIC_API_KEY",
] as const;

let originalEnv: Record<string, string | undefined>;

beforeEach(() => {
  originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("getOrchestratorModelConfig / getValidatorModelConfig / getSpecialistModelConfig", () => {
  it("sin env vars seteadas, devuelve los defaults confirmados, provider anthropic y apiKey cae a ANTHROPIC_API_KEY (undefined si tampoco está)", () => {
    expect(getOrchestratorModelConfig()).toEqual({ provider: "anthropic", model: "claude-opus-4-8", apiKey: undefined });
    expect(getValidatorModelConfig()).toEqual({ provider: "anthropic", model: "claude-sonnet-5", apiKey: undefined });
    expect(getSpecialistModelConfig()).toEqual({ provider: "anthropic", model: "claude-sonnet-5", apiKey: undefined });
  });

  it("con ORCHESTRATOR_MODEL/VALIDATOR_MODEL/SPECIALIST_MODEL seteadas, devuelve exactamente ese valor, no el default", () => {
    process.env.ORCHESTRATOR_MODEL = "claude-opus-4-7";
    process.env.VALIDATOR_MODEL = "claude-haiku-4-5";
    process.env.SPECIALIST_MODEL = "claude-opus-4-8";

    expect(getOrchestratorModelConfig().model).toBe("claude-opus-4-7");
    expect(getValidatorModelConfig().model).toBe("claude-haiku-4-5");
    expect(getSpecialistModelConfig().model).toBe("claude-opus-4-8");
  });

  it("con ORCHESTRATOR_ANTHROPIC_API_KEY seteada, se usa esa y no la general", () => {
    process.env.ANTHROPIC_API_KEY = "general-key";
    process.env.ORCHESTRATOR_ANTHROPIC_API_KEY = "orchestrator-only-key";

    expect(getOrchestratorModelConfig().apiKey).toBe("orchestrator-only-key");
  });

  it("sin ORCHESTRATOR_ANTHROPIC_API_KEY/SPECIALIST_ANTHROPIC_API_KEY, cae correctamente a ANTHROPIC_API_KEY", () => {
    process.env.ANTHROPIC_API_KEY = "general-key";

    expect(getOrchestratorModelConfig().apiKey).toBe("general-key");
    expect(getValidatorModelConfig().apiKey).toBe("general-key");
    expect(getSpecialistModelConfig().apiKey).toBe("general-key");
  });

  it("aislamiento de key por nodo: VALIDATOR_ANTHROPIC_API_KEY y SPECIALIST_ANTHROPIC_API_KEY no se pisan entre sí ni con el orquestador", () => {
    process.env.ANTHROPIC_API_KEY = "general-key";
    process.env.VALIDATOR_ANTHROPIC_API_KEY = "validator-only-key";
    process.env.SPECIALIST_ANTHROPIC_API_KEY = "specialist-only-key";

    expect(getValidatorModelConfig().apiKey).toBe("validator-only-key");
    expect(getSpecialistModelConfig().apiKey).toBe("specialist-only-key");
    expect(getOrchestratorModelConfig().apiKey).toBe("general-key");
  });

  it("ORCHESTRATOR_PROVIDER=google: usa ORCHESTRATOR_GOOGLE_API_KEY, no ORCHESTRATOR_ANTHROPIC_API_KEY/ANTHROPIC_API_KEY, y no aplica el default de Claude al model", () => {
    process.env.ANTHROPIC_API_KEY = "general-key";
    process.env.ORCHESTRATOR_ANTHROPIC_API_KEY = "orchestrator-anthropic-key";
    process.env.ORCHESTRATOR_PROVIDER = "google";
    process.env.ORCHESTRATOR_MODEL = "gemma-4-26b-a4b-it";
    process.env.ORCHESTRATOR_GOOGLE_API_KEY = "orchestrator-google-key";

    expect(getOrchestratorModelConfig()).toEqual({
      provider: "google",
      model: "gemma-4-26b-a4b-it",
      apiKey: "orchestrator-google-key",
    });
  });

  it("ORCHESTRATOR_PROVIDER=google sin ORCHESTRATOR_MODEL: model queda undefined, no cae al default de Claude", () => {
    process.env.ORCHESTRATOR_PROVIDER = "google";

    expect(getOrchestratorModelConfig().model).toBeUndefined();
  });

  it("validador y especialista ignoran ORCHESTRATOR_PROVIDER: siguen fijos en anthropic", () => {
    process.env.ORCHESTRATOR_PROVIDER = "google";

    expect(getValidatorModelConfig().provider).toBe("anthropic");
    expect(getSpecialistModelConfig().provider).toBe("anthropic");
  });

  it("getInformesParseModelConfig: default claude-sonnet-5, mismo patrón de fallback de apiKey", () => {
    expect(getInformesParseModelConfig()).toEqual({ provider: "anthropic", model: "claude-sonnet-5", apiKey: undefined });

    process.env.ANTHROPIC_API_KEY = "general-key";
    expect(getInformesParseModelConfig().apiKey).toBe("general-key");

    process.env.INFORMES_PARSE_ANTHROPIC_API_KEY = "informes-parse-only-key";
    expect(getInformesParseModelConfig().apiKey).toBe("informes-parse-only-key");

    process.env.INFORMES_PARSE_MODEL = "claude-opus-4-8";
    expect(getInformesParseModelConfig().model).toBe("claude-opus-4-8");
  });

  it("getModoBaseModelConfig: default claude-sonnet-5 (igual al validador hoy), pero es un slot independiente", () => {
    expect(getModoBaseModelConfig()).toEqual({ provider: "anthropic", model: "claude-sonnet-5", apiKey: undefined });

    process.env.MODO_BASE_MODEL = "claude-haiku-4-5";
    process.env.MODO_BASE_ANTHROPIC_API_KEY = "modo-base-only-key";
    process.env.VALIDATOR_MODEL = "claude-opus-4-8";
    process.env.VALIDATOR_ANTHROPIC_API_KEY = "validator-only-key";

    expect(getModoBaseModelConfig()).toEqual({
      provider: "anthropic",
      model: "claude-haiku-4-5",
      apiKey: "modo-base-only-key",
    });
    // No se pisan entre sí: cambiar VALIDATOR_* no afecta MODO_BASE_*.
    expect(getValidatorModelConfig().model).toBe("claude-opus-4-8");
  });
});
