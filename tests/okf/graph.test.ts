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

  it("mvp induce 0 nodos hoy (nadie tageado todavía)", () => {
    const concepts = loadOkfConcepts(REAL_OKF_ROOT);
    expect(inducedSubgraph(concepts, "mvp").size).toBe(0);
  });

  it("operaciones induce exactamente los 4 nodos de startup nativa de IA", () => {
    const concepts = loadOkfConcepts(REAL_OKF_ROOT);
    const subgraph = inducedSubgraph(concepts, "operaciones");
    expect([...subgraph.keys()].sort()).toEqual(
      [
        "okf_canal_producto_ia",
        "okf_capa_experta_inteligencia",
        "okf_legibilidad_organizacional",
        "okf_ontologia_empresarial_optimizable",
      ].sort(),
    );
  });

  it("plataformas induce exactamente los 10 nodos de Platform Scale", () => {
    const concepts = loadOkfConcepts(REAL_OKF_ROOT);
    const subgraph = inducedSubgraph(concepts, "plataformas");
    expect([...subgraph.keys()].sort()).toEqual(
      [
        "okf_efectos_red_inversos",
        "okf_escala_plataforma",
        "okf_interaccion_central",
        "okf_lienzo_plataforma",
        "okf_marco_trie",
        "okf_matriz_traccion_friccion",
        "okf_motor_pull_facilitate_match",
        "okf_pila_plataforma",
        "okf_resolucion_huevo_gallina",
        "okf_valor_acumulativo",
      ].sort(),
    );
  });
});

describe("bfsFromAnchors — subgrafo real de plataformas (10 nodos, topología distinta a escalado)", () => {
  // okf_interaccion_central es un hub dominante (8 de los otros 9 nodos lo
  // referencian directo en prerequisites/related_concepts) -- a diferencia
  // de escalado (6 nodos, cabían enteros bajo maxConcepts=6), acá el
  // subgrafo completo (10 nodos) excede el default y la poda de
  // bfsFromAnchors se ejercita de verdad por primera vez.
  it("desde el hub (interaccion_central), profundidad 2 alcanza los 10 nodos sin acotar tamaño", () => {
    const concepts = loadOkfConcepts(REAL_OKF_ROOT);
    const subgraph = inducedSubgraph(concepts, "plataformas");

    const result = bfsFromAnchors(subgraph, ["okf_interaccion_central"], 2, 100);
    expect(result).toHaveLength(10);
  });

  it("con maxConcepts por defecto (6), la poda corta los nodos más lejanos y conserva el ancla", () => {
    const concepts = loadOkfConcepts(REAL_OKF_ROOT);
    const subgraph = inducedSubgraph(concepts, "plataformas");

    const result = bfsFromAnchors(subgraph, ["okf_interaccion_central"]); // maxDepth/maxConcepts por defecto: 2/6
    expect(result).toHaveLength(6);
    expect(result[0]).toBe("okf_interaccion_central");
  });

  it("nunca cruza a un concepto de 7 Powers (poda por subgrafo inducido, no por BFS)", () => {
    const concepts = loadOkfConcepts(REAL_OKF_ROOT);
    const subgraph = inducedSubgraph(concepts, "plataformas");

    const result = bfsFromAnchors(subgraph, ["okf_interaccion_central"], 2, 100);
    expect(result.some((id) => id.includes("poder") || id.includes("marca") || id.includes("acorralado"))).toBe(
      false,
    );
  });
});

describe("bfsFromAnchors — subgrafo real de operaciones (4 nodos, densamente conectado)", () => {
  // A diferencia de plataformas (10 nodos, un hub único) y de escalado (6
  // nodos, 2 raíces hub), acá los 4 nodos NO están sueltos: 5 de las 6
  // aristas posibles del grafo completo existen (okf_legibilidad_organizacional
  // y okf_ontologia_empresarial_optimizable tienen grado 3 cada uno, conectados
  // a los otros 3). Con solo 4 nodos en total (< maxConcepts=6), la poda
  // nunca se ejercita acá -- cualquier ancla trae el subgrafo completo.
  it("desde cualquier ancla, profundidad 2 alcanza los 4 nodos (grafo denso, sin nodos sueltos)", () => {
    const concepts = loadOkfConcepts(REAL_OKF_ROOT);
    const subgraph = inducedSubgraph(concepts, "operaciones");

    for (const anchor of [...subgraph.keys()]) {
      const result = bfsFromAnchors(subgraph, [anchor], 2, 6);
      expect(result.sort()).toEqual(
        [
          "okf_canal_producto_ia",
          "okf_capa_experta_inteligencia",
          "okf_legibilidad_organizacional",
          "okf_ontologia_empresarial_optimizable",
        ].sort(),
      );
    }
  });

  it("nunca cruza a un concepto de 7 Powers ni de Platform Scale", () => {
    const concepts = loadOkfConcepts(REAL_OKF_ROOT);
    const subgraph = inducedSubgraph(concepts, "operaciones");

    const result = bfsFromAnchors(subgraph, ["okf_legibilidad_organizacional"], 2, 100);
    expect(result).toHaveLength(4);
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
