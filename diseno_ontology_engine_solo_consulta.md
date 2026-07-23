# Diseño: ontology-engine como servicio puramente de consulta (TBox only)

> Documento de arranque, generado antes de escribir código (mismo criterio que
> `handoff_startup_next_v2.md` y `hermes-startup-next/HANDOFF_CONTEXTO_HISTORICO.md`).
> Cubre los puntos 1, 3, 4, 5, 6 del encargo — **propuesta, no implementada**.
> El punto 2 (borrado del ABox real de las 11/12 startups) ya se ejecutó y
> verificó por separado — ver `ontology-engine/HANDOFF.md`, sección "Borrado
> completo del ABox (2026-07-23)". No se toca código de `startup-next` ni
> `startup-advisor` hasta confirmación explícita de este documento.

## Motivación (recordatorio, no repetido en detalle)

`ontology-engine` no tiene autenticación y persistía hechos reales de
startups reales en una Neon compartida sin control de acceso — contradice
la visión original de confidencialidad/local-first del proyecto. Decisión ya
tomada: `ontology-engine` queda como TBox puro (metodología Lean Startup,
R1-R4, aséptico), sin ABox de ninguna startup real. Detalle completo en
`hermes-startup-next/HANDOFF_CONTEXTO_HISTORICO.md`, sección "Revisión de
arquitectura (2026-07-21)".

## Punto 1 — Inventario de endpoints, con evidencia de código

Contra `startup-advisor/ontology-engine/main.py` (docstring + implementación,
líneas 4-14 y 56-201) y un grep de callers reales en los tres repos
(`startup-next`, `startup-advisor`, `hermes-startup-next`):

| Endpoint | Tipo | Quién lo llama hoy (evidencia) | Acción propuesta |
|---|---|---|---|
| `GET /health` | — | Fly healthcheck (`fly.toml`) | **Mantener** |
| `GET /concepts` | TBox | Ninguno de los 3 repos lo llama hoy (verificado por grep) | **Mantener** (contrato público, aunque sin caller activo) |
| `GET /concepts/{id}` | TBox | `startup-advisor/src/lib/ontologyEngine.ts:describeConcept` — definida pero **sin ningún caller** en el propio repo (grep confirma cero usos fuera de su propia definición) | **Mantener** endpoint; `describeConcept` queda como código muerto preexistente, no se toca (no es parte de este encargo) |
| `GET /concepts/{id}/subclasses` | TBox | `startup-advisor/src/lib/ontologyReasoning.ts:buildRecordTools` (líneas 53-56, subtipos de Hypothesis/Metric para las tools dinámicas de extracción) | **Mantener** |
| `GET /concepts/{id}/prerequisitos` | TBox | `startup-next/src/graph/nodes/orchestratorModoBase.ts:getPrerequisitosParaEspecialista` (línea 65) — ya es el mecanismo de "modo base" | **Mantener** — es la pieza central de la propuesta de reemplazo (ver punto 3) |
| `GET /startups/{id}/graph` | ABox (lectura) | `startup-next/.../orchestratorModoBase.ts:resolveOntologyContext` (línea 51, el gate `individuals.length > 0`); `startup-advisor/.../ontologyReasoning.ts:ensureCoreIndividuals` (línea 31, para no duplicar el individual `Startup`/`Founder`) | **Retirar** |
| `GET /startups/{id}/neighbors/{node_id}` | ABox (lectura) | **Ningún caller en ningún repo** (grep de `neighbors` en los 3 repos: cero resultados) | **Retirar** (endpoint ya muerto hoy, ni siquiera espera al punto 3) |
| `GET /startups/{id}/validate` | ABox (lectura) + motor de reglas (`rules.py`) | `startup-next/src/graph/nodes/validator.ts:23` y `orchestratorModoBase.ts` (vía `resolveOntologyContext`, solo si `graph.individuals.length > 0`); `startup-advisor/.../ontologyReasoning.ts:runOntologyReasoning` (línea 181) | **Retirar** |
| `POST /startups/{id}/individuals` | ABox (escritura) | `startup-advisor/.../ontologyReasoning.ts:createIndividual` — **el único escritor real en todo el sistema** (`ensureCoreIndividuals` + `recordMentionedIndividuals`) | **Retirar** |
| `POST /startups/{id}/facts` | ABox (escritura) | **Ningún caller nunca** (ya documentado en `HANDOFF.md`: `startup_facts` tuvo 0 filas siempre, para las 11/12 startups) | **Retirar** (endpoint muerto desde su creación) |

