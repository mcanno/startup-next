# HANDOFF — startup-next (backend)

Última actualización: 2026-07-19.

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

1. Segundo sub-tipo de fallo del especialista (JSON genuinamente corrupto) sigue sin cobertura — monitorear los logs de `structured output reparado sin reintento` (o su ausencia en un `failed`) para medir la tasa real. Confirmado en producción real el 2026-07-14 (ver sección "Entorno local verificado" arriba): la primera corrida real vía UI falló así, la segunda con el mismo PDF funcionó.
2. `informeParseDecisionSchema` tiene la misma forma de riesgo (array de objetos) que `specialistDecisionSchema` pero no se lo vio fallar hoy — ya tiene la capa de reparación aplicada preventivamente, sin confirmar si hacía falta.
3. `handoff_startup_next_v2.md` y `handoff_entorno_pruebas_local.md` siguen sin trackear en este y otros repos — ambos son documentos de traspaso generados a propósito al cierre de sesiones anteriores, pensados para copiarse a las carpetas de trabajo al inicio de una sesión nueva. No se commitean (no son código); `handoff_startup_next_v2.md` contiene pendientes adicionales no reflejados aquí (Hermes en suspenso, entrevista de `startup-advisor` terminando abruptamente, excepción de Avast pendiente).
4. `GET /runs/:id` no expone el campo `error` guardado en `next_action_runs.error` cuando `status === "failed"` (`serializeRun()` en `src/routes/runs.ts`) — hoy hace falta consultar Postgres directo para diagnosticar un run fallido. Candidato simple a agregar.

## Próximos pasos sugeridos

1. Dejar correr el sistema un tiempo real y revisar los logs de reparación/fallo del especialista para confirmar o descartar la tensión del ~6% vs. producción real.
2. Considerar si otros especialistas (`financiacion`, `modelo_negocio`, `escalado`, `organizacion`, `administracion` — hoy todos caen en `sin_especialista`) son el próximo módulo a construir, siguiendo el patrón ya probado de `specialist/mvp.ts`.
3. El endpoint `POST /startups/{id}/individuals` de `ontology-engine` devuelve `500` sin detalle (encontrado el 2026-07-11, no investigado — se evitó usándolo, se usó un `startup_id` ya poblado de antes). Sigue bloqueando probar el modo enriquecido de extremo a extremo. Vale la pena mirarlo si se necesita crear datos de ontología de prueba por API.
4. Diseñar la interfaz para que Hermes invoque `startup-next` (objetivo final del proyecto según `handoff_entorno_pruebas_local.md`) — el entorno de los tres componentes ya quedó verificado y estable para arrancar esto.
5. Exponer `error` en la respuesta de `GET /runs/:id` cuando `status === "failed"` (ver pendiente 4 arriba).
