import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bfsFromAnchors, inducedSubgraph } from "../../src/okf/graph.js";
import { loadOkfConcepts } from "../../src/okf/loader.js";

const REAL_OKF_ROOT = join(process.cwd(), "okf");

describe("inducedSubgraph — contra el grafo real de 7 Powers", () => {
  it("escalado induce exactamente 6 nodos: sus 4 conceptos propios + las 2 raíces", () => {
    const concepts = loadOkfConcepts(REAL_OKF_ROOT);
    const subgraph = inducedSubgraph(concepts, "escalado");
    expect([...subgraph.keys()].sort()).toEqual(
      [
        "okf_contraposicionamiento",
        "okf_costos_de_cambio",
        "okf_creacion_de_marcas",
        "okf_definicion_de_poder",
        "okf_progresion_del_poder",
        "okf_recurso_acorralado",
      ].sort(),
    );
  });

  it("mvp/operaciones/plataformas inducen 0 nodos hoy (nadie tageado todavía)", () => {
    const concepts = loadOkfConcepts(REAL_OKF_ROOT);
    expect(inducedSubgraph(concepts, "mvp").size).toBe(0);
    expect(inducedSubgraph(concepts, "operaciones").size).toBe(0);
    expect(inducedSubgraph(concepts, "plataformas").size).toBe(0);
  });
});

describe("bfsFromAnchors — subgrafo real de escalado (6 nodos)", () => {
  it("desde cualquier ancla del subgrafo, profundidad 2 alcanza los 6 nodos (las 2 raíces actúan de hub)", () => {
    const concepts = loadOkfConcepts(REAL_OKF_ROOT);
    const subgraph = inducedSubgraph(concepts, "escalado");

    const result = bfsFromAnchors(subgraph, ["okf_recurso_acorralado"], 2, 6);

    expect(result).toContain("okf_recurso_acorralado");
    expect(result.sort()).toEqual(
      [
        "okf_contraposicionamiento",
        "okf_costos_de_cambio",
        "okf_creacion_de_marcas",
        "okf_definicion_de_poder",
        "okf_progresion_del_poder",
        "okf_recurso_acorralado",
      ].sort(),
    );
  });

  it("nunca cruza a un concepto de otro especialista (poda por subgrafo inducido, no por BFS)", () => {
    const concepts = loadOkfConcepts(REAL_OKF_ROOT);
    const subgraph = inducedSubgraph(concepts, "escalado");

    // okf_contraposicionamiento.related_concepts incluye okf_economias_de_escala
    // (concepto real de mvp, ver okf/7-powers/okf_contraposicionamiento.okf.md)
    // -- confirmar que la fuga NO ocurre pese a existir la arista en la
    // fuente completa.
    const result = bfsFromAnchors(subgraph, ["okf_contraposicionamiento"], 2, 6);
    expect(result).not.toContain("okf_economias_de_escala");
  });

  it("respeta maxDepth: profundidad 0 solo devuelve el ancla", () => {
    const concepts = loadOkfConcepts(REAL_OKF_ROOT);
    const subgraph = inducedSubgraph(concepts, "escalado");

    const result = bfsFromAnchors(subgraph, ["okf_contraposicionamiento"], 0, 6);
    expect(result).toEqual(["okf_contraposicionamiento"]);
  });

  it("respeta maxConcepts: corta los nodos más lejanos, nunca el ancla", () => {
    const concepts = loadOkfConcepts(REAL_OKF_ROOT);
    const subgraph = inducedSubgraph(concepts, "escalado");

    const result = bfsFromAnchors(subgraph, ["okf_recurso_acorralado"], 2, 2);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("okf_recurso_acorralado"); // distancia 0 siempre primero
  });

  it("ancla fuera del subgrafo (o inexistente) no rompe -- devuelve lista vacía", () => {
    const concepts = loadOkfConcepts(REAL_OKF_ROOT);
    const subgraph = inducedSubgraph(concepts, "escalado");

    expect(bfsFromAnchors(subgraph, ["okf_economias_de_escala"], 2, 6)).toEqual([]);
    expect(bfsFromAnchors(subgraph, ["no_existe"], 2, 6)).toEqual([]);
  });
});