**Confirmado por evidencia, no supuesto**: `startup-advisor` es el único
escritor de ABox en todo el sistema (`createIndividual`, nunca `createFact`).
`startup-next` y `startup-advisor` son ambos lectores de ABox, cada uno para
un propósito propio y distinto (ver punto 3). `hermes-startup-next` **nunca
llama a `ontology-engine`** — confirmado en su propio HANDOFF ("Hermes es un
cliente, no un segundo backend", sin credenciales de DB, solo cliente HTTP
hacia `startup-next`) y por grep (cero referencias a `ontology-engine` en
ese repo).

## Punto 3 — La decisión de mayor calado: ¿desaparece "modo enriquecido", o se reemplaza?

### Hallazgo que cambia el marco del problema: hay DOS consumidores de ABox, no uno

`hermes-startup-next/HANDOFF_CONTEXTO_HISTORICO.md` (sección "Revisión de
arquitectura") solo discute **un** consumidor: el "modo enriquecido" de
`startup-next`, activado vía PDF firmado. Ese documento da por resuelto que
`[CONTEXTO_HISTORICO]` (memoria privada de Hermes, ya implementado y
verificado contra producción en las capas 1-3) lo reemplaza — **para el
camino mediado por Hermes**.

Pero la evidencia de código muestra un **segundo consumidor, independiente
de Hermes y no mencionado en ese documento**: `startup-advisor` (la propia
app que crea las startups) llama a `runOntologyReasoning()` directamente
desde su propio flujo de entrevista (`src/app/api/interview/[id]/chat/route.ts:138`),
sin pasar por `startup-next` ni por Hermes en absoluto. Esa función:

1. Escribe individuals reales (`createIndividual`) durante la entrevista —
   la fuente original de los datos que se acaban de borrar en el punto 2.
2. Llama a `validateStartup()` contra esos mismos individuals.
3. Si hay hallazgos, los guarda como `consideraciones_metodologicas` **dentro
   del propio informe** que `startup-advisor` genera para el fundador
   (`reportToSave = { ...report, consideraciones_metodologicas: hallazgos }`,
   línea 145) — una funcionalidad de producto hoy activa, independiente de
   si el fundador alguna vez exporta un PDF hacia `startup-next`.

Retirar el ABox sin decidir qué pasa con este segundo consumidor dejaría
`runOntologyReasoning()` fallando en cada entrevista (aunque de forma
controlada: ya está envuelto en `try/catch` con `console.error`, líneas
121-152, así que el informe se guarda igual, solo sin
`consideraciones_metodologicas` — no es un crash, pero sí una pérdida
silenciosa de una funcionalidad de producto que hoy funciona).

### Opciones

**Opción A — Desaparece por completo, sin reemplazo, para ambos consumidores.**
`startup-advisor` deja de intentar razonamiento de ontología en la
entrevista (se elimina la llamada a `runOntologyReasoning`, no solo se deja
fallar en silencio). `startup-next` deja de tener ningún camino a "modo
enriquecido" — el PDF firmado se vuelve irrelevante (ver punto 4). Más
simple, coherente con "TBox puro, sin ABox de ninguna startup real" tomado
literalmente. Costo: `startup-advisor` pierde la funcionalidad de
`consideraciones_metodologicas` en sus informes sin nada que la sustituya.

**Opción B — Reemplazo por hechos efímeros, pero solo alcanza al camino
mediado por Hermes (ya implementado), no al de `startup-advisor`.**
Para `startup-next`: ya resuelto y confirmado por `[CONTEXTO_HISTORICO]`
(capas 1-3 de `HANDOFF_CONTEXTO_HISTORICO.md`), sin depender de
`ontology-engine` en absoluto — la verdad de la startup vive en la memoria
de Hermes, no en un servicio compartido. Nada que diseñar de nuevo acá.
Para `startup-advisor`: esta opción **no dice nada** — Hermes no envuelve el
flujo de entrevista de `startup-advisor`, así que "hechos efímeros enviados
por Hermes" no aplica a ese consumidor. Quedaría como pregunta abierta,
sin resolver, si se elige esta opción tal cual.

**Opción C — Reemplazo consistente para ambos consumidores, usando el mismo
patrón "TBox-only" que `startup-next` ya usa en modo base.**
Para `startup-next`: igual que B (ya resuelto vía `[CONTEXTO_HISTORICO]`).
Para `startup-advisor`: en vez de escribir individuals reales y correr
`validate()` contra hechos persistidos, adoptar el mismo patrón que
`orchestratorModoBase.ts` ya usa — llamar a
`GET /concepts/{id}/prerequisitos` (TBox puro, sin ABox, ya soportado hoy)
para los conceptos que la entrevista tocó (vía los mismos
`BASE_CONCEPT_BY_TOOL`/subtipos que `buildRecordTools()` ya identifica), y
narrar eso como `consideraciones_metodologicas` genéricas ("antes de esto,
conviene haber trabajado en X") — mismo criterio de encuadre que
`FRASE_ENCUADRE` en `orchestratorModoBase.ts` (dejar explícito que es
orden metodológico general, no una evaluación de hechos reales de esa
startup). Costo de ingeniería bajo (reusa un patrón ya construido y
verificado), pero es una pieza de producto distinta a la actual (deja de
avisar cuando el fundador *realmente* se saltó un paso, porque ya no hay
hechos reales contra qué comparar) — mismo trade-off que ya se aceptó para
`startup-next` en su día.

### Recomendación

Opción C. Evita dejar un cabo suelto (`startup-advisor` con una función que
falla en silencio en cada entrevista) y no introduce un mecanismo nuevo:
reusa exactamente el patrón "TBox-only, encuadrado como genérico" que
`startup-next` ya tiene en producción y que este mismo documento mantiene
para `startup-next` en la tabla del punto 1. La alternativa (A) es más
simple pero elimina una funcionalidad de producto sin sustituto; la
alternativa (B) tal como está planteada en el pedido original no cubre a
`startup-advisor` y dejaría la pregunta abierta de todos modos. Queda a
decisión del usuario — no se implementa nada de esto todavía.

## Punto 4 — Impacto en el mecanismo de firma PDF

Cadena completa, confirmada por código:

- `startup-advisor/src/lib/pdf-signing.ts` (`PDF_SIGNING_PRIVATE_KEY`,
  Ed25519) firma `startup_id|report_id|timestamp`.
- `startup-advisor/src/lib/report-pdf.tsx:187` embebe ese bloque en el PDF
  exportado, bajo el marcador `startup-next-verification`.
- `startup-next/src/lib/pdfVerification.ts:resolveStartupIdFromPdfText`
  (`PDF_SIGNING_PUBLIC_KEY`) verifica la firma al recibir el PDF en
  `POST /informes/parse` y, si es válida, devuelve el `startup_id` real
  (si no, UUID al azar — modo base).
- **Ese `startup_id` real no se usa para nada más que consultar el ABox**:
  `informes.ts:35` lo devuelve tal cual en la respuesta, y el único lector
  downstream es `orchestratorModoBase.resolveOntologyContext(startupId)`
  (`GET .../graph` + `.../validate`) — confirmado por grep, no hay ningún
  otro uso del `startup_id` extraído del PDF en todo `startup-next`.

**Conclusión, condicionada a la Opción elegida en el punto 3**: si el ABox
desaparece (cualquiera de las tres opciones, ya que ninguna reintroduce
lectura de ABox vía `startup-next`), todo el mecanismo de firma PDF pierde
su único propósito — extraer un `startup_id` real ya no habilita nada
downstream. Sería código muerto completo: `pdf-signing.ts`,
`pdfVerification.ts`, el bloque `startup-next-verification` en
`report-pdf.tsx`, y los secretos `PDF_SIGNING_PRIVATE_KEY`/
`PDF_SIGNING_PUBLIC_KEY` en ambos Fly apps. Propuesta: retirarlo por
completo (no solo dejarlo inactivo) — mantenerlo sin propósito real
contradice "sin abstracciones para código de un solo uso" y además sigue
firmando/verificando datos que ya no protegen nada. No implementado en
este documento.

## Punto 5 — Impacto en `/admin`

**Ninguno.** El único `/admin` de los tres repos es
`startup-next/src/routes/admin.ts` (`/admin/allowed-emails*`), que
administra una lista blanca de emails para el flujo de magic-link
(`authenticateAdmin`/`authenticateApp`) — sin ninguna relación con
`ontology-engine`, confirmado leyendo el archivo completo. `ontology-engine`
no tiene ningún endpoint `/admin` propio, y `startup-advisor` no tiene
ninguna superficie de administración que muestre datos de ontología
(confirmado por grep de `admin`/`debug`/`ontology` en `src/app` — sin
resultados fuera de los `lib/` ya inventariados en el punto 1).

## Punto 6 — Plan de migración y verificación

Orden propuesto, pensado para que el servicio compartido nunca quede roto a
mitad de camino (dos apps ya en producción dependen de él):

1. **Confirmar este documento** (este paso — pendiente).
2. **Confirmar la opción del punto 3** (A, B o C) — condiciona el punto 4.
3. **Actualizar los callers primero, el servicio después.** Dado que el
   ABox ya quedó vacío desde hoy (punto 2 ejecutado), ambas apps ya están
   corriendo en producción con degradación elegante activa (modo base en
   `startup-next`, `consideraciones_metodologicas` ausente en
   `startup-advisor`) — sin cambiar una línea de código. Esto da una
   ventana segura para tocar el código de los callers sin que el
   comportamiento visible cambie:
   - `startup-next`: retirar la rama `mode: "enriquecido"` de
     `OntologyContext`/`resolveOntologyContext` (colapsa a un solo modo);
     limpiar el código muerto correspondiente en `orchestrator.ts` (línea
     55 y alrededores). Si se confirma retirar PDF (punto 4), eliminar
     `pdfVerification.ts` y simplificar `informes.ts` para que la rama PDF
     también devuelva `crypto.randomUUID()` sin intentar extraer nada.
   - `startup-advisor`: según la opción del punto 3 — eliminar
     `runOntologyReasoning()` (Opción A) o reescribirla para usar
     `getPrerequisitos()` en vez de `createIndividual`/`getStartupGraph`/
     `validateStartup` (Opción C). Si se confirma retirar PDF, eliminar
     `pdf-signing.ts` y el bloque de `report-pdf.tsx`.
4. **Recién entonces, retirar en `ontology-engine`**: los 5 endpoints
   marcados "Retirar" en la tabla del punto 1 (`main.py`), el motor de
   reglas `rules.py` (sin caller si se retira `/validate`), y el código de
   carga de ABox en `graph.py` (`load_startup_graph`,
   `load_individuals_from_rows`, `load_facts_from_rows`) — dejando el
   módulo con solo `load_tbox` y las consultas de TBox.
5. **Migración de esquema (opcional, a decidir)**: con `startup_individuals`
   y `startup_facts` ya vacías y sin ningún endpoint que las escriba,
   proponer una migración `003_drop_abox_tables.sql` que las elimine (más
   la FK `fk_startup_individuals_startup` hacia `startups`, aplicada
   directo en producción, no en el `.sql` trackeado — ver HANDOFF.md,
   "Hallazgo secundario"). Alternativa más conservadora: dejarlas vacías
   sin dropear, si se prefiere no tocar el esquema todavía. A decidir.
6. **Verificación, mismo estándar que el resto del proyecto (evidencia
   real, no "debería andar")**:
   - `GET /health`, `/concepts`, `/concepts/{id}/prerequisitos` siguen
     `200` contra `https://ontology-engine.fly.dev` real, tras el deploy.
   - `POST /startups/{id}/individuals` y `/facts` responden `404`/`410`
     (ruta retirada), no `500`.
   - Un run real contra `startup-next.fly.dev` (cualquier `startup_id`,
     mismo patrón usado hoy con Cafelibros) confirma `hallazgos_ontologia`
     nunca en modo "enriquecido" — ya no existe esa rama.
   - Una entrevista real (o de prueba, claramente marcada) contra
     `startup-advisor` completa sin error visible al fundador, con el
     informe guardándose (con o sin `consideraciones_metodologicas` según
     la opción elegida, pero sin excepción no manejada).
   - `hermes-startup-next`: sin cambios esperados (nunca dependió de
     `ontology-engine`) — verificación de no-regresión, no de una
     funcionalidad nueva.

## Pendiente antes de tocar código

Este documento no toca código de `startup-next` ni `startup-advisor`. Falta
decidir: la opción del punto 3 (A/B/C, recomendada C), si se retira el
mecanismo de firma PDF por completo (punto 4, condicionado a lo anterior),
y si se dropean las tablas de ABox o se dejan vacías (punto 6, paso 5).
Con esas tres decisiones confirmadas, este documento pasa a plan de
ejecución.
