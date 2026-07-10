// Cliente HTTP hacia Voyage AI, mismo patrón que src/lib/ontologyEngine.ts
// (fetch directo, sin SDK, env leído perezosamente dentro de la función).
// Proveedor inevitable para embeddings (sección 4): Claude no los genera.

const TIMEOUT_MS = 15_000;
const MODEL = "voyage-4";
// Debe coincidir con vector(1024) en la migración 0003_add_rag_chunks.sql
// y con el output_dimension usado por el notebook de ingesta al embeber
// los documentos — mismo espacio vectorial en ambos lados.
const EMBEDDING_DIMENSIONS = 1024;

// Shape real de la API (verificado contra una llamada real, no de
// memoria): envelope estilo OpenAI, `data[].embedding` — no
// `embeddings[]` como sugería la documentación resumida.
type VoyageEmbeddingsResponse = {
  data: { embedding: number[]; index: number }[];
  model: string;
  usage: { total_tokens: number };
};

// Solo embedQuery: el servicio en producción únicamente consulta (busca
// chunks ya cargados). Embeber documentos es responsabilidad exclusiva
// del notebook de ingesta offline (Python), no de este servicio.
export async function embedQuery(text: string): Promise<number[]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("VOYAGE_API_KEY is not set");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: [text],
        model: MODEL,
        input_type: "query",
        output_dimension: EMBEDDING_DIMENSIONS,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`voyage: ${res.status}`);
    const data = (await res.json()) as VoyageEmbeddingsResponse;
    return data.data[0].embedding;
  } finally {
    clearTimeout(timeout);
  }
}
