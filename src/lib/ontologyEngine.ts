// Cliente HTTP hacia ontology-engine, mismo patrón que
// startup-advisor/src/lib/ontologyEngine.ts (fetch + AbortController, sin SDK).

import type { HallazgoOntologia } from "../schemas.js";

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

// Shape real de rules.py: validate() devuelve un dict por rule_id, cada uno
// con descripcion y hallazgos (lista de strings de violación, puede estar vacía).
export type OntologyValidateResponse = Record<string, { descripcion: string; hallazgos: string[] }>;

export async function validateStartup(startupId: string): Promise<OntologyValidateResponse> {
  return request<OntologyValidateResponse>(`/startups/${startupId}/validate`);
}

// Shape real de GET /startups/{id}/graph (main.py get_startup_graph):
// {"stats": og.stats(), "individuals": [...]}. individuals.length es la
// señal correcta de "hay hechos reales" — validateStartup() no sirve para
// esto: una startup sin ningún individuo también devuelve hallazgos: []
// en las 4 reglas (nada que violar), indistinguible de una startup real
// que cumple todo (sección 8, sección "sí verificado, no asumido").
export type StartupGraphResponse = {
  stats: { conceptos: number; individuos: number; relaciones_totales: number };
  individuals: Array<{ id: string; label?: string; concept_id?: string; [key: string]: unknown }>;
};

export async function getStartupGraph(startupId: string): Promise<StartupGraphResponse> {
  return request<StartupGraphResponse>(`/startups/${startupId}/graph`);
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

// Adapta la respuesta real de ontology-engine (hallazgos: string[] por regla)
// al shape del contrato de Startup-Next (hallazgos: string), quedándose solo
// con las reglas que dispararon al menos un hallazgo.
export function toHallazgosOntologia(report: OntologyValidateResponse): HallazgoOntologia[] {
  return Object.entries(report)
    .filter(([, rule]) => rule.hallazgos.length > 0)
    .map(([rule_id, rule]) => ({ rule_id, hallazgos: rule.hallazgos.join("; ") }));
}
