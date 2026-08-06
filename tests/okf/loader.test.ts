import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getOkfGraph, loadOkfConcepts, parseOkfFile, resetOkfGraphCache } from "../../src/okf/loader.js";

const REAL_OKF_ROOT = join(process.cwd(), "okf");

describe("parseOkfFile", () => {
  it("parsea un fichero SIN '---' de apertura (variante real mayoritaria de la fuente)", () => {
    const raw = [
      "id: okf_test_sin_apertura",
      "type: Concept",
      'title: "Test"',
      'version: "0.1"',
      "status: Verified",
      "verified: true",
      'created_at: "2026-08-05"',
      "sources:",
      '  - resource: "urn:test"',
      '    title: "Fuente de prueba"',
      "    authors:",
      '      - "Autor de prueba"',
      '    source_type: "Book"',
      '    extraction_method: "Test"',
      "tags: []",
      "especialistas: []",
      "relations:",
      "  prerequisites: []",
      "  related_concepts: []",
      "---",
      "",
      "# Test",
      "",
      "## 1. Resumen Ejecutivo",
      "cuerpo real",
    ].join("\n");

    const concept = parseOkfFile("fake.okf.md", raw);
    expect(concept.id).toBe("okf_test_sin_apertura");
    expect(concept.status).toBe("Verified");
    expect(concept.body).toContain("cuerpo real");
  });

  it("parsea un fichero CON '---' de apertura (variante real minoritaria de la fuente)", () => {
    const raw = [
      "---",
      "id: okf_test_con_apertura",
      "type: Concept",
      'title: "Test"',
      'version: "0.1"',
      "status: Emerging",
      "verified: false",
      'created_at: "2026-08-05"',
      "sources:",
      '  - resource: "urn:test"',
      '    title: "Fuente de prueba"',
      "    authors:",
      '      - "Autor de prueba"',
      '    source_type: "Book"',
      '    extraction_method: "Test"',
      "tags: []",
      "especialistas: []",
      "relations:",
      "  prerequisites: []",
      "  related_concepts: []",
      "---",
      "",
      "# Test",
    ].join("\n");

    const concept = parseOkfFile("fake.okf.md", raw);
    expect(concept.id).toBe("okf_test_con_apertura");
    expect(concept.status).toBe("Emerging");
  });

  it("lanza si falta el delimitador de cierre", () => {
    expect(() => parseOkfFile("fake.okf.md", "id: sin_cierre\ntype: Concept")).toThrow(/delimitador de cierre/);
  });
});

describe("loadOkfConcepts — contra los 19 ficheros reales de okf/ (7-powers + platform-scale)", () => {
  it("carga los 19 conceptos reales de las dos fuentes", () => {
    const concepts = loadOkfConcepts(REAL_OKF_ROOT);
    expect(concepts.size).toBe(19);
    expect([...concepts.keys()].sort()).toEqual(
      [
        "okf_contraposicionamiento",
        "okf_costos_de_cambio",
        "okf_creacion_de_marcas",
        "okf_definicion_de_poder",
        "okf_economias_de_escala",
        "okf_economias_de_red",
        "okf_poder_del_proceso",
        "okf_progresion_del_poder",
        "okf_recurso_acorralado",
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

  it("los 10 conceptos de Platform Scale están tageados especialistas: [plataformas]", () => {
    const concepts = loadOkfConcepts(REAL_OKF_ROOT);
    for (const id of [
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
    ]) {
      expect(concepts.get(id)?.especialistas).toEqual(["plataformas"]);
    }
  });

  it("los 4 conceptos propios de escalado + las 2 raíces están tageados especialistas: [escalado]", () => {
    const concepts = loadOkfConcepts(REAL_OKF_ROOT);
    const escaladoIds = [
      "okf_contraposicionamiento",
      "okf_costos_de_cambio",
      "okf_creacion_de_marcas",
      "okf_recurso_acorralado",
      "okf_definicion_de_poder",
      "okf_progresion_del_poder",
    ];
    for (const id of escaladoIds) {
      expect(concepts.get(id)?.especialistas).toEqual(["escalado"]);
    }
  });

  it("los 3 conceptos sin especialista implementado hoy quedan especialistas: []", () => {
    const concepts = loadOkfConcepts(REAL_OKF_ROOT);
    for (const id of ["okf_economias_de_escala", "okf_economias_de_red", "okf_poder_del_proceso"]) {
      expect(concepts.get(id)?.especialistas).toEqual([]);
    }
  });

  it("no encuentra ninguna referencia rota (grafo íntegro) -- no lanza", () => {
    expect(() => loadOkfConcepts(REAL_OKF_ROOT)).not.toThrow();
  });
});

describe("loadOkfConcepts — integridad del grafo, fixture sintética rota", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it("lanza con un mensaje claro si una relación referencia un id inexistente", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "okf-test-"));
    writeFileSync(
      join(tmpDir, "okf_roto.okf.md"),
      [
        "id: okf_roto",
        "type: Concept",
        'title: "Roto"',
        'version: "0.1"',
        "status: Verified",
        "verified: true",
        'created_at: "2026-08-05"',
        "sources:",
        '  - resource: "urn:test"',
        '    title: "Fuente"',
        "    authors: []",
        '    source_type: "Book"',
        '    extraction_method: "Test"',
        "tags: []",
        "especialistas: []",
        "relations:",
        "  prerequisites: []",
        "  related_concepts:",
        "    - okf_no_existe",
        "---",
        "",
        "# Roto",
      ].join("\n"),
    );

    expect(() => loadOkfConcepts(tmpDir)).toThrow(/okf_no_existe/);
  });
});

describe("getOkfGraph — lazy singleton", () => {
  afterEach(() => resetOkfGraphCache());

  it("cachea en memoria: dos llamadas devuelven la misma instancia de Map", () => {
    resetOkfGraphCache();
    const first = getOkfGraph(REAL_OKF_ROOT);
    const second = getOkfGraph(REAL_OKF_ROOT);
    expect(first).toBe(second);
  });
});
