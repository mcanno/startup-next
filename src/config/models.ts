// Única fuente de verdad para qué modelo (y qué API key) usa cada nodo del
// grafo — swappable por configuración, sin tocar código (sección 7). Los
// nodos construyen su chat model vía getChatModel(), no instancian
// ChatAnthropic/ChatGoogleGenerativeAI a mano ni leen process.env directamente.
//
// Lectura perezosa dentro de las funciones, no en consts de módulo — misma
// convención registrada en la sección 6 tras el bug de ESM del Hito 1
// (dotenv config() en main.ts corre después de que los módulos importados
// ya evaluaron su código de nivel superior).

import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

export type Provider = "anthropic" | "google";

export type ModelConfig = {
  provider: Provider;
  model: string | undefined;
  apiKey: string | undefined;
};

const ORCHESTRATOR_MODEL_DEFAULT = "claude-opus-4-8";
const VALIDATOR_MODEL_DEFAULT = "claude-sonnet-5";
const SPECIALIST_MODEL_DEFAULT = "claude-sonnet-5";
const INFORMES_PARSE_MODEL_DEFAULT = "claude-sonnet-5";
const MODO_BASE_MODEL_DEFAULT = "claude-sonnet-5";

function getProvider(envVar: string | undefined): Provider {
  return envVar === "google" ? "google" : "anthropic";
}

export function getOrchestratorModelConfig(): ModelConfig {
  const provider = getProvider(process.env.ORCHESTRATOR_PROVIDER);
  return {
    provider,
    // Sin default cross-provider: si provider="google", ORCHESTRATOR_MODEL
    // tiene que venir seteado explícito — no tendría sentido cruzar el
    // default de Claude a un proveedor distinto.
    model: process.env.ORCHESTRATOR_MODEL || (provider === "anthropic" ? ORCHESTRATOR_MODEL_DEFAULT : undefined),
    apiKey:
      provider === "google"
        ? process.env.ORCHESTRATOR_GOOGLE_API_KEY
        : process.env.ORCHESTRATOR_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
  };
}

export function getValidatorModelConfig(): ModelConfig {
  return {
    provider: "anthropic",
    model: process.env.VALIDATOR_MODEL || VALIDATOR_MODEL_DEFAULT,
    apiKey: process.env.VALIDATOR_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
  };
}

export function getSpecialistModelConfig(): ModelConfig {
  return {
    provider: "anthropic",
    model: process.env.SPECIALIST_MODEL || SPECIALIST_MODEL_DEFAULT,
    apiKey: process.env.SPECIALIST_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
  };
}

// POST /informes/parse (sección 8, Pieza A): extracción de opciones desde
// un PDF de informe. Slot propio, no reusa specialist/validator — es un
// paso de extracción, no de razonamiento sobre una acción ya elegida.
export function getInformesParseModelConfig(): ModelConfig {
  return {
    provider: "anthropic",
    model: process.env.INFORMES_PARSE_MODEL || INFORMES_PARSE_MODEL_DEFAULT,
    apiKey: process.env.INFORMES_PARSE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
  };
}

// Modo base del orquestador (sección 8, Pieza B): segunda llamada, chica,
// para conflicto_comentario_asesor cuando no hay hechos reales de la
// startup. Slot independiente del validador a propósito — mismo default
// hoy, pero tiene que poder cambiarse sin tocar VALIDATOR_MODEL.
export function getModoBaseModelConfig(): ModelConfig {
  return {
    provider: "anthropic",
    model: process.env.MODO_BASE_MODEL || MODO_BASE_MODEL_DEFAULT,
    apiKey: process.env.MODO_BASE_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
  };
}

export type ChatModelOptions = {
  maxTokens: number;
  effort: "low" | "medium";
};

// Instancia el chat model correcto según el proveedor. Con Anthropic,
// thinking se desactiva del todo (thinking: disabled) porque
// .withStructuredOutput() fuerza tool_choice, y la API solo permite
// tool_choice forzado con thinking deshabilitado (ver notas históricas en
// los nodos). Con Google, NO se manda thinkingConfig: probado en vivo
// contra gemma-4-26b-a4b-it (no un modelo "thinking" — Gemma no aparece en
// la lista de modelos con soporte de thinking de la doc de Gemini, solo la
// familia Gemini 2.5/3.x) — thinkingLevel "LOW" (el mínimo real que expone
// el tipo, "minimal" no existe) rompe con 400 "Thinking level is not
// supported for this model."; omitir el campo funciona limpio. Si algún
// día un modelo Gemini (no Gemma) se usa acá, esto hay que revisarlo de
// nuevo contra ese modelo puntual, no asumir que aplica igual.
export function getChatModel(config: ModelConfig, opts: ChatModelOptions) {
  if (!config.model) throw new Error(`Modelo no configurado para provider "${config.provider}"`);

  if (config.provider === "google") {
    return new ChatGoogleGenerativeAI({
      model: config.model,
      apiKey: config.apiKey,
      maxOutputTokens: opts.maxTokens,
    });
  }

  return new ChatAnthropic({
    model: config.model,
    apiKey: config.apiKey,
    thinking: { type: "disabled" },
    outputConfig: { effort: opts.effort },
    maxTokens: opts.maxTokens,
  });
}
