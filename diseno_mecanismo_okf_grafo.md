# Diseño: mecanismo genérico de recuperación de conocimiento OKF por grafo

> Documento de arranque, generado antes de escribir código — mismo criterio
> que `diseno_especialista_ideacion.md`/`diseno_expansion_especialistas.md`.
> **No implementar nada de lo que sigue hasta confirmación explícita de
> este documento.**

## Objetivo

Diseñar un mecanismo genérico y reutilizable de recuperación de
conocimiento por grafo (navegación de nodos OKF vía sus relaciones
declaradas, no similitud vectorial), del que `escalado` es la **primera
implementación piloto**, no el objeto de diseño. Debe ser barato sumar
después `operaciones`/`plataformas`/otros especialistas OKF aportando solo
sus ficheros y registrando el especialista — sin rediseñar el mecanismo.

Convive con el RAG vectorial ya verificado en producción
(`ideacion`/`mvp`/`pmf`): **no se toca ninguno de los tres**. Todo lo que
sigue está investigado contra el código real (`src/`) y contra los 9
ficheros OKF reales ya aportados por el usuario, no supuesto.

## Punto 0 — Los ficheros OKF reales: formato confirmado por inspección directa

Los 9 ficheros existen hoy en `c:\Users\Manuel\Desktop\TRABAJO\FUENTES\`
(fuera de los 4 repos de trabajo), no en `startup-next`. Inspeccionados 3
directamente (`okf_definicion_de_poder`, `okf_progresion_del_poder`,
`okf_contraposicionamiento`) para confirmar el formato con evidencia real,
no solo por el resumen del usuario:

```
id: okf_contraposicionamiento
type: Concept
title: "Contraposicionamiento (Counter-positioning)"
version: "0.2"
status: Verified
verified: true
created_at: "2026-08-04"
sources:
  - resource: "urn:isbn:9780998116303"
    title: "7 Poderes: Los Fundamentos de la Estrategia Empresarial"
    authors:
      - "Hamilton W. Helmer"
    source_type: "Book"
    extraction_method: "Conceptual Abstraction & Paraphrase"
tags:
  - estrategia
  - ventaja_competitiva
  - contraposicionamiento
  - modelos_de_negocio
relations:
  prerequisites: []
  related_concepts:
    - okf_economias_de_escala
    - okf_costos_de_cambio
---

# Contraposicionamiento (Counter-positioning)

## 1. Resumen Ejecutivo
...
## 2. Definición y Principios Clave
...
## 3. Componentes y Estructura
   (diagramas ASCII)
