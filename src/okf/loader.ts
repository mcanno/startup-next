// Carga del grafo OKF: escaneo de okf/**/*.okf.md, parseo del frontmatter
// no estándar (sin "---" de apertura en la mayoría de los ficheros reales,
// ver diseno_mecanismo_okf_grafo.md Punto 0.1) y validación de integridad
// (toda referencia de relations debe resolver a un id realmente cargado).
// Cacheado en memoria de proceso una sola vez (lazy singleton), mismo
// patrón que el TBox de ontology-engine (graph.py, load_tbox: se carga
// una vez y se cachea, no se reparsea por request).

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { okfConceptFrontmatterSchema, type OkfConcept } from "./types.js";

function splitFrontmatter(raw: string): { header: string; body: string } {
  const lines = raw.split(/\r?\n/);
  const start = lines[0]?.trim() === "---" ? 1 : 0;

  let closingIndex = -1;
  for (let i = start; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      closingIndex = i;
      break;
    }
  }
  if (closingIndex === -1) {
    throw new Error("OKF: no se encontró el delimitador de cierre '---' del frontmatter");
  }

  return {
    header: lines.slice(start, closingIndex).join("\n"),
    body: lines.slice(closingIndex + 1).join("\n").trim(),
  };
}

export function parseOkfFile(filePath: string, raw: string): OkfConcept {
  const { header, body } = splitFrontmatter(raw);

  let parsedYaml: unknown;
  try {
    parsedYaml = parseYaml(header);
  } catch (err) {
    throw new Error(`OKF: frontmatter YAML inválido en ${filePath}: ${(err as Error).message}`);
  }

  const result = okfConceptFrontmatterSchema.safeParse(parsedYaml);
  if (!result.success) {
    throw new Error(`OKF: frontmatter inválido en ${filePath}: ${result.error.message}`);
  }

  return { ...result.data, body, filePath };
}

function scanOkfFiles(rootDir: string): string[] {
  const results: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".okf.md")) results.push(full);
    }
  }
  walk(rootDir);
  return results;
}

export function loadOkfConcepts(rootDir: string): Map<string, OkfConcept> {
  const concepts = new Map<string, OkfConcept>();

  for (const filePath of scanOkfFiles(rootDir)) {
    const raw = readFileSync(filePath, "utf8");
    const concept = parseOkfFile(filePath, raw);
    const existing = concepts.get(concept.id);
    if (existing) {
      throw new Error(`OKF: id duplicado "${concept.id}" (${filePath} y ${existing.filePath})`);
    }
    concepts.set(concept.id, concept);
  }

  // Integridad del grafo: reemplaza la verificación manual que hacía el
  // usuario al construir los ficheros -- falla ruidoso acá, en la primera
  // carga, en vez de en silencio más adelante durante un run real.
  for (const concept of concepts.values()) {
    const referenced = [...concept.relations.prerequisites, ...concept.relations.related_concepts];
    for (const refId of referenced) {
      if (!concepts.has(refId)) {
        throw new Error(
          `OKF: "${concept.id}" (${concept.filePath}) referencia "${refId}" en relations, pero ese id no está cargado -- ¿fichero faltante o error de tipeo?`,
        );
      }
    }
  }

  return concepts;
}

const DEFAULT_OKF_ROOT = join(process.cwd(), "okf");

let cached: Map<string, OkfConcept> | undefined;

export function getOkfGraph(rootDir: string = DEFAULT_OKF_ROOT): Map<string, OkfConcept> {
  if (!cached) cached = loadOkfConcepts(rootDir);
  return cached;
}

// Solo para tests: fuerza releer del disco en la próxima llamada.
export function resetOkfGraphCache(): void {
  cached = undefined;
}
