// Cliente HTTP hacia ontology-engine. Desde la conversión a servicio
// puramente de consulta (TBox only, ver diseno_ontology_engine_solo_consulta.md),
// startup-next ya no lee ni escribe ABox de ninguna startup real — solo
// consulta el TBox en abstracto (prerrequisitos metodológicos genéricos,
// modo base en orchestratorModoBase.ts).

const TIMEOUT_MS = 8_000;

// Leído dentro de request(), no en una const de módulo: ver la nota en
// lib/auth.ts sobre el orden de evaluación de módulos ESM vs. dotenv config().
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = process.env.ONTOLOGY_ENGINE_URL!;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}${path}`, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`ontology-engine: ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

// Shape real de GET /concepts/{id}/prerequisitos (ontology-engine, sección 8):
// {concept_id, prerequisitos: [{concept_id, relacion, distancia}]} —
// prerequisitos: [] tanto si no hay precedentes como si el concept_id no
// existe, nunca un error (ver graph.py precedents_of / main.py get_prerequisitos).
export type Prerequisito = { concept_id: string; relacion: string; distancia: number };
type PrerequisitosResponse = { concept_id: string; prerequisitos: Prerequisito[] };

export async function getPrerequisitos(conceptId: string): Promise<Prerequisito[]> {
  try {
    const res = await request<PrerequisitosResponse>(`/concepts/${conceptId}/prerequisitos`);
    return res.prerequisitos;
  } catch {
    return [];
  }
}