## 4. Casos de Aplicación / Implicaciones Prácticas
...
```

**Hallazgos reales que cambian supuestos, no asumidos de antemano**:

1. **No hay `---` de apertura** — el frontmatter empieza directo en la
   línea 1 (`id: ...`), solo hay un `---` de cierre antes del cuerpo (y
   otro `---` suelto al final del archivo, aparentemente decorativo). Esto
   **no es frontmatter estándar** (gray-matter y similares esperan `---`
   de apertura) — el parser tiene que ser un split manual en el primer
   `\n---\n`, no una librería de frontmatter estándar sin adaptar.
2. **Extensión real `.okf.txt`**, no `.md`, con nombres de archivo
   inconsistentes (espacios, tildes: `7_poderes_4_costos de cambio.okf.txt`)
   — no usables tal cual como convención de repo.
3. **`relations.prerequisites` de los ficheros reales es un DAG
   *conceptual/compositivo* (para entender X hace falta entender Y),
   no el mismo significado que `is_sequential` en el TBox de
   `ontology-engine`** (que es orden metodológico real de una startup —
   "Hypothesis precede Experiment"). Evidencia: `okf_progresion_del_poder`
   tiene `prerequisites: [okf_contraposicionamiento, okf_economias_de_escala,
   ...]` (los 7 poderes) — significa "para entender la progresión hace
   falta entender cada poder", no "hacer cada poder antes de la
   progresión" en el sentido temporal de una startup real. Los 4 conceptos
   de `escalado` tienen `prerequisites: []` — toda su conectividad viene de
   `related_concepts` (simétrico, débil) y de ser destino de los
   `prerequisites` de `okf_progresion_del_poder`.
4. **No existe ningún campo que declare a qué especialista pertenece un
   concepto** (ni `especialistas`, ni `tags` de especialista — el `tags`
   existente es temático libre: `estrategia`, `ventaja_competitiva`, etc.,
   no un tag de enrutamiento). El mapeo concepto→especialista hoy solo
   vive en `diseno_expansion_especialistas.md` (tabla del Punto 2), no en
   los ficheros. Hace falta declararlo en algún lado (Punto 1 abajo).
5. **No hay linter/validador del grafo** — "grafo íntegro" en la
   descripción del usuario es verificación manual, no una herramienta.
   Confirmado por búsqueda exhaustiva en los 4 repos (ninguna referencia a
   "OKF" en código de `startup-next`/`startup-next-ui`/`startup-advisor`) y
   en `c:\Users\Manuel\Desktop\TRABAJO\FUENTES\` (ninguna herramienta, solo
   los 10 `.txt`). `hermes-startup-next/src/memory/` tiene un formato
   llamado igual ("OKF") pero con campos distintos (`producer`, `estado`,
   sin `prerequisites`/`related_concepts`) — es un uso hermano, no la
   fuente de este formato. No hay nada que reusar de ahí.

**Grafo real de los 9 conceptos** (para referencia del resto del
documento):

| Concepto | `prerequisites` | `related_concepts` | Especialista (según tabla ya confirmada) |
|---|---|---|---|
| `okf_definicion_de_poder` (raíz) | `[]` | los otros 8 | compartido (marco) |
| `okf_progresion_del_poder` (raíz) | los 7 poderes | `[]` | compartido (marco) |
| `okf_economias_de_escala` | `[]` | red, costos_de_cambio | `mvp` |
| `okf_economias_de_red` | `[]` | (no inspeccionado, no crítico para el piloto) | `plataformas` |
| `okf_contraposicionamiento` | `[]` | economias_de_escala, costos_de_cambio | `escalado` |
| `okf_costos_de_cambio` | `[]` | (no inspeccionado) | `escalado` |
| `okf_creacion_de_marcas` | `[]` | (no inspeccionado) | `escalado` |
| `okf_poder_del_proceso` | `[]` | (no inspeccionado) | `operaciones` |
| `okf_recurso_acorralado` | `[]` | (no inspeccionado) | `escalado` |

## Punto 1 — Pertenencia concepto→especialista: tag aditivo en el frontmatter, mismo criterio que `especialista_tags`

**Problema real**: los ficheros no declaran a qué especialista sirven, y
un mismo grafo OKF (7 Powers) alimenta a varios (`mvp`, `escalado`,
`operaciones`, `plataformas`) sin duplicar ficheros.

**Propuesta**: añadir `especialistas: string[]` al frontmatter al momento
de importar el fichero al repo (no lo tiene la fuente original, se agrega
en la copia versionada). Mismo criterio exacto que `especialista_tags`
en `rag_chunks` (`diseno_especialista_ideacion.md`, Punto 1): **aditivo**,
un concepto puede servir a más de un especialista, y la pertenencia se
declara explícita en vez de inferirse de la carpeta o del nombre de
archivo.

- Los 4 conceptos propios de `escalado` (`contraposicionamiento`,
  `costos_de_cambio`, `creacion_de_marcas`, `recurso_acorralado`):
  `especialistas: [escalado]`.
- Los 2 conceptos raíz (`definicion_de_poder`, `progresion_del_poder`):
  `especialistas: [escalado]` **por ahora** — no `[mvp, escalado,
  operaciones, plataformas]` preventivamente. Mismo criterio ya aplicado
  dos veces en este proyecto (TBox de `ideacion` no anclado sin evidencia;
  63 chunks de `operaciones` no re-etiquetados "por ahora" en
  `diseno_expansion_especialistas.md`, Confirmado #3): no taggear para un
  especialista que todavía no consume el concepto. Cuando `operaciones`
  construya su propio diseño y quiera este marco, agrega `operaciones` al
  array de esos 2 ficheros — edición aditiva de 2 archivos ya versionados,
  sin duplicarlos, exactamente el patrón ya usado con los `.jsonl`.
- Los otros 3 conceptos (`economias_de_escala` → `mvp`,
  `economias_de_red` → `plataformas`, `poder_del_proceso` →
  `operaciones`): se copian al repo igual (el grafo completo, íntegro,
  como lo aportó el usuario) pero con `especialistas: []` — presentes,
  inertes, sin especialista que los consuma todavía. **Ninguno se
  etiqueta `mvp` ahora** aunque la tabla de mapeo ya lo decida a futuro:
  taggearlo hoy sería wiring especulativo hacia un especialista (`mvp`)
  que la consigna explícita de este documento prohíbe tocar.

**Por qué un tag y no una carpeta**: la carpeta de import se organiza por
**fuente** (Punto 2), no por especialista, porque un fichero puede servir
a más de uno — igual que `customer-development.jsonl` sirve a `mvp` y
`pmf` desde un solo archivo. Organizar por especialista forzaría a
decidir "de quién es" un concepto compartido, cuando la respuesta real es
"de varios, según el tag".

## Punto 2 — Almacenamiento: carpeta por fuente, nombre de archivo normalizado

```
startup-next/
  okf/
    7-powers/
      okf_definicion_de_poder.okf.md
      okf_progresion_del_poder.okf.md
      okf_economias_de_escala.okf.md
      okf_economias_de_red.okf.md
      okf_contraposicionamiento.okf.md
      okf_costos_de_cambio.okf.md
      okf_creacion_de_marcas.okf.md
      okf_poder_del_proceso.okf.md
      okf_recurso_acorralado.okf.md
