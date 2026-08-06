import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSourceCitation, extractPromptSections, translateOkfFuentes } from "../../src/okf/retrieval.js";
import { loadOkfConcepts } from "../../src/okf/loader.js";
import type { RetrievedOkfConcept } from "../../src/okf/types.js";

const REAL_OKF_ROOT = join(process.cwd(), "okf");

describe("extractPromptSections — contra el cuerpo real de okf_contraposicionamiento", () => {
  it("incluye las secciones 1, 2 y 4, omite la 3 (diagrama ASCII)", () => {
    const concepts = loadOkfConcepts(REAL_OKF_ROOT);
    const body = concepts.get("okf_contraposicionamiento")!.body;

    const result = extractPromptSections(body);

    expect(result).toContain("## 1. Resumen Ejecutivo");
    expect(result).toContain("## 2. Definición y Principios Clave");
    expect(result).toContain("## 4. Casos de Aplicación");
    expect(result).not.toContain("## 3. Componentes y Estructura");
    expect(result).not.toContain("MODELO DE NEGOCIO DEL RETADOR"); // contenido único de la sección 3
  });

  it("se puede pedir un subconjunto distinto de secciones", () => {
    const concepts = loadOkfConcepts(REAL_OKF_ROOT);
    const body = concepts.get("okf_contraposicionamiento")!.body;

    const result = extractPromptSections(body, [1]);
    expect(result).toContain("## 1. Resumen Ejecutivo");
    expect(result).not.toContain("## 2.");
  });
});

describe("buildSourceCitation", () => {
  it("concepto Verified: linaje sin marcador", () => {
    const concepts = loadOkfConcepts(REAL_OKF_ROOT);
    const concept = concepts.get("okf_contraposicionamiento")!;

    const citation = buildSourceCitation(concept);
    expect(citation).toBe(
      "7 Poderes: Los Fundamentos de la Estrategia Empresarial — Hamilton W. Helmer — Contraposicionamiento (Counter-positioning)",
    );
  });

  it("concepto Emerging: antepone el marcador de no validado", () => {
    const concepts = loadOkfConcepts(REAL_OKF_ROOT);
    const base = concepts.get("okf_contraposicionamiento")!;
    const emerging = { ...base, status: "Emerging" as const };

    const citation = buildSourceCitation(emerging);
    expect(citation.startsWith("[Conocimiento emergente, no validado] ")).toBe(true);
    expect(citation).toContain("Contraposicionamiento");
  });
});

describe("extractPromptSections — contra el cuerpo real de okf_legibilidad_organizacional (startup nativa de IA)", () => {
  it("incluye las secciones 1, 2 y 4, omite la 3 -- confirma que la renumeración de cabeceras al importar (la fuente no traía '1./2./3./4.') quedó bien hecha", () => {
    const concepts = loadOkfConcepts(REAL_OKF_ROOT);
    const body = concepts.get("okf_legibilidad_organizacional")!.body;

    const result = extractPromptSections(body);

    expect(result).toContain("## 1. Resumen Ejecutivo");
    expect(result).toContain("## 2. Definición y Principios Clave");
    expect(result).toContain("## 4. Casos de Aplicación");
    expect(result).not.toContain("## 3. Componentes y Estructura");
    expect(result).not.toContain("Autoridad Vigente y Explícita"); // contenido único de la sección 3, debe faltar
  });
});

describe("buildSourceCitation — concepto real Emerging (startup nativa de IA, primera fuente no-Verified del repo)", () => {
  it("antepone el marcador de conocimiento emergente sin que se lo tengamos que forzar en el test (status real del fichero, no un override sintético)", () => {
    const concepts = loadOkfConcepts(REAL_OKF_ROOT);
    const concept = concepts.get("okf_legibilidad_organizacional")!;

    expect(concept.status).toBe("Emerging"); // confirma que el import real dejó el status esperado
    const citation = buildSourceCitation(concept);
    expect(citation).toBe(
      "[Conocimiento emergente, no validado] El objetivo no es crear una organización nativa de la IA sino una que sea legible para la IA — Iain Roberts — Legibilidad Organizacional para la IA",
    );
  });
});

describe("translateOkfFuentes", () => {
  it("traduce concept_id a cita legible, ignora ids no recuperados", () => {
    const retrieved: RetrievedOkfConcept[] = [
      {
        conceptId: "okf_contraposicionamiento",
        title: "Contraposicionamiento",
        status: "Verified",
        sourceCitation: "7 Poderes — Helmer — Contraposicionamiento",
        texto: "...",
      },
    ];

    expect(translateOkfFuentes(["okf_contraposicionamiento", "id_inventado"], retrieved)).toEqual([
      "7 Poderes — Helmer — Contraposicionamiento",
    ]);
  });

  it("lista vacía si ningún id citado fue realmente recuperado", () => {
    expect(translateOkfFuentes(["id_inventado"], [])).toEqual([]);
  });
});
