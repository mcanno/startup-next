// Subgrafo inducido por especialista + BFS acotado desde un ancla --
// diseno_mecanismo_okf_grafo.md, Punto 4. Mismo algoritmo de BFS que
// ontology-engine/graph.py (precedents_of: seen/frontier, cuenta
// distancia), pero acá "prerequisites" y "related_concepts" se tratan
// como no dirigidas (a diferencia del TBox, no importa la dirección, solo
// qué está conceptualmente cerca) y la navegación queda restringida al
// subgrafo inducido por el tag `especialistas` -- evita que la
// recuperación de un especialista cruce a conceptos de otro (ej.
// contraposicionamiento.related_concepts incluye okf_economias_de_escala,
// que es de mvp, no de escalado).

import type { EspecialistaRole } from "../schemas.js";
import type { OkfConcept } from "./types.js";

export const DEFAULT_MAX_DEPTH = 2;
export const DEFAULT_MAX_CONCEPTS = 6;

export function inducedSubgraph(
  concepts: Map<string, OkfConcept>,
  especialista: EspecialistaRole,
): Map<string, OkfConcept> {
  const subgraph = new Map<string, OkfConcept>();
  for (const concept of concepts.values()) {
    if (concept.especialistas.includes(especialista)) {
      subgraph.set(concept.id, concept);
    }
  }
  return subgraph;
}

function buildAdjacency(subgraph: Map<string, OkfConcept>): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  for (const id of subgraph.keys()) adjacency.set(id, new Set());

  function link(a: string, b: string) {
    if (!subgraph.has(a) || !subgraph.has(b)) return; // fuera del subgrafo inducido -- se poda acá
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  }

  for (const concept of subgraph.values()) {
    for (const relatedId of [...concept.relations.prerequisites, ...concept.relations.related_concepts]) {
      link(concept.id, relatedId);
    }
  }
  return adjacency;
}

// BFS multi-fuente (todas las anclas arrancan a distancia 0) dentro del
// subgrafo ya inducido. Si la frontera excede maxConcepts, se cortan
// primero los nodos más lejanos (mayor distancia) -- las anclas nunca se
// descartan.
export function bfsFromAnchors(
  subgraph: Map<string, OkfConcept>,
  anchorIds: string[],
  maxDepth: number = DEFAULT_MAX_DEPTH,
  maxConcepts: number = DEFAULT_MAX_CONCEPTS,
): string[] {
  const adjacency = buildAdjacency(subgraph);
  const validAnchors = anchorIds.filter((id) => subgraph.has(id));

  const distances = new Map<string, number>();
  for (const anchor of validAnchors) distances.set(anchor, 0);

  let frontier = [...validAnchors];
  for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
    const nextFrontier: string[] = [];
    for (const node of frontier) {
      for (const neighbor of adjacency.get(node) ?? []) {
        if (!distances.has(neighbor)) {
          distances.set(neighbor, depth);
          nextFrontier.push(neighbor);
        }
      }
    }
    frontier = nextFrontier;
  }

  const ordered = [...distances.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);

  if (ordered.length <= maxConcepts) return ordered;

  // Recorta los más lejanos primero, preservando siempre las anclas
  // (distancia 0, siempre entran dentro del límite salvo que haya más
  // anclas que maxConcepts, caso no esperado con maxConcepts >= 1 y
  // selectAnchors acotado a 1-2).
  return ordered.slice(0, maxConcepts);
}