```

- **Carpeta por fuente** (`okf/7-powers/`, después `okf/jobs-to-be-done/`
  si algún día JTBD también pasa a OKF, etc.) — no por especialista, ver
  justificación en Punto 1.
- **Nombre de archivo = `id` del concepto** (`okf_contraposicionamiento`,
  no `7_poderes_3_contraposicionamiento`) — determinístico, sin espacios
  ni tildes, sin numerar por capítulo (el número de capítulo no es
  identidad del concepto). Se renombra al importar, la fuente original en
  `FUENTES/` no se toca (no es parte de ningún repo, es material de
  entrada del usuario).
- **Extensión `.okf.md`** (no `.okf.txt` como la fuente, no `.md` a secas):
  el `.okf` marca el formato especial (frontmatter no estándar, ver Punto
  0.1) para quien lo abra o grep-ee (`**/*.okf.md`), y `.md` habilita
  renderizado/resaltado de Markdown en el editor y en GitHub — el cuerpo
  ya es Markdown real. Es una normalización deliberada de la extensión de
  la fuente, se marca acá para confirmar con el usuario antes de aplicarla
  (no es una decisión unilateral silenciosa).
- **Versionado con git, en texto plano** — decidido por el usuario, no a
  debatir. Revisable en PR como cualquier cambio de código, coherente con
  "conocimiento compilable".

## Punto 3 — Carga: lazy singleton en memoria, mismo patrón que el TBox de `ontology-engine`

**Precedente real ya usado en este mismo proyecto** (`ontology-engine/graph.py`,
`OntologyGraph`/`load_tbox`): el TBox se carga una vez por proceso, se
cachea en memoria (`networkx.MultiDiGraph`), y las consultas
(`precedents_of`) son BFS en memoria sin volver a tocar la fuente. El
mecanismo OKF replica esa misma forma, en TypeScript, sobre archivos en
vez de Postgres:

```
src/okf/
  types.ts     — OkfConcept, frontmatter Zod schema
  loader.ts    — escaneo de okf/**/*.okf.md, parseo, validación de
                 integridad, singleton lazy cacheado en memoria de proceso
  graph.ts     — subgrafo inducido por especialista + BFS acotado desde
                 un ancla (Punto 4)
  retrieval.ts — selección de ancla + orquesta loader+graph para producir
                 la lista final de conceptos a inyectar en el prompt
