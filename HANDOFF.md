# HANDOFF — startup-next (backend)

Última actualización: 2026-07-21.

## Especialista "ideacion" implementado y desplegado (2026-07-21)

Implementa `diseno_especialista_ideacion.md` completo (los 6 puntos ya
confirmados), con las dos condiciones adicionales de esa confirmación
resueltas antes de tocar código de enrutamiento. Cafelibro
(`4df8de99-62aa-4211-b09c-e8b44fea38fb`), atascada en
`sin_especialista`/`ideacion` desde el 2026-07-19, ya no lo está.

### Condición 1 — re-etiquetado del corpus RAG: aditivo, confirmado sin regresión

**Decisión confirmada**: aditivo (`["mvp", "ideacion"]`), no exclusivo.
Un chunk sirve a ambos especialistas; `especialista_tags @> [...]` en
Postgres (containment JSONB) soporta arrays con más de un tag sin
cambios, y aditivo tiene **cero riesgo de regresión por construcción**
para MVP (ningún chunk pierde `"mvp"`).

Editados a mano `rag-ingest/out/customer-development.jsonl` (137 chunks,
capítulos "Una introducción al descubrimiento de clientes", "El
descubrimiento de clientes", "Camino a la epifanía...", "Camino al
desastre...") y `rag-ingest/out/guia-canvas.jsonl` (70 chunks, "SESIÓN 1
DE LA IDEA, AL NEGOCIO" y los módulos de sesiones 2/3) — exactamente los
~207 chunks identificados en el diseño. `lean_startup.jsonl` sin tocar
(más genérico/transversal, fuera de alcance del diseño). Backup de los
dos `.jsonl` originales guardado antes de editar (no son parte del repo,
`.gitignore`).

`rag-ingest load` corrido con el intérprete Python correcto (ver nota de
entorno abajo) para `customer-development.jsonl` (778 upserteados, 0
huérfanos) y `guia-canvas.jsonl` (190 upserteados, 0 huérfanos) —
conteos exactos, sin pérdida de datos.

**Verificado con evidencia real, no solo revisando el `.jsonl`**:
- `SELECT count(*) FROM rag_chunks` → sigue en 1.126.
- Distribución real: `["mvp"]` → 919, `["mvp","ideacion"]` → 207 (exacto
  a lo esperado). 0 chunks con `embedding IS NULL` tras el load.
- `searchRagChunks(embedding, "ideacion")` con una consulta real
  ("cómo validar el problema de mis clientes y elegir un segmento antes
  de construir nada") devolvió 5 resultados reales y temáticamente
  correctos (descubrimiento de clientes, encaje problema/solución) —
  antes de este cambio habría devuelto `[]` siempre.
- `searchRagChunks(embedding, "mvp")` con la consulta ya usada por
  `verify_ingestion()` sigue devolviendo resultados normalmente — sin
  regresión (garantizado por construcción al ser aditivo, confirmado
  igual con una corrida real).

**Nota de entorno real, no de producto**: `python`/`python3` en esta
máquina resuelven a instalaciones distintas (Anaconda 3.12 vs. el
Python 3.13 standalone donde `pip install` puso `psycopg`/`pgvector`/
`voyageai`) — `python -m rag_ingest.cli load` fallaba con
`ModuleNotFoundError` hasta invocar el intérprete correcto explícito
(`AppData/Local/Programs/Python/Python313/python.exe`). No hizo falta
el Dockerfile completo de `rag-ingest` (que instala MinerU/torch, pesado)
para correr `load` — ese subcomando solo importa `psycopg`/`pgvector`/
`click`/`voyageai`, confirmado leyendo `db.py`/`voyage_client.py`; el
import de nivel superior de `mineru_runner.py` en `cli.py` no requiere el
paquete `mineru` instalado (solo hace `subprocess` en tiempo de
ejecución).

### Condición 2 (Cafelibro) + verificación de código y enrutamiento

Implementados los 6 puntos del diseño más el hallazgo de esa misma
investigación (`validator.ts` hardcodeaba `"mvp"` en dos lugares, no
mencionado en la lista original de 5 puntos de enrutamiento):

1. `src/graph/nodes/orchestrator.ts` — `especialista_disponible` ahora
   `especialistaRequerido === "mvp" || especialistaRequerido === "ideacion"`.
2. `src/specialist/ideacion.ts` (nuevo) — mismo patrón que `mvp.ts`,
   reusa `specialistDecisionSchema` tal cual (sin schema nuevo, según lo
   confirmado en el diseño), `SYSTEM_PROMPT` propio centrado en validar
   problema/cliente, segmento e hipótesis de valor.
3. `src/graph/nodes/specialist.ts` — dispatcher: `especialista_requerido
   === "ideacion"` → `runIdeacionSpecialist()`, cualquier otro caso (hoy
   solo `"mvp"` puede llegar acá) → `runMvpSpecialist()` sin cambios.
4. `src/graph/nodes/validator.ts` — `ciclo.especialista` y
   `especialistaUsado` pasan de `"mvp"` hardcodeado a
   `accionNext.especialista_requerido` real.

Ningún cambio en `ESPECIALISTA_A_CONCEPTO` (`orchestratorModoBase.ts`) —
sigue sin ancla para `ideacion`, como se decidió en el diseño (punto 2,
sin modelar nada nuevo en el TBox en esta pasada).

`npx tsc --noEmit` limpio. Desplegado a `startup-next.fly.dev`
(`flyctl deploy`).

**Verificado con evidencia real contra esta producción, los dos casos
del plan de verificación**:

- **Caso A, Cafelibro real, modo enriquecido**: reinvocado con la misma
  tarea real ya usada el 2026-07-19 ("Elegir un único segmento y
  validarlo con entrevistas..."), reusando su `startup_id` real
  (`4df8de99-...`, 8 individuals reales en `ontology-engine`). Resultado:
  `status: "approved"` (ya no `sin_especialista`), `especialista_usado:
  "ideacion"`, 6 recomendaciones reales en `informe_final`, con fuentes
  RAG reales citadas — entre ellas, literalmente
  `"Customer Development — Una introducción al descubrimiento de
  clientes — Descubrimiento de clientes, fase 1: Determinar las
  hipótesis del modelo de negocio"` y `"...— Salir a la calle"`:
  confirma que el re-etiquetado de la condición 1 no solo cuenta bien en
  la base, sino que el especialista real efectivamente las recupera y
  las cita.
- **Caso B, texto libre nuevo, modo base**: tarea de ideación genuina
  ("Todavía no sé bien qué problema resolver ni para quién..."), sin
  `startup_id` real. Resultado: `status: "approved"`,
  `especialista_usado: "ideacion"`, `hallazgos_ontologia: []` (sin
  `PREREQUISITO_GENERICO`, sin bloqueo, sin error) — confirma el punto 2
  del diseño con datos reales, no solo por lectura de código.

**Limpieza**: los dos runs de verificación (`01bcd567-...` y
`cb78b0c7-...`, ambos `requested_by: "hermes"`) se borraron al cierre —
son invocaciones de prueba, no acciones reales del fundador, mismo
criterio ya aplicado con Virtual Atelier AI (incluye el de Cafelibro:
reusa su `startup_id` real solo para probar modo enriquecido, no es una
tarea que Cafelibro haya pedido de verdad). Confirmado por conteo
(36 → 34 filas). Las dos filas reales de Cafelibro
(`567fcf09-...`/`a1975e40-...`) verificadas intactas antes de borrar
nada. Scripts temporales usados (re-etiquetado, verificación, limpieza)
borrados al terminar, no commiteados.

## Limpieza de filas de test en `next_action_runs` (2026-07-21)

Durante la verificación de las tres capas de contexto histórico
consolidado en `hermes-startup-next` (ver
`hermes-startup-next/HANDOFF_CONTEXTO_HISTORICO.md`, sección "Revisión de
arquitectura"), correr repetidamente `test/manual/verify-historical-context.ts`
contra esta producción dejó filas de prueba reales en `next_action_runs`
(Neon propia de `startup-next`). `hermes-startup-next` no tiene
credenciales de base de datos (por diseño, solo cliente HTTP), así que la
limpieza se hizo desde este repo, que sí tiene acceso directo a
`DATABASE_URL`.

**Identificación, no asumida**: se consultaron todas las filas
`requested_by = 'hermes'` (18 en total). Se descartaron como reales, sin
tocarlas, las que coinciden con contenido/`run_id` ya documentado como uso
genuino del producto — en particular `567fcf09-780c-4682-a8e7-535ad9c0da45`
y `a1975e40-ff3c-41c9-bd50-39aabbeea4e8`, verificadas por coincidencia
exacta de `run_id` contra `hermes-startup-next/memoria/demo-cafelibro-real/*.md`
(las dos invocaciones reales de Cafelibro, 2026-07-19). También quedaron
sin tocar, por estar fuera del alcance de esta limpieza (no son de la
sesión de hoy), otras filas de test más viejas de 2026-07-18/19 (Virtual
Atelier AI, pruebas de `verify-action-executor.ts`, etc.) — **resuelto
más abajo, misma fecha** ("Limpieza de filas de test más antiguas...").

Las **7 filas de hoy** (2026-07-21) se confirmaron una por una antes de
borrar: todas `requested_by = 'hermes'`, `source = 'texto_libre'`, y con
el texto sintético hardcodeado del script (`"Definir el MVP para validar
la hipótesis de valor con clientes reales."`, o los bloques
`[CONTEXTO_HISTORICO]`/`[TAREA_PROPUESTA]` literales de
`composeInvocationText()`) — nunca texto real de un fundador. Ninguna
coincidía con los `run_id` reales de Cafelibro.

**Borrado confirmado por conteo, no por inferencia**: 18 filas
`requested_by = 'hermes'` antes del borrado, 11 después (exactamente las
7 esperadas). Sin filas huérfanas en `next_action_clarifications` para
esos `run_id`. Script usado (`@neondatabase/serverless`, mismo cliente que
ya usa el proyecto) escrito ad hoc y borrado al terminar — no quedó
commiteado, no es parte del producto.

**Nota de entorno, no de producto**: `bash source .env.local` trunca
`DATABASE_URL` en el primer `&` sin comillas (lo interpreta como
backgrounding de un job), así que cualquier script que necesite esta
variable debe leer `.env.local` directo (regex/parseo simple), no confiar
en `source`/`export` de la shell para este archivo en particular.

## Limpieza de filas de test más antiguas en `next_action_runs` (2026-07-21, sesión aparte de la anterior)

Cierra el pendiente dejado explícitamente fuera de alcance en la limpieza
de arriba: filas de test de las sesiones **2026-07-18 y 2026-07-19**
(verificación de `ActionExecutor`, contexto histórico inicial, y el
camino Virtual Atelier AI/MVP), que nunca se habían borrado — salvo dos
filas de esa misma sesión de Virtual Atelier AI que sí se habían
eliminado en su momento (ver `HANDOFF_HERMES.md`, "el intento fallido y
el exitoso... se borraron").

**Identificación, no asumida**: de las 11 filas `requested_by = 'hermes'`
restantes tras la limpieza anterior, 2 son las reales de Cafelibro
(mismas de arriba, re-confirmadas por `run_id` contra
`hermes-startup-next/memoria/demo-cafelibro-real/*.md` antes de tocar
nada). Las otras 9 se identificaron por fecha (2026-07-18/19) y contenido
sintético reconocible — varias con la etiqueta explícita "sintético/de
prueba" en el propio `resumen` guardado, otras con el texto literal de
los scripts de verificación (`"Tarea de prueba A -- el executor debe
declinar acá."`, bloques `[TAREA_PROPUESTA]`/`[CONTEXTO_HISTORICO]`
literales, o el texto deliberadamente vago del test de
`needs_clarification` ya documentado en `HANDOFF_HERMES.md`,
`"quiero mejorar mi startup, no se muy bien..."`).

**Borrado confirmado por conteo, no por inferencia**: 11 filas
`requested_by = 'hermes'` antes del borrado, 2 después (exactamente las 9
esperadas) — las 2 remanentes son las reales de Cafelibro, re-verificadas
como intactas al final del script. Mismo patrón que la limpieza anterior:
script ad hoc con `@neondatabase/serverless`, leyendo `.env.local` directo
(no `source`), borrado al terminar, no commiteado.

## Pendiente cerrado: `GET /runs/:id` ahora expone `error` cuando `status === "failed"` (2026-07-21)

Cierra el pendiente documentado desde la sesión del 2026-07-14 ("Entorno
local verificado end-to-end") y repetido en "Problemas conocidos /
pendientes" #4: antes, diagnosticar un run `failed` requería consultar
`next_action_runs.error` directo en Postgres, porque `serializeRun()`
(`src/routes/runs.ts`) no lo incluía en la respuesta.

**Fix**: `serializeRun()` agrega `error: run.error ?? null` **solo cuando
`status === "failed"`** — mismo criterio condicional que ya usa
`informe_final`/`no_respuesta`/`pregunta` según el estado, sin cambiar el
contrato para el resto de los estados (el campo simplemente no aparece si
`status !== "failed"`).

Desplegado a `startup-next.fly.dev` (`flyctl deploy`, sin cambios de
esquema, solo el campo nuevo en la respuesta serializada).

**Verificado con evidencia real, no solo `tsc` limpio**: script ad hoc
forzando el especialista `mvp` con una tarea sesgada a MVP hasta obtener
un `status: "failed"` real (reproduce el mismo bug ya documentado —
"Capa de reparación...", `resumen_estrategia`/`recomendaciones` mal
tipados). Confirmado:

- `status: "failed"` → `GET /runs/:id` devuelve `error` con el mensaje
  real: `"structured output inválido (schema=\"specialistDecisionSchema\"):
  resumen_estrategia: Invalid input: expected string, received undefined;
  recomendaciones: Invalid input: expected array, received string..."` —
  ya no hace falta consultar Postgres directo para verlo.
- `status: "approved"` (mismo run de prueba, otro intento) → `error`
  **ausente** de la respuesta (confirmado con
  `Object.prototype.hasOwnProperty`, no solo `=== undefined`), contrato
  sin cambios para el resto de los estados.

**Nota sobre el propio arnés de verificación, no del fix**: el script
(descartado al terminar, no commiteado) tenía un bug real que hizo fallar
los dos primeros intentos antes de dar evidencia útil — mandaba
`content-type: application/json` incluso en el `POST /runs/:id/start` sin
body, y Fastify lo rechaza con `400 FST_ERR_CTP_EMPTY_JSON_BODY` ("Body
cannot be empty when content-type is set to 'application/json'"). Corregido
enviando ese header solo cuando el request lleva body. Los runs de prueba
que este proceso dejó en `next_action_runs` (5 en total, `requested_by`
`hermes`/`app` según el intento) se borraron al cierre, confirmado por
conteo (39 → 34 filas), sin afectar las 2 filas reales de Cafelibro.

## Camino PDF firmado / modo enriquecido cerrado de extremo a extremo (2026-07-19)

El bloqueo que quedaba pendiente ("Primer despliegue real a producción",
más abajo: "no se verificó el modo enriquecido... contra la producción
recién desplegada") está resuelto. Causa real del bloqueo: un `500` sin
detalle en `ontology-engine` (`POST /startups/{id}/individuals`, tabla
`startup_individuals.startup_id` con una FK real hacia `startups.id` no
reflejada en el `.sql` de migración trackeado) — no un bug de
`startup-next`. Fix, evidencia y detalle completo en
`ontology-engine/HANDOFF.md` (nuevo, repo `startup-advisor`) y en
`hermes-startup-next/HANDOFF_HERMES.md`.

Verificado contra esta producción (`startup-next.fly.dev`), con un
`startup_id` de prueba real con individuals reales en `ontology-engine`:
firma Ed25519 verificada correctamente (`startup_id` real extraído, no
aleatorio), modo enriquecido activado, `hallazgos_ontologia` con un
hallazgo específico y real (no `PREREQUISITO_GENERICO`), run `approved`
vía especialista `mvp`. También verificados en esta sesión, directo
contra esta producción: `POST /runs/{id}/respond` (ciclo de
`needs_clarification` completo, forzado con texto ambiguo) y `/admin/*`
(incluyendo los 401 cruzados entre `API_KEY_ADMIN`/`API_KEY_APP`).

**No verificado todavía**: el camino con un PDF real generado por la UI
completa de `startup-advisor` (entrevista → informe → descarga) contra
esta producción específica — lo probado hoy generó la firma por script
directo con la clave real, para acotar el alcance. Ese camino de UI
completa ya se había verificado antes, pero en local (2026-07-14).

### Segunda pasada, contra una startup real preexistente (mismo día)

La verificación de arriba usó un `startup_id` de prueba desechable. Se
repitió después contra una startup real ya existente en producción
("Virtual Atelier AI", con 5 individuals reales de antes de esta sesión,
sin tocarlos) para confirmar `hallazgos_ontologia` con hechos genuinamente
reales, no creados ad hoc. Confirmado: dos hallazgos reales
(`R1_hipotesis_sin_experimento` sobre sus dos hipótesis reales,
`R4_startup_sin_fundador` porque la relación `tiene_fundador` nunca se
registró — auditado después: no es el bug de `ontology-engine`, es que
`startup-advisor` nunca implementó un caller para `POST /facts`, ver
`ontology-engine/HANDOFF.md`. Efecto real para este repo: cualquier
consulta de modo enriquecido contra una startup real con individuals va a
disparar R1/R2/R4 siempre, sin relación con si el fundador hizo o no esos
pasos). Detalle completo, incluyendo un fallo transitorio del especialista
MVP (ya conocido, no relacionado) y un hallazgo real en
`hermes-startup-next` sobre pérdida de contenido en el camino PDF (ya
corregido ahí), en `hermes-startup-next/HANDOFF_HERMES.md`.

Este fallo transitorio confirma con datos reales (no solo el ~6%
sintético medido antes) que el especialista MVP sigue fallando en
producción real bajo el `accion_next` real del orquestador — ver
"Problemas conocidos / pendientes" #1, abajo.

## Primer despliegue real a producción (2026-07-18)

**No es una corrección de un deploy anterior** — `startup-next` nunca se había desplegado a Fly.io. Todo el desarrollo y verificación previos (Hitos 1-3, firma Ed25519, capa de reparación) se hicieron y probaron contra `localhost:8000`. El motivo de este deploy: `hermes-startup-next` necesita invocar un servicio accesible por red, no localhost.

**URL real de producción**: `https://startup-next.fly.dev`. Confirmado que `hermes-startup-next/.env.example` ya apuntaba a esa misma URL — no hizo falta actualizarlo.

**Cuenta/org de Fly**: `manuelj.canno@gmail.com`, org `personal` — la misma que `ontology-engine` (verificado con `flyctl orgs list`: es la única org accesible; `ontology-engine` ya estaba deployado ahí y reachable). No hizo falta ninguna org distinta.

**Pasos reales**: `flyctl launch --no-deploy --copy-config --yes --name startup-next --org personal` (creó la app reusando el `fly.toml`/`Dockerfile` ya versionados; solo reescribió el comentario de cabecera del `fly.toml`, restaurado a mano), `flyctl secrets import` con los valores reales de `.env.local` — con **una excepción deliberada**: `ONTOLOGY_ENGINE_URL` se sobreescribió a `https://ontology-engine.fly.dev` (producción), no al `http://localhost:8001` que tenía `.env.local` para desarrollo local. Luego `flyctl deploy`.

**Dos problemas reales encontrados y resueltos, no ambientales los dos**:
1. **Avast interceptando TLS** en el builder remoto de Fly (mismo patrón ya documentado en `diseno_startup_next.md` para `ontology-engine` y `rag-ingest`) — resuelto pausando el antivirus. Sigue pendiente la excepción permanente para Docker Desktop/WSL2 y `flyctl` que ya se había recomendado antes y nunca se configuró.
2. **Bug real de empaquetado, no del entorno**: `package-lock.json` (generado con npm 11 local) resultaba inconsistente para `npm ci` bajo npm 10.9.8 (la versión que trae `node:22-slim`, la imagen base del `Dockerfile`) — faltaban entradas de `esbuild@0.28.1` y sus binarios por plataforma. Regenerado corriendo `npm install --package-lock-only` con `npx npm@10.9.8` en vez del npm local, para que el lockfile sea consistente con la imagen real de build. **Ojo**: correr `npm install` normal (sin fijar la versión de npm) vuelve a regenerar el lock con la resolución de npm 11 y reintroduce el problema — ya pasó una vez en esta misma sesión.
3. **Bug real de dependencias, encontrado recién en este primer deploy real**: `dotenv` estaba en `devDependencies`, pero `src/main.ts` lo importa incondicionalmente a nivel de módulo (`import { config } from "dotenv"`) — código que sí corre en producción. `npm ci --omit=dev` (segunda stage del `Dockerfile`) lo excluía, y el proceso moría en el arranque con `ERR_MODULE_NOT_FOUND: Cannot find package 'dotenv'` (visto vía `flyctl logs`, streaming en vivo — `flyctl logs --no-tail` fallaba de forma intermitente con 401/timeout, sin relación con el bug real). **Corregido**: `dotenv` movido a `dependencies`. Nunca se había ejercitado este código path en producción antes — el bug es preexistente, no introducido en esta sesión.

**Verificado end-to-end contra la URL real**: `GET /health` → `200 {"status":"ok"}`. `POST /informes/parse` con texto libre corto → `200`, `opciones_propuestas` con un elemento y `startup_id` aleatorio (modo base, como se espera para texto libre). Máquina en estado `started`, healthcheck `1/1 passing`.

**Pendiente, no resuelto en esta sesión**: no se verificó el modo enriquecido (PDF firmado con `startup_id` real) contra la producción recién desplegada, ni el resto de endpoints (`/runs`, `/runs/{id}/start`, `/runs/{id}/respond`, `/admin/*`). Tampoco se commitearon todavía los cambios (`package.json`, `package-lock.json`, `fly.toml`) — quedan en el working tree, pendientes de confirmación explícita antes de commitear.

## Cierre de sesión: español de España + narrativa de prerrequisitos + UI (2026-07-18)

Cruza dos repos: `startup-next` (backend) y `startup-next-ui` (frontend). Todo commiteado y pusheado a `origin/master` en ambos, un commit por feature real (sin mezclar), separando hunks con `git add -p` donde hizo falta.

**`startup-next`** — un solo commit, `abde5de`: traducción de los 4 system prompts de LLM (orchestrator, orchestratorModoBase, validator, specialist/mvp, informes/parseOpciones) y el fallback de `runsService.ts` de voseo rioplatense a español de España, más `src/lib/ontologyLabels.ts` (nuevo) — traduce `PREREQUISITO_GENERICO` de strings técnicos crudos (`concept_id`, `relacion`, `distancia`) a una narrativa en español natural, ordenada por distancia ascendente, con frase de encuadre fija ("esto es información general... no es una evaluación de tu startup real"). El contrato JSON no cambió (`{rule_id, hallazgos}` sigue igual), solo el contenido del string `hallazgos`. Verificado con un run real vía `curl` — la narrativa nueva salió tal cual se diseñó.

**`startup-next-ui`** — 7 commits, en este orden:

| Commit | Contenido | Verificación |
|---|---|---|
| `d712e61` | Traducción de strings de UI a español de España (login, error de run) | No re-verificada visualmente |
| `b2d5a4e` | `formatHallazgo()` unificado en 3 componentes (deja de mostrar `rule_id` técnico crudo) | Parte del flujo probado abajo, sin verificación aislada |
| `f359d75` | Fix del badge de estado (texto blanco invisible → negro en negrita) | **Verificado visualmente en navegador real** |
| `e07d623` | Descarga de PDF del informe final (`@react-pdf/renderer`) | **Verificado funcionalmente en navegador real**: run `approved`, PDF descargado y abierto sin error |
| `66ce0fd` | Formulario de un solo paso (implementa la spec de sección 9 ya documentada, no diseño nuevo — ver hallazgo abajo) | **Verificado end-to-end en navegador real** con un PDF firmado real |
| `5c919a6` | Sincroniza `diseno_startup_next.md` de este repo con la versión ya commiteada en `startup-next` (`6c61384`) — nunca se había sincronizado | Solo documentación |
| `b91e9df` | Actualiza `HANDOFF.md` propio de `startup-next-ui` con este mismo cierre | — |

**Hallazgo real durante el inventario previo al commit**: dos de las piezas de `startup-next-ui` (el formulario de un solo paso y la descarga de PDF) no eran trabajo de esta sesión — eran una feature completa de una sesión anterior, implementada pero nunca commiteada, mezclada en el working tree con los cambios de hoy. Se separaron por archivo/hunk antes de commitear (`git add -p` en `app/runs/[id]/page.tsx`, que tenía 3 cambios independientes en el mismo archivo: badge, link de descarga, traducción del error). El propio `HANDOFF.md` de `startup-next-ui` (también sin commitear hasta hoy) confirmaba de forma independiente que esa feature era de antes: documentaba que el commit previo `bd4b473` tenía un mensaje impreciso ("flujo PDF/texto excluyente") que no reflejaba el código real de ese momento.

**Verificación de tipos**: `npx tsc --noEmit` limpio en ambos repos antes de cada commit.

**Pendiente real, no cerrado hoy**: la traducción a español de España (`d712e61` en `startup-next-ui`, y la parte de `abde5de` en `startup-next`) no se re-verificó visualmente — es texto de bajo riesgo (cambios de palabra puntuales, `tsc` limpio, algunas strings ya se vieron indirectamente en runs reales), pero sigue siendo una verificación abierta.

## Módulo recién completado: verificación de firma del PDF + capa de reparación de structured output

Ambos, implementados y probados con datos reales (no mocks). Commiteado y pusheado a `origin/master` (commit `6c61384`).

**Estado: funcional, verificado end-to-end, commiteado y pusheado.**

## Entorno local verificado end-to-end (2026-07-14, sesión de pruebas)

Siguiendo `handoff_entorno_pruebas_local.md` (traspaso de otra sesión, ver punto 3 de pendientes más abajo): se levantaron los tres componentes en local y se corrió el checklist completo de pruebas de humo contra la app web real, no solo por curl aislado.

**Servicios corridos**: `ontology-engine` en `localhost:8001` (contra la Neon **compartida** de `startup-advisor`, exportando `DATABASE_URL` a mano en la shell — no lee `.env.local`, ver discrepancia abajo), `startup-next` en `localhost:8000` (contra su Neon **aislada**), `startup-next-ui` en `localhost:3000`. Los tres con dependencias ya instaladas de una sesión anterior (`node_modules`/`venv` presentes), `.env.local` ya poblados en los tres repos.

**Discrepancias reales encontradas contra `handoff_entorno_pruebas_local.md`** (no asumir esos datos en la próxima sesión sin volver a confirmar):
- `startup-next/.env.local` tenía `ONTOLOGY_ENGINE_URL=https://ontology-engine.fly.dev` (producción), no localhost. Se corrigió a `http://localhost:8001` solo en el archivo local (no commiteado).
- `ontology-engine` no usa `dotenv` (`main.py` lee `os.environ` directo) — no alcanza con crear un `.env.local` ahí, hay que exportar `DATABASE_URL` en la shell donde se lo levanta.
- `startup-next-ui/.env.example` usa `STARTUP_NEXT_URL`, no `BACKEND_URL` como asumía el traspaso, y no tiene ninguna variable `DATABASE_URL` propia (no la necesita, solo llama al backend).
- `ontology-engine` no usa Clerk ni ninguna otra auth (confirmado por grep, `requirements.txt`, `Dockerfile`, `fly.toml`) — Clerk es específico de `startup-advisor` (el Next.js principal), no de la subcarpeta.
- El comando de arranque local sí era `uvicorn main:app --reload --port 8000` como se asumía, confirmado en `PHASE1_CLOSE.md`, pero **se usó el puerto 8001 en la práctica** para no chocar con `startup-next` (ambos usan 8000 por defecto).

**Checklist de pruebas de humo (Paso 5 del traspaso) — los 6 casos confirmados**:
1. Texto libre → modo base: `approved`, `hallazgos_ontologia` vía `PREREQUISITO_GENERICO`. OK.
2. PDF firmado real (subido por el usuario vía la UI, exportado de verdad por `startup-advisor`) → mismo `startup_id` extraído en dos subidas distintas del mismo PDF, confirma que la firma se verifica de verdad (si fallara, cada subida daría un UUID aleatorio distinto). Modo enriquecido no se pudo ejercitar (ese `startup_id` tiene 0 individuals en `ontology-engine` — bloqueado por el punto 4 de pendientes).
3. PDF sin marcador de firma → degrada a UUID aleatorio, `200 OK`, sin error. OK (probado con un PDF sintético generado ad hoc, sin necesidad de reusar uno real).
4. Entrada incoherente (una factura) → `status: "peticion_incoherente"`, `ciclos_intentados: 0`. OK.
5. `especialista_requerido` distinto de `mvp` (probado con `financiacion`) → `status: "sin_especialista"`, `especialista_disponible: false`, 0 ciclos gastados. OK.
6. Panel admin: alta/baja de `allowed_emails` y los 401 cruzados (`API_KEY_ADMIN` contra endpoint que espera `API_KEY_APP` y viceversa) — todos verificados por API directa. OK.

**Hallazgo real nuevo, no en el checklist original**: en la primera corrida real vía la UI (PDF firmado), el especialista MVP falló tras agotar los 3 reintentos — `resumen_estrategia` vino ausente del tool call (no mal tipado, directamente ausente) y `recomendaciones` llegó como string. La capa de reparación no lo cubre porque solo repara campos presentes pero mal tipados, no campos ausentes. Es el mismo problema ya documentado más abajo (sección "Capa de reparación..."), pero esta es la primera confirmación real fuera de las mediciones sintéticas — y salió peor que el caso ya conocido (dos campos fallando a la vez, uno de ellos ausente). Al reintentar con el mismo PDF, la segunda corrida sí funcionó (`approved`).

**Hallazgo secundario**: `GET /runs/:id` no expone el campo `error` que sí se guarda en `next_action_runs.error` cuando un run termina en `failed` (ver `serializeRun()` en `src/routes/runs.ts`). Para diagnosticar el fallo de arriba hubo que consultar la fila directo en Postgres — vale la pena considerar exponerlo en la respuesta cuando `status === "failed"`.

**Estado de git**: sin cambios nuevos de esta sesión de pruebas (no se tocó lógica de negocio, tal como pedía el traspaso). El trabajo pendiente del "Paso 0" del traspaso (firma + capa de reparación) ya estaba commiteado y pusheado desde antes de esta sesión (commit `6c61384`, ver arriba) — confirmado con `git status`/`git log` antes de arrancar nada.

**¿Listo para diseñar la interfaz Hermes?** Sí, con una salvedad: el entorno de los tres componentes está verificado y estable, login por magic link confirmado funcionando (la prueba de PDF se hizo autenticado vía `SUPERADMIN_EMAIL`). Lo único que sigue bloqueado es lo ya conocido — `POST /startups/{id}/individuals` con 500 (impide probar el modo enriquecido de extremo a extremo) y la fiabilidad del especialista MVP bajo carga real, no algo que deba resolverse antes de arrancar el diseño de Hermes.

## Decisiones técnicas y de arquitectura

### Verificación de firma Ed25519 (sección 9 del diseño)

- `startup-advisor` firma cada PDF exportado con una clave Ed25519 privada (nunca sale de ese sistema) y agrega un bloque de texto visible al final: `startup_id`, `report_id`, `timestamp`, `signature` (base64).
- `startup-next` verifica con la clave pública (`PDF_SIGNING_PUBLIC_KEY`, no secreta) usando `node:crypto` nativo, sin librería nueva.
- **Hallazgo real que cambió el plan original**: `unpdf` (la librería que ya usa este repo para extraer texto de PDF) aplana los saltos de línea a espacios. El bloque de 6 líneas llega como una sola línea continua — no se puede usar `texto.split("\n")`. Se resolvió con regex ancladas al marcador `startup-next-verification`, extrayendo cada campo con `campo:\s*(\S+)` (seguro porque ninguno de los 4 valores tiene espacios internos).
- Degradación elegante: si el bloque no aparece, o la firma no verifica (PDF ajeno, corrupto, o falsificado a mano), se genera un `startup_id` al azar y el sistema cae a modo base — **sin error, sin bloquear nada**. Mismo criterio que el resto del sistema (`getPrerequisitos()` ante 404, etc.).
- `POST /informes/parse` ahora devuelve `startup_id` en la respuesta (antes solo devolvía `opciones_propuestas`) — tanto para el camino PDF como para texto libre (este último siempre genera uno al azar, nunca tiene id que extraer). Esto reemplaza el campo manual `startup_id` que pedía la UI.

### Capa de reparación determinística para structured output (bug real que bloqueaba el 100% de los runs)

- **Problema encontrado**: el especialista MVP (`specialistDecisionSchema`) fallaba de forma reproducible — Claude devolvía el array `recomendaciones` serializado como un string JSON en vez de un array nativo, pese a que ya existe `resumen_estrategia` como segundo campo de nivel superior (mitigación de Hito 3 para evitar exactamente esto). **La mitigación de Hito 3 no alcanza**: el problema no es "un solo campo de nivel superior colapsa", es que un campo array-de-objetos específico puede emitirse mal con o sin campos hermanos.
- Medido con instrumentación real (`includeRaw: true`, 32 llamadas reales contra la API): ~6% de fallo por llamada. Con `MAX_ATTEMPTS=3`, la probabilidad de agotar los 3 reintentos por azar puro es ~0.02%, pero pasó 2 veces reales en pocos intentos de prueba — señal de que la tasa real en producción (con el `accion_next` real del orquestador, no el prompt sintético usado para medir) podría ser más alta. Esto queda como tensión abierta a confirmar con datos reales.
- **Fix**: `src/lib/structuredOutputRetry.ts` ahora usa `includeRaw: true` en los 5 nodos que llaman `.withStructuredOutput()` (orchestrator, orchestratorModoBase, validator, specialist/mvp, informes/parseOpciones). Cuando Zod rechaza el resultado, identifica los campos exactos que fallaron (vía `error.issues`), intenta `JSON.parse()` solo sobre esos, y re-valida — si funciona, se recupera sin gastar un reintento (llamada nueva al modelo). Logueado explícitamente y distinto de un éxito normal: `structured output reparado sin reintento: schema="..." campos=[...]`.
- **Existe un segundo sub-tipo de fallo, no cubierto**: a veces el string de `recomendaciones` no es JSON válido (corchetes/llaves mal cerrados, contenido genuinamente corrupto, no solo mal tipado). `JSON.parse()` tira excepción y la reparación correctamente no lo toca (no se adivina una reconstrucción) — cae al reintento normal. Este sub-tipo sigue pudiendo agotar los 3 intentos.
- Se mejoró también la calidad del error guardado en la fila del run: antes, cuando `parsingError` de LangChain venía vacío (pasa en el segundo sub-tipo), el mensaje era genérico sin detalle. Ahora reconstruye el diagnóstico con `schema.safeParse()` directamente.

## Archivos y estructuras clave modificados

- `src/lib/pdfVerification.ts` (nuevo) — `resolveStartupIdFromPdfText()`.
- `src/routes/informes.ts` — ambos caminos de `/informes/parse` devuelven `startup_id`.
- `src/lib/structuredOutputRetry.ts` — reescrito, capa de reparación + diagnóstico mejorado.
- `src/graph/nodes/orchestrator.ts`, `src/graph/nodes/orchestratorModoBase.ts`, `src/graph/nodes/validator.ts`, `src/specialist/mvp.ts`, `src/informes/parseOpciones.ts` — actualizados para pasar `includeRaw: true` y el schema a `invokeStructured()`.
- `.env.local` / `.env.example` — nueva var `PDF_SIGNING_PUBLIC_KEY`.

## Problemas conocidos / pendientes

1. Segundo sub-tipo de fallo del especialista (JSON genuinamente corrupto) sigue sin cobertura — monitorear los logs de `structured output reparado sin reintento` (o su ausencia en un `failed`) para medir la tasa real. Confirmado en producción real el 2026-07-14 (ver sección "Entorno local verificado" arriba): la primera corrida real vía UI falló así, la segunda con el mismo PDF funcionó. Reconfirmado el 2026-07-19 contra esta producción con el camino PDF firmado/modo enriquecido real. **Reconfirmado una cuarta vez el 2026-07-21**, ahora vía texto libre forzado deliberadamente (ver "Pendiente cerrado: `GET /runs/:id`..." arriba) — mismo patrón exacto (`resumen_estrategia` ausente, `recomendaciones` como string), cada vez en un camino de entrada distinto (UI, PDF firmado, texto libre). Cuatro confirmaciones reales — vale la pena priorizarlo.
2. `informeParseDecisionSchema` tiene la misma forma de riesgo (array de objetos) que `specialistDecisionSchema` pero no se lo vio fallar hoy — ya tiene la capa de reparación aplicada preventivamente, sin confirmar si hacía falta.
3. `handoff_startup_next_v2.md` y `handoff_entorno_pruebas_local.md` siguen sin trackear en este y otros repos — ambos son documentos de traspaso generados a propósito al cierre de sesiones anteriores, pensados para copiarse a las carpetas de trabajo al inicio de una sesión nueva. No se commitean (no son código); `handoff_startup_next_v2.md` contiene pendientes adicionales no reflejados aquí (Hermes en suspenso, entrevista de `startup-advisor` terminando abruptamente, excepción de Avast pendiente).
4. ~~`GET /runs/:id` no expone el campo `error`...~~ **Resuelto el 2026-07-21** (ver "Pendiente cerrado..." arriba).

## Próximos pasos sugeridos

1. Dejar correr el sistema un tiempo real y revisar los logs de reparación/fallo del especialista para confirmar o descartar la tensión del ~6% vs. producción real — ahora con cuatro confirmaciones reales, la prioridad de esto sube.
2. Considerar si otros especialistas (`financiacion`, `modelo_negocio`, `escalado`, `organizacion`, `administracion` — hoy todos caen en `sin_especialista`) son el próximo módulo a construir, siguiendo el patrón ya probado de `specialist/mvp.ts`.
3. El endpoint `POST /startups/{id}/individuals` de `ontology-engine` devuelve `500` sin detalle (encontrado el 2026-07-11, no investigado — se evitó usándolo, se usó un `startup_id` ya poblado de antes). Sigue bloqueando probar el modo enriquecido de extremo a extremo. Vale la pena mirarlo si se necesita crear datos de ontología de prueba por API.
4. Diseñar la interfaz para que Hermes invoque `startup-next` (objetivo final del proyecto según `handoff_entorno_pruebas_local.md`) — el entorno de los tres componentes ya quedó verificado y estable para arrancar esto.