```

**`loader.ts`**: `fs.readdirSync` recursivo sobre `okf/`, por archivo:
split manual en el primer `\n---\n` (no gray-matter — no calza con el
formato real, ver Punto 0.1), `YAML.parse()` del bloque de cabecera
(paquete nuevo `yaml`, único dependency nueva propuesta — liviano, sin
transitive deps pesadas, mismo criterio que `unpdf` se sumó para una
necesidad puntual de parseo) validado contra un Zod schema
(`okfConceptFrontmatterSchema`), cuerpo Markdown crudo tal cual (sin
parsear a AST — se inyecta como texto al prompt, igual que
`RetrievedChunk.texto` hoy).

**Validación de integridad al cargar (nuevo, no existía antes)**: por cada
`id` referenciado en `relations.prerequisites`/`relations.related_concepts`
de cualquier concepto, confirmar que ese `id` resuelve a un fichero
realmente cargado — si no, lanzar al cargar (falla ruidosa en el primer
uso, no en silencio más adelante durante un run real). Reemplaza la
verificación manual de "grafo íntegro" por una automática, barata (una
pasada sobre ~9-20 nodos), que protege contra un error de tipeo en un
`id` la próxima vez que alguien edite o sume ficheros.

**Lazy, no eager en `main.ts`**: `main.ts` hoy no carga nada de dominio al
arrancar (solo registra rutas, ver `src/main.ts:9-15`) — cargar OKF ahí
acoplaría el boot de `/health` y de rutas no relacionadas a la
disponibilidad de un directorio de conocimiento. Propuesta: `let cached:
OkfGraph | undefined` a nivel de módulo en `loader.ts`, poblado en la
primera llamada real (desde `escalado.ts` u otro especialista OKF), igual
de barato releerlo en cada request si no se cachea (archivos locales, sin
red) pero sin sentido re-parsear en cada invocación — mismo criterio de
"no recalcular lo que no cambia dentro del proceso" que ya aplica al TBox.

## Punto 4 — Algoritmo de recuperación: subgrafo inducido por tag + BFS acotado desde un ancla

**Paso 1 — subgrafo inducido por especialista**: antes de cualquier
navegación, filtrar el grafo completo a los nodos cuyo `especialistas`
contiene el rol actual (`escalado` → 6 nodos: 4 propios + 2 raíces
compartidas, según Punto 1). Esto resuelve de raíz el riesgo de fuga
entre especialistas señalado por el usuario (ej. `contraposicionamiento`
tiene `related_concepts: [okf_economias_de_escala, ...]`, un concepto de
`mvp` — si se navegara sobre el grafo completo sin filtrar, la
recuperación de `escalado` podría traer contenido de `mvp`). Mismo
criterio que ya se aplicó explícitamente en el proyecto: preferir "corpus
pequeño y limpio" sobre "prestado de otro rol" (`diseno_expansion_especialistas.md`,
Confirmado #3).

**Paso 2 — selección de ancla, por LLM, sobre el conjunto cerrado y
pequeño del especialista**: el conjunto de conceptos posibles por
especialista es chico (6 para `escalado` hoy, del orden de una decena aun
sumando fuentes futuras) — no hace falta embeddings ni búsqueda semántica
para elegir entre 6 opciones. Propuesta: una llamada LLM chica,
estructurada, mismo patrón ya probado en `evaluarConflictoModoBase`
(`orchestratorModoBase.ts`, `maxTokens: 512, effort: "low"`): se le da al
modelo el título + Resumen Ejecutivo (sección 1 del cuerpo, no el
concepto entero) de cada uno de los 6 nodos del subgrafo y el
`accionNext` (título/descripción/justificación), y devuelve 1-2 `id` de
ancla (schema nuevo, chico:
`{ conceptos_ancla: z.array(z.string()).min(1).max(2) }`). Alternativa
descartada: heurística de keyword-matching contra el título — más
barata pero fragil y sin evidencia de que el costo de la llamada LLM
(pequeña, ~6 opciones) sea un problema real; se prefiere el camino ya
probado en el proyecto (LLM chico para decisiones acotadas) sobre inventar
un matcher nuevo sin evidencia de que haga falta.

**Paso 3 — BFS acotado desde el/los ancla(s), dentro del subgrafo ya
filtrado**: mismo algoritmo que `precedents_of` de `ontology-engine/graph.py`
(BFS con `seen`/`frontier`, cuenta distancia) pero sobre ambas relaciones
(`prerequisites` y `related_concepts`, tratadas como no dirigidas para
este propósito — a diferencia del TBox, acá no importa la dirección, solo
"qué está conceptualmente cerca"), acotado por:
- `maxDepth` (default `2`): ancla + 2 saltos.
- `maxConcepts` (default `6`, mismo orden de magnitud que
  `searchRagChunks(..., limit = 5)`): si la frontera excede el máximo, se
  cortan primero los nodos más lejanos (mayor distancia BFS), nunca el
  ancla.

**Nota honesta sobre el piloto**: con solo 6 nodos en el subgrafo de
`escalado`, en la práctica el BFS acotado devuelve casi siempre el
subgrafo entero sin importar el ancla elegida (está todo a distancia ≤2
de cualquier nodo, por los 2 raíces actuando de hub). El mecanismo de
poda no se ejercita a fondo en este piloto — se diseña igual, con
evidencia real de por qué hace falta (grafos futuros de operaciones/
plataformas, o fuentes nuevas más grandes, no se acotan solos), pero no
hay que esperar que el piloto demuestre la poda en acción, solo que el
mecanismo funciona.

**Paso 4 — serialización para el prompt**: por cada concepto del subgrafo
resultante, se inyecta `id`, `title`, `status`, y **secciones 1 (Resumen
Ejecutivo), 2 (Definición y Principios Clave) y 4 (Casos de Aplicación)**
del cuerpo — se omite la sección 3 (Componentes y Estructura, diagramas
ASCII) por defecto: confirmado por inspección real de los 3 ficheros
leídos que son diagramas de caracteres pensados para lectura humana, con
bajo valor accionable para el modelo y costo de tokens no trivial (un
diagrama de ~15 líneas). Mismo criterio de "no inflar contexto sin
evidencia de que aporte" ya aplicado a otras decisiones del proyecto.

## Punto 5 — Formato de cita/atribución: linaje desde `sources`, no chunk_id

**Fuente real de la cita**: `sources[0].title` + `sources[0].authors` del
propio concepto (ya presente en el frontmatter, no hay que inventar
metadata nueva) + `title` del concepto como equivalente a "capítulo".
Ejemplo real, con los datos de `okf_contraposicionamiento`:

```
7 Poderes: Los Fundamentos de la Estrategia Empresarial — Hamilton W. Helmer — Contraposicionamiento (Counter-positioning)
```

**Regla de presentación (Verified vs. Emerging)**: si `status !==
"Verified"`, la cita se antepone con un marcador fijo, mismo mecanismo ya
usado para la frase de encuadre de `PREREQUISITO_GENERICO`
(`orchestratorModoBase.ts`, `FRASE_ENCUADRE`, texto fijo antepuesto):

```
[Conocimiento emergente, no validado] <linaje>
```

**Sin cambios de schema ni de UI**: confirmado por lectura real de
`recomendacionSchema.fuentes` (`src/schemas.ts:93-98`, `z.array(z.string())`,
genérico) y de los dos consumidores reales (`startup-next-ui/components/InformeFinalView.tsx:22-28`
y `informe-pdf.tsx:89-93`, ambos renderizan `fuentes` como lista plana de
strings) — el marcador es parte del string ya construido por el backend,
no un campo nuevo. Aplica la cuarta cláusula del principio rector
(revelar grado de certeza) con el costo mínimo real: cero cambios de
contrato.

## Punto 6 — Convivencia con RAG vectorial: cambios mínimos confirmados por código real

**No se toca**: `ideacion.ts`, `mvp.ts`, `pmf.ts`, `ragQueries.ts`,
`orchestrator.ts`, `orchestratorModoBase.ts` (el TBox de prerrequisitos
metodológicos —`ESPECIALISTA_A_CONCEPTO`, `getPrerequisitosParaEspecialista`—
es un concern completamente separado, ya confirmado antes de
`especialista_requerido` resolver a un rol OKF o RAG; `escalado` ya tiene
ancla `EngineOfGrowth` ahí desde antes de este documento y sigue
funcionando exactamente igual, sin relación con este mecanismo nuevo).

**Cambios mínimos identificados, con evidencia real de por qué cada uno
hace falta**:

1. **`src/graph/state.ts:32`** — hoy `retrievedChunks:
   Annotation<RetrievedChunk[]>`, tipo fijo de RAG. Se agrega un campo
   paralelo `retrievedConcepts: Annotation<RetrievedOkfConcept[]>({
   reducer: (_l, r) => r, default: () => [] })`. No se generaliza
   `retrievedChunks` a un tipo unión — cambiar su tipo tocaría
   `ideacion.ts`/`mvp.ts`/`pmf.ts` (los 3 protegidos) y `validator.ts` en
   más puntos de los necesarios. Un especialista RAG deja
   `retrievedConcepts: []` (default, no lo toca); uno OKF deja
   `retrievedChunks: []` (default, no lo toca) — nunca ambos poblados a
   la vez, porque `especialista_requerido` resuelve a un único rol por
   ciclo.
2. **`src/graph/nodes/specialist.ts`** (`dispatchSpecialist`) — el tipo de
   retorno pasa de `Promise<{ borrador: Borrador; retrievedChunks:
   RetrievedChunk[] }>` a `Promise<{ borrador: Borrador; retrievedChunks:
   RetrievedChunk[]; retrievedConcepts: RetrievedOkfConcept[] }>`. Se
   agrega `case "escalado": return runEscaladoSpecialist(...)`
   (`runEscaladoSpecialist` devuelve `retrievedChunks: []` explícito,
   `runMvpSpecialist`/`runIdeacionSpecialist`/`runPmfSpecialist` devuelven
   `retrievedConcepts: []` explícito — un campo extra por función, no una
   reescritura).
3. **`src/graph/nodes/validator.ts`** — `checkCalidadYFuentes` y
   `translateFuentes` (hoy acopladas a `RetrievedChunk[]`, líneas 23-46)
   pasan a operar sobre la unión de ids válidos de ambas listas: el `Set`
   de `checkCalidadYFuentes` se arma con
   `[...retrievedChunks.map(chunkId), ...retrievedConcepts.map(id)]`, y
   `translateFuentes` intenta primero `byChunkId.get(id)` y si no
   encuentra, `byConceptId.get(id)` (delegado a un helper de `src/okf/`
   para no mezclar el formato de cita OKF — Punto 5 — dentro de
   `validator.ts`). Sigue sin haber ninguna llamada LLM nueva en el
   validador: la verificación de fuentes sigue siendo pertenencia de
   conjunto, determinística, igual que hoy (sección 4 del diseño
   original, ya citada en `validator.ts:20-22`).
4. **`src/schemas.ts` — sin cambios de schema**. `specialistDecisionSchema.recomendaciones[].chunk_ids_citados`
   (`src/schemas.ts:215-217`) se reusa **tal cual, incluido el nombre**,
   para que un especialista OKF cite `id`s de concepto en el mismo campo
   — Zod no valida semántica de nombre, solo forma (`string[]`). Es
   deliberadamente **no** el camino más prolijo (el nombre del campo dice
   "chunk" y va a llevar `concept_id`s) — se documenta acá como wart
   consciente, no oculto: la alternativa (renombrar a algo neutral como
   `fuentes_citadas`) tocaría `mvp.ts`/`ideacion.ts`/`pmf.ts` y sus tests,
   violando la consigna explícita de no tocarlos en esta ronda. Queda
   anotado como limpieza futura, a hacer junto con algún cambio que ya
   toque esos 3 archivos por otro motivo, no ahora.
5. **`src/graph/especialistasImplementados.ts`** — se agrega `"escalado"`
   al `Set` cuando se implemente (Punto 3 del ciclo ya establecido en
   `diseno_expansion_especialistas.md`, Punto 4). El mecanismo en sí ya es
   agnóstico de esto — es la misma fuente única de verdad de siempre, sin
   cambios estructurales.

**Confirmado limpio, sin cambios necesarios** (mismo formato que los dos
documentos precedentes, para que quede explícito qué se revisó y se
descartó, no que se pasó por alto):

- `src/routes/runs.ts` (`serializeRun`) — no conoce el mecanismo interno
  de cada especialista, solo `informe_final`/`resultado`, sin cambios.
- `src/config/models.ts` — compartido por todos los especialistas ya
  (Punto 4 de `diseno_especialista_ideacion.md`), se hereda gratis;
  `runEscaladoSpecialist` usa `getSpecialistModelConfig()` igual que
  `runMvpSpecialist`.
- `src/lib/structuredOutputRetry.ts` — genérico sobre cualquier schema
  (`invokeStructured(schema, name, call)`), se reusa tal cual para la
  llamada de selección de ancla (Punto 4, Paso 2) y para
  `runEscaladoSpecialist`.

## Punto 7 — Plan de verificación del piloto

**Caso real u obligatorio, mismo estándar que los especialistas RAG**: al
menos un caso real o realista de `escalado` (texto libre inequívoco, ej.
"ya tenemos encaje producto-mercado confirmado, necesitamos decidir cómo
defender nuestra posición del próximo competidor que copie el modelo")
contra producción — confirmar `especialista_usado: "escalado"`,
`status: "approved"`, y que `informe_final.recomendaciones[].fuentes`
trae linaje real de 7 Powers (Punto 5), no vacío.

**Regresión obligatoria de los 3 existentes** (Punto 6 de
`diseno_expansion_especialistas.md`, ya aplica igual: el cambio del
`SYSTEM_PROMPT` compartido del orquestador para sumar la frontera de
`escalado` afecta a cualquier corrida) — reinvocar `ideacion` (Cafelibro
real) y `mvp`/`pmf` (texto libre), mismo protocolo ya usado el
2026-08-03 para el fix del desanidado.

**Comparación real contra `pmf` (RAG vectorial), con evidencia, no
impresión**:

- **Tasa de fallo de structured output**: `pmf` post-fix (`2941ec0`) tiene
  baseline real medido (12/12 aprobadas en producción, ver `HANDOFF.md`).
  El bug de desanidado es de la capa de `structuredOutputRetry.ts`
  (forma de la respuesta), no depende de si el contexto vino de RAG o de
  OKF — la expectativa es tasa de fallo similar. Si `escalado` muestra una
  tasa notablemente distinta en ~10 corridas reales, es señal a investigar
  (aunque probablemente no causada por el mecanismo de recuperación en sí).
- **Tasa de citación real**: proporción de recomendaciones con
  `chunk_ids_citados`/`concept_ids_citados` no vacío, comparable
  directamente al mismo dato ya implícito en las verificaciones de `pmf`
  e `ideacion` (ambas citaron fuentes reales del corpus re-etiquetado).
- **Lectura cualitativa de 2-3 `informe_final` reales**: ¿las citas OKF
  (linaje de libro/concepto) son igual de útiles para el fundador que las
  citas RAG (libro/capítulo/sección)? Es la pregunta central del piloto,
  no automatizable — se documenta en `HANDOFF.md` como hallazgo, no se
  decide en este documento.
- **Costo/complejidad de ingeniería**: cuántos archivos/líneas nuevas hizo
  falta vs. una ingesta RAG completa (parse+load+re-etiquetado) — dato
  objetivo que ya se puede medir al cerrar la implementación.

**No se decide acá si migrar `ideacion`/`mvp`/`pmf`** — la decisión queda
para una sesión aparte, con la evidencia de arriba ya recolectada, no
antes.

**Offline, antes de producción**: tests unitarios de `src/okf/loader.ts`
(parseo del frontmatter no estándar, detección de referencia rota =
fallo) y `src/okf/graph.ts` (BFS acotado: profundidad, tope de nodos,
que nunca cruza a un concepto sin el tag del especialista) — mismo
estándar que `tests/lib/structuredOutputRetry.test.ts` (fixtures reales,
no sintéticas donde sea posible: usar los propios ficheros de
`okf/7-powers/` como fixture, no inventar un grafo de prueba paralelo).

**Limpieza**: mismo protocolo de siempre — cualquier run de prueba
borrado al cierre, confirmado por conteo, runs reales de fundadores nunca
tocados.

## Fuera de alcance de este documento

- No se implementa nada de lo que sigue en esta sesión — solo el diseño.
- No se construyen `operaciones` ni `plataformas` — solo se deja el molde
  listo para que sumarlos sea aportar ficheros + tag + un
  `src/specialist/<rol>.ts` nuevo, sin tocar `src/okf/`.
- No se migra `ideacion`/`mvp`/`pmf` a OKF — quedan en RAG vectorial,
  intocados; el piloto solo mide, no migra.
- No se etiqueta `especialistas: [mvp]` en `okf_economias_de_escala` ni
  se toca `mvp.ts` de ninguna forma, aunque la tabla de mapeo ya asigne
  ese concepto a `mvp` a futuro (ver Punto 1) — es una asignación
  declarada para cuando le toque el turno a `mvp` en una sesión futura,
  no wiring de este documento.
- No se decide el criterio final de "cuándo migrar" un especialista RAG a
  OKF — el piloto recolecta evidencia, la decisión es de una sesión
  aparte.
- No se resuelve la limpieza del nombre `chunk_ids_citados` (Punto 6.4) —
  anotada como deuda consciente, no se toca en esta ronda.

## Puntos a confirmar con el usuario antes de implementar

1. **Extensión de archivo**: ¿`.okf.md` (propuesta de este documento,
   normaliza `.okf.txt` de la fuente) o se prefiere mantener `.okf.txt`
   tal cual para no divergir del nombre que ya usa el generador externo
   de estos ficheros?
2. **Dependency nueva `yaml`**: única librería nueva propuesta (para
   parsear el bloque de cabecera tras el split manual en `\n---\n`) — ¿se
   aprueba, o se prefiere un parser manual sin dependency nueva dado que
   el frontmatter real es sencillo (claves planas + 2 arrays chicos)?
3. **Los 3 conceptos sin especialista implementado hoy**
   (`economias_de_escala`, `economias_de_red`, `poder_del_proceso`): ¿se
   copian igual al repo ahora (íntegros, `especialistas: []`, inertes)
   junto con los 6 que sí usa `escalado`, o se copian recién cuando le
   toque el turno a cada especialista, mismo criterio que ya se usó para
   las fuentes RAG ("se aportan cuando le toque el turno")?
4. **Selección de ancla por LLM (Punto 4, Paso 2)**: ¿confirma la
   propuesta (llamada chica, mismo patrón que `evaluarConflictoModoBase`)
   o prefiere la alternativa descartada (heurística de keyword-matching,
   más barata pero no probada en este proyecto)?

Con esas cuatro respuestas, el mecanismo queda listo para implementarse
siguiendo el mismo ciclo ya usado para `pmf`: diseño confirmado → import
de ficheros → `src/okf/*` → `src/specialist/escalado.ts` → los 5 puntos
de enrutamiento del Punto 6 → verificación real contra producción (Punto
7) antes de cerrar. No se escribe código de `src/okf/` ni de
`src/specialist/escalado.ts` ni se toca `state.ts`/`specialist.ts`/
`validator.ts`/`especialistasImplementados.ts` hasta que este documento
se confirme explícitamente.
