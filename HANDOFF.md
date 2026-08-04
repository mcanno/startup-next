# HANDOFF — startup-next (backend)

Última actualización: 2026-08-03.

## Regresión de `mvp`/`ideacion` contra producción tras el fix del sub-tipo "desanidado": cierre del pendiente de 2941ec0 (2026-08-03)

Cierra el pendiente dejado abierto en el fix del sub-tipo "desanidado"
(commit `2941ec0`, ver "Fix del sub-tipo 'desanidado'..." más abajo): ese
día, la regresión obligatoria de `mvp`/`ideacion` (Punto 6 del diseño de
expansión) quedó bloqueada por saldo agotado de la API de Anthropic. El
saldo ya se recargó — regresión ejecutada contra esta versión exacta del
código en producción (`startup-next.fly.dev`).

### `ideacion` — Cafelibro real, misma tarea del 2026-07-19

Reinvocado con el `startup_id` real de Cafelibro (`4df8de99-...`) y la
misma tarea real ya usada en la verificación de
`diseno_especialista_ideacion.md` ("Elegir un único segmento y validarlo
con entrevistas..."). Resultado: `especialista_usado: "ideacion"`,
`status: "approved"`, 5 recomendaciones citando fuentes reales de
Customer Development ("Descubrimiento de clientes, fase 1: Determinar
las hipótesis del modelo de negocio", "Camino al desastre... Suponer
que «sé lo que quiere el cliente»") — sin contaminación de chunks
`pmf`.

**Nota aparte, no una regresión**: `hallazgos_ontologia: []` en este run,
en vez del hallazgo de modo enriquecido visto el 2026-07-21 con el mismo
`startup_id` — esperado, consecuencia directa del retiro completo del
ABox en `ontology-engine` (ver "ontology-engine pasa a TBox puro",
2026-07-23), no relacionado con el fix del desanidado.

### `mvp` — texto libre nuevo

Tarea nueva, redactada de cero ("ya validamos el problema con entrevistas
de clientes reales... construir un prototipo mínimo viable..."), modo
base (`startup_id` aleatorio generado por `/informes/parse`). Resultado:
`especialista_usado: "mvp"`, `status: "approved"`, 5 recomendaciones
citando fuentes reales de Customer Development (construcción del PMV con
el conjunto mínimo de características, priorizar evangelistas),
`hallazgos_ontologia` con `PREREQUISITO_GENERICO` (Experimento/Hipótesis)
— esperado en modo base, mismo criterio ya visto en corridas anteriores.

### Limpieza

2 runs de prueba (`1934970f-...` de `ideacion`, `b1396f9f-...` de `mvp`,
ambos `requested_by: "hermes"`) borrados al cierre, confirmado por
conteo (`next_action_runs`: 36 → 34). Las 2 filas reales de Cafelibro
(`567fcf09-.../a1975e40-...`) verificadas intactas antes y después de
borrar.

### Cierre

**Sin regresión detectada.** El fix del sub-tipo "desanidado" (`2941ec0`)
queda formalmente cerrado con las tres patas de evidencia completas:
offline (8 tests en `tests/lib/structuredOutputRetry.test.ts`), producción
real para el caso que motivó el fix (12/12 `pmf` aprobadas, 2026-07-24,
8 vía el camino nuevo confirmado por logs), y ahora esta regresión de los
2 especialistas ya existentes contra la misma versión de código. Ver
"Problemas conocidos / pendientes" #1 más abajo, actualizado.

## Especialista "pmf" implementado y desplegado — primer paso de la expansión 2→6 (2026-07-24)

Ejecuta el primer especialista de `diseno_expansion_especialistas.md`
(confirmado con las 3 decisiones abiertas resueltas: mapeo completo de los
7 capítulos de *7 Powers*, ancla `BusinessModelCanvas` reasignada a
`ideacion`, y los 63 chunks de confianza media de `guia-canvas.jsonl`
**no** re-etiquetados para `operaciones` por ahora). Orden confirmado:
`pmf` → `escalado` → `operaciones` → `plataformas`, un especialista a la
vez. `pmf` arrancó primero por ser el único con fuente principal ya en el
corpus (fases de validación de clientes de Customer Development) — sin
esperar ninguna ingesta nueva.

### Taxonomía: enum de 7 roles a 6, cerrado por schema

`especialistaRoleSchema` (`src/schemas.ts`) pasa de `["ideacion", "mvp",
"financiacion", "modelo_negocio", "escalado", "organizacion",
"administracion"]` a `["ideacion", "mvp", "pmf", "operaciones", "escalado",
"plataformas"]`. `financiacion`/`administracion`/`modelo_negocio`/
`organizacion` quedan estructuralmente irrepresentables — el orquestador
no puede emitirlos nunca más, no solo caen a `sin_especialista` en tiempo
de ejecución.

### `ESPECIALISTAS_IMPLEMENTADOS`: fuente única para evitar la clase de bug del hardcode ya conocida

`src/graph/especialistasImplementados.ts` (nuevo) — `Set` compartido entre
`orchestrator.ts` (`especialista_disponible`) y `specialist.ts`
(dispatch), hoy `{"ideacion", "mvp", "pmf"}`. Evita repetir la lista de
roles implementados en más de un lugar — la duplicación ya causó un bug
real una vez (`validator.ts` hardcodeaba `"mvp"` mientras `orchestrator.ts`/
`specialist.ts` ya reconocían `"ideacion"`, ver
`diseno_especialista_ideacion.md`, punto 5.4). `specialist.ts` pasa de un
ternario de 2 ramas a un `switch` con un `default` que lanza explícito
(en vez de asumir `mvp`) si algún día el invariante de arriba se rompe.

### `orchestrator.ts`: prompt reescrito con fronteras explícitas para los 6 roles

La línea única de roles (`SYSTEM_PROMPT`) pasa a una lista con la frontera
de una frase por rol, versionada — mismo criterio ya usado en
`hermes-startup-next` para el criterio de selección de contexto histórico
("el criterio no debe quedar implícito"). Texto completo en
`diseno_expansion_especialistas.md`, Punto 5.

### `orchestratorModoBase.ts`: `ESPECIALISTA_A_CONCEPTO` reasignado

`modelo_negocio: "BusinessModelCanvas"` (rol eliminado) pasa a `ideacion:
"BusinessModelCanvas"` — `ideacion` cubre BMC explícitamente en la
taxonomía nueva. `escalado: "EngineOfGrowth"` sin cambios (sigue sin
especialista implementado). `pmf`/`operaciones`/`plataformas` sin ancla,
mismo criterio que `ideacion` en su momento: sin evidencia real de que un
concepto nuevo del TBox haga falta.

### `src/specialist/pmf.ts` (nuevo)

Mismo patrón exacto que `ideacion.ts`/`mvp.ts`, reusa
`specialistDecisionSchema` sin cambios. `SYSTEM_PROMPT` propio: encaje
producto-mercado con clientes reales ya existentes (desarrollo de clientes
en fase de validación, Jobs To Be Done) — explícitamente no construcción
de producto (`mvp`) ni escalado.

### Re-etiquetado del corpus: 309 chunks de `customer-development.jsonl`

Aditivo (`["mvp", "pmf"]`, no exclusivo), mismo criterio que `ideacion`.
Candidatos identificados por título de capítulo, alta confianza: "Una
introducción a la validación de clientes" (65), "Validación de clientes,
fase 2:" (22), "Validación de clientes, fase 3: Desarrollar el
posicionamiento de la empresa y del producto" (222).

**Verificado con evidencia real, no solo por el `.jsonl`**:
`rag-ingest load` bloqueado localmente en su paso de verificación (llamada
a Voyage AI) por Avast interceptando TLS — mismo problema documentado en
sesiones anteriores. El upsert a Postgres en sí (`upsert_chunks`/
`resync_book`) no depende de esa llamada y se confirmó exitoso por su
propio log (`778 chunks upserteados, 0 huérfanos eliminados`, repetido
igual dos veces). Verificación independiente por SQL directo:
`especialista_tags` → `['mvp']` 610, `['mvp','pmf']` 309 (exacto),
`['mvp','ideacion']` 207 (sin cambios) — total sigue en 1.126, 0 chunks con
`embedding IS NULL`.

### Deploy y verificación real contra producción

`flyctl deploy` falló primero por el mismo problema de Avast/TLS contra el
builder remoto de Fly (`x509: certificate signed by unknown authority`) —
resuelto pausando Avast (confirmado por el usuario). `GET /health` → `200`
tras el redeploy.

**Caso `pmf`** (texto libre, "40 clientes pagando... validar si existe
encaje producto-mercado real..."): las primeras 3 corridas terminaron en
`failed` con el mismo error ya documentado en "Problemas conocidos /
pendientes" #1 (`resumen_estrategia` ausente, `recomendaciones` como
string) — **anotado como observación, no una causa nueva**: 3 fallos
consecutivos con esta tarea puntual es un dato llamativo frente a la tasa
sintética ~6% ya medida, pero el código de `pmf.ts` se confirmó idéntico
en estructura a `ideacion.ts`/`mvp.ts` (sin bug introducido), y una cuarta
corrida con una redacción de tarea distinta (mismo contenido temático)
resolvió `approved` en el primer intento — consistente con el bug
cross-cutting ya conocido, no un problema nuevo de `pmf`. Resultado final:
`especialista_usado: "pmf"`, 5 recomendaciones, fuentes citadas
efectivamente del corpus recién re-etiquetado (`"Validación de clientes,
fase 3..."`, `"Introducción a la validación de clientes..."`) — confirma
que el re-etiquetado no solo cuenta bien en la base sino que el
especialista lo recupera y cita.

**Regresión de `mvp`/`ideacion`** (obligatoria por ser prompt compartido,
Punto 6 del diseño): `ideacion` reinvocado contra Cafelibro real
(`4df8de99-...`, misma tarea real del 2026-07-19) → `especialista_usado:
"ideacion"`, `approved`, fuentes de Customer Development/Guía Canvas sin
contaminación de chunks `pmf`. `mvp` con texto libre nuevo ("ya validamos
el problema... construir un prototipo mínimo viable...") → `especialista_usado:
"mvp"`, `approved`. Sin regresión por el cambio de prompt compartido.

**Limpieza**: 6 runs de prueba (3 `pmf` fallidos, 1 `pmf` aprobado, 1
regresión `ideacion`, 1 regresión `mvp`) borrados al cierre, confirmado
por conteo (`next_action_runs`: 40 → 34). Las 2 filas reales de Cafelibro
verificadas intactas antes y después.

### Próximo paso

`escalado`, según el orden confirmado — requiere el PDF de *7 Powers*
(capítulos Counter-Positioning, Switching Costs, Branding, Cornered
Resource), a pedir al usuario cuando le toque el turno.

## Fix del sub-tipo "desanidado" en la capa de reparación (2026-07-24, misma sesión, continuación directa)

Implementa el camino de arreglo identificado en la investigación anterior
("Hipótesis de maxTokens..." más abajo): cuando `JSON.parse()` de un
campo roto produce un **objeto** (no el array/tipo esperado para ese
campo) que **ya satisface el schema completo de nivel superior**, se
desanida y se usa directo — en vez de descartarlo como irreparable y
gastar un reintento.

### Implementación: genérica, sin nombres de campo hardcodeados

`attemptRepair()` (`src/lib/structuredOutputRetry.ts`) ahora, para cada
campo roto cuyo `JSON.parse()` tenga éxito, comprueba primero
`schema.safeParse(parsedValue)` contra el **schema entero** — si eso
valida, retorna inmediato con `kind: "desanidado"`. Si no valida (el caso
común: el parseo simplemente da el valor correcto para ESE campo, la
reparación de siempre), sigue el camino ya existente (`kind: "campo"`).
Aplica a los 5 nodos LLM-facing por igual — no hay ninguna referencia a
`specialistDecisionSchema` ni a `resumen_estrategia`/`recomendaciones` en
el código nuevo.

**Conservador, tal como se pidió**: si el objeto parseado no valida
completo contra el schema, no se fuerza nada — cae al camino de reparación
campo-a-campo de siempre, y de ahí al reintento normal si tampoco alcanza.
Nunca se reconstruye a ciegas (mismo principio ya aplicado a JSON
genuinamente corrupto).

**Logueado de forma distinguible**: `console.warn` en `invokeStructured()`
ahora dice `"reparado sin reintento (desanidado)"` para este caso nuevo,
vs. `"reparado sin reintento"` (sin sufijo) para la reparación campo-a-campo
ya existente — se puede medir por separado cuál actúa con qué frecuencia
en los logs de producción.

### Verificación offline: 5 capturas reales, no sintéticas

Antes de escribir el fix, se capturó contenido real de fallo (no solo el
preview de antes): instrumentación temporal (volcado completo del campo
roto, revertida después) desplegada, disparando la tarea de `pmf` que
fallaba hasta obtener 5 capturas reales completas desde `flyctl logs`. Las
5 son JSON válido, con exactamente las claves `resumen_estrategia` +
`recomendaciones` del schema completo — confirma la hipótesis de
"desanidado" con evidencia directa, no solo la muestra parcial (preview)
de la sesión anterior.

Estas 5 capturas quedan como fixtures reales en
`tests/lib/fixtures/capturedNestedPayloads.ts` (nuevo) y se testean
offline en `tests/lib/structuredOutputRetry.test.ts` (nuevo, 8 tests):
las 5 reparan correctamente vía `invokeStructured` sin gastar reintento
(`call` mockeado, se verifica `toHaveBeenCalledTimes(1)`), más 3 casos de
control — la reparación campo-a-campo previa sigue funcionando sin
cambios, un objeto parseado que NO satisface el schema completo no se
fuerza (cae a los 3 reintentos), y JSON genuinamente corrupto (no
parseable) sigue sin repararse a propósito. `npx tsc --noEmit` y
`npm test` limpios: 18/18 (10 preexistentes + 8 nuevos).

### Verificación real contra producción: 12/12 aprobadas, con el nuevo camino confirmado activo por logs

Desplegado. Se repitió la misma tarea de `pmf` que fallaba (~33-50% de
fallo medido en la sesión anterior) **12 veces reales, concurrentes**:
**12 de 12 aprobadas, 0 fallos**. `flyctl logs` confirma que **8 de las
12** dispararon el mensaje nuevo `"reparado sin reintento (desanidado)"`
— es decir, 8 de esas 12 corridas habrían fallado bajo la lógica anterior
(coincide con la tasa alta ya medida) y el fix las recuperó en el momento,
sin gastar ningún reintento. No es solo que "no falló" — hay evidencia
directa de que el camino nuevo se activó y por qué.

### Regresión de `mvp`/`ideacion`: bloqueada por un problema externo, no por el fix

Al intentar la regresión pedida (Cafelibro real + `mvp` con texto libre),
ambos runs fallaron/nunca arrancaron con:

```
400 {"type":"error","error":{"type":"invalid_request_error","message":
"Your credit balance is too low to access the Anthropic API. Please go
to Plans & Billing to upgrade or purchase credits."}}
```

**No es una regresión del fix** — es que el volumen real de esta sesión
(las decenas de corridas de las tres comprobaciones encadenadas:
clasificación, hipótesis de `maxTokens`, y esta) agotó el saldo de la
cuenta de Anthropic. Confirmado reintentando `POST /runs/{id}/start` del
run de `mvp` (mismo error, no transitorio). **Pendiente real, no cerrado
en esta sesión**: repetir la regresión de `mvp`/`ideacion` (Cafelibro)
contra producción en cuanto se recargue el saldo — el fix en sí ya tiene
evidencia sólida propia (offline + 12/12 reales), pero la regresión de los
2 especialistas existentes sigue sin confirmar contra esta versión exacta
del código.

**Limpieza**: los 24 runs de prueba de esta comprobación (10 de captura +
12 de verificación post-fix + 2 de regresión fallida/nunca-arrancada)
borrados al cierre, confirmado por conteo en dos pasos
(`next_action_runs`: 58 → 44 → 34). Las 2 filas reales de Cafelibro
verificadas intactas.

## Hipótesis de maxTokens/truncamiento: refutada con evidencia directa (2026-07-24, misma sesión)

Comprobación pedida explícitamente sobre la clasificación de arriba, antes
de construir `escalado` — si la causa fuera truncamiento por `maxTokens`,
afectaría a los tres especialistas que faltan por igual.

### Paso 1 — valores reales, confirmados por grep

`maxTokens: 2048` es **compartido** por `pmf.ts`, `mvp.ts` e `ideacion.ts`
(idéntico en los tres, no hay override por especialista). `searchRagChunks`
recupera **5 chunks por consulta** (default de la función, también
compartido).

### Paso 2 — captura del output crudo: instrumentación nueva, no un script aparte

`src/lib/structuredOutputRetry.ts` (`attemptRepair`) no dejaba rastro del
contenido real cuando un campo no era reparable — el error final solo
tenía el mensaje de Zod, sin el string original. Se agregó logging de
diagnóstico (permanente, no revertido — bajo costo, solo se activa en el
camino que ya está fallando, y directamente relevante para seguir
midiendo "Problemas conocidos" #1 en el futuro): cuando la reparación
falla, loguea cada campo aún inválido con su tipo y, si es string,
longitud + preview de inicio/fin (sin guardar el string completo).
Desplegado, y reproducido disparando la misma tarea de `pmf` repetidas
veces contra producción hasta capturar fallos reales.

**Output crudo capturado, real, de 5 fallos distintos** — patrón idéntico
en los 5:

```
campo "resumen_estrategia" sigue inválido: tipo=undefined valor=undefined
campo "recomendaciones" sigue inválido: tipo=string longitud=3379
  inicio="{"resumen_estrategia":"Antes de invertir en crecimiento, usar el checklist..."
  fin="...],"chunk_ids_citados":["889ce1f9a31a6427d22f5d7e60ec91e26dc6018d562305bf0a4c87013923d207"]}]}"
```

### Paso 3 — diagnóstico: no es truncamiento, es doble anidamiento completo

El string de `recomendaciones` en los 5 casos capturados **es JSON
completo y bien formado** (cierra limpio con `}]}`, sin cortar a mitad de
ningún valor) — **no truncado**. Lo que contiene no es el array esperado:
es el **objeto entero previsto** (`{"resumen_estrategia": "...",
"recomendaciones": [...]}`) serializado como string y metido un nivel de
más adentro del campo `recomendaciones`, dejando `resumen_estrategia`
completamente ausente en el nivel superior del tool call. El repair layer
sí intenta `JSON.parse()` sobre ese string y **tiene éxito** (es JSON
válido) — pero el resultado es un objeto, no un array, así que sigue sin
cumplir el schema y la reparación falla igual, sin lanzar excepción (por
eso no aparecía en el log anterior, que solo cubría el `catch` de
`JSON.parse`).

**Consecuencia directa**: la hipótesis de `maxTokens`/truncamiento queda
**refutada por evidencia directa**, no por inferencia. No se probó subir
`maxTokens` como siguiente paso — hacerlo habría sido testear una premisa
ya descartada por el contenido real capturado (JSON completo y balanceado,
muy por debajo de 2048 tokens: 2768-4129 caracteres de contenido, ~700-1000
tokens estimados). Por la misma razón, **limitar el tamaño/número de
chunks recuperados tampoco es una mitigación relevante para este
mecanismo** — no es un problema de volumen de contenido, es un problema
estructural de cómo Claude arma el tool call para este schema puntual (dos
campos de nivel superior, uno de ellos un array de objetos moderadamente
complejo) bajo ciertas condiciones todavía no aisladas.

### Frecuencia revisada, con la muestra completa de la sesión

Contando también esta comprobación (18 corridas reales adicionales, no
solo las 6 de la clasificación anterior): **15 de 18 aprobadas, 3
fallidas** en este segundo lote — muy distinto del 5-de-6 fallidas del
primer lote. **Total combinado de la sesión: 24 corridas reales de `pmf`,
8 fallidas, 16 aprobadas (~33%)**. Sigue muy por encima del ~6% sintético
medido antes y de la regresión `mvp`/`ideacion` (0 fallos), pero la
diferencia entre "5 de 6" y "3 de 18" del mismo mecanismo confirma que el
primer lote fue, en parte, mala suerte de muestra chica — no cambia la
conclusión de que hay algo elevando la tasa real de `pmf` sobre el
baseline, pero sí templa cuánto.

### Camino de arreglo con evidencia real, no implementado todavía

Dado que el string roto de `recomendaciones` es, de forma consistente, el
objeto completo esperado con `resumen_estrategia` anidado adentro, una
reparación mucho más específica que la actual es viable: si
`JSON.parse()` del campo roto produce un objeto (no un array) que a su vez
contiene las claves del schema de nivel superior, promover/desanidar ese
objeto en vez de descartar la reparación. Esto es un diseño concreto para
la próxima vez que se abra la investigación completa de "Problemas
conocidos" #1 — **no implementado en esta sesión**, fuera del alcance
pedido (solo diagnosticar, no arreglar).

**Limpieza**: 18 runs de esta comprobación borrados al cierre, confirmado
por conteo (`next_action_runs`: 52 → 34).

## Clasificación acotada del hallazgo de fallos consecutivos en pmf (2026-07-24, misma sesión)

Comprobación pedida explícitamente, **no la investigación completa del
bug** (eso sigue en "Problemas conocidos / pendientes" #1, sin resolver):
solo determinar si los 3 fallos consecutivos vistos al verificar `pmf` son
una categoría de fallo distinta (determinística, ligada al contenido
concreto) o la misma ~6% probabilística ya medida, y si eso cambia si la
capa de reparación (`structuredOutputRetry.ts`) puede ayudar.

**Dos pruebas adicionales, con evidencia real**:

1. **Misma tarea que falló 3 veces, reintentada una cuarta vez** (texto
   idéntico, nuevo `run_id`) → **falló de nuevo**, con el error
   `GET /runs/:id` **byte por byte idéntico** a los 3 anteriores:
   `resumen_estrategia: Invalid input: expected string, received
   undefined; recomendaciones: Invalid input: expected array, received
   string; recomendaciones: Too big: expected string to have <=6
   characters`. 4 de 4 con esta tarea puntual.
2. **Tarea distinta, redactada de cero, mismo tema** ("Llevamos medio año
   vendiendo... muchos cancelan a los pocos meses... revisando el
   posicionamiento frente a alternativas...") → **también falló**, con el
   mismo error byte por byte idéntico. Esto descarta que el problema esté
   ligado a la redacción textual exacta de una única tarea — no es
   determinismo por texto de entrada literal.

**Total de la sesión, contando las corridas de verificación original**: 5
de 6 corridas reales apuntando a `pmf` fallaron (una sola, con una tercera
redacción distinta, resolvió `approved` a la primera) — **~83% de fallo en
esta muestra**, muy por encima del ~6% sintético medido antes, y muy por
encima de la regresión `mvp`/`ideacion` de la misma sesión (0 fallos en 2
corridas).

### Clasificación

**No es una categoría nueva de fallo** — el error es textualmente idéntico
al ya documentado en "Problemas conocidos / pendientes" #1, y corresponde
específicamente al **segundo sub-tipo ya señalado ahí** ("a veces el
string de `recomendaciones` no es JSON válido... `JSON.parse()` tira
excepción y la reparación correctamente no lo toca"): si la capa de
reparación hubiera podido arreglarlo con `JSON.parse()`, el run habría
resuelto en silencio sin `error` visible (ver `structuredOutputRetry.ts`,
`attemptRepair`) — que el error llegue hasta `GET /runs/:id` en los 5
casos confirma que la reparación ya se intentó y falló las 5 veces. **La
capa de reparación actual no puede ayudar acá, tal como ya estaba
documentado** — esto no es un hallazgo nuevo sobre su cobertura.

**Lo que sí es nuevo**: la frecuencia. No es puramente determinística (1
de 6 corridas con contenido temáticamente equivalente sí funcionó a la
primera), pero tampoco se parece al ~6% independiente por llamada ya
medido — algo del **contenido recuperado** para consultas de `pmf`
(no de la redacción de la tarea, descartado por la prueba 2) parece
correlacionar con una tasa de fallo mucho más alta. **Hipótesis señalada,
no investigada** (fuera del alcance pedido de esta comprobación): los
chunks de `customer-development.jsonl` re-etiquetados para `pmf` tienen
más varianza de longitud que la mediana del corpus (máximo real 5.690
caracteres frente a una mediana de 337, ver script de verificación de esta
misma sesión) — cabría que las consultas de `pmf` recuperen con más
frecuencia chunks largos que empujan el contexto/la respuesta cerca del
límite de `maxTokens=2048`, aumentando el riesgo de truncamiento/
corrupción del campo `recomendaciones`. No confirmado — queda como pista
para una futura sesión que sí abra la investigación completa.

**Limpieza**: los 2 runs de esta comprobación borrados al cierre,
confirmado por conteo (`next_action_runs`: 36 → 34).

## ontology-engine pasa a TBox puro: modo enriquecido retirado por completo (2026-07-23)

Ejecuta el punto 6 (plan de migración) de
`diseno_ontology_engine_solo_consulta.md`, confirmado con las decisiones
de las tres preguntas abiertas (Opción C del punto 3, retiro completo del
PDF firmado, drop de las tablas de ABox). Motivado por la revisión de
arquitectura de `hermes-startup-next/HANDOFF_CONTEXTO_HISTORICO.md`
("Revisión de arquitectura (2026-07-21)"): `ontology-engine` deja de tener
ABox de ninguna startup real — ver `ontology-engine/HANDOFF.md` para el
borrado de datos (ejecutado antes, sesión separada) y el drop de esquema.

**Callers actualizados primero, servicio después** (orden de migración ya
acordado, para no romper el servicio compartido a mitad de camino):

### `OntologyContext`/modo enriquecido: eliminado, no solo deshabilitado

`orchestratorModoBase.ts` ya no expone `OntologyContext`/
`resolveOntologyContext` — no hay ningún modo que resolver, el orquestador
siempre opera en el único modo que queda (antes llamado "base"). Cambios:

- `src/lib/ontologyEngine.ts`: reescrito para exponer solo
  `getPrerequisitos`/`Prerequisito` (TBox). `getStartupGraph`,
  `validateStartup`, `toHallazgosOntologia`, y sus tipos, eliminados —
  sin caller posible ya que `ontology-engine` retiró esos endpoints.
- `orchestrator.ts`: `buildUserPrompt`/`resolveConflictoYHallazgos` ya no
  reciben `OntologyContext` ni ramifican por `mode`. `orchestratorNode` ya
  no llama a `resolveOntologyContext`.
- `validator.ts`: `fetchHallazgosOntologia` eliminada (llamaba a
  `validateStartup`, endpoint retirado). `hallazgosOntologia` es ahora
  `[]` fijo — ya era efectivamente así en producción desde el borrado del
  ABox (punto 2, sesión anterior), esto solo retira la llamada de red
  muerta.

### Mecanismo de firma PDF: retirado por completo

`src/lib/pdfVerification.ts` eliminado. `POST /informes/parse` (camino
PDF) ya no intenta extraer un `startup_id` real — devuelve
`crypto.randomUUID()` igual que el camino de texto libre (el `startup_id`
extraído del PDF nunca tuvo otro consumidor downstream que
`resolveOntologyContext`, ya eliminado — ver
`diseno_ontology_engine_solo_consulta.md`, punto 4). `PDF_SIGNING_PUBLIC_KEY`
retirado de `.env.example` y del secret de Fly (`flyctl secrets unset`).

### Verificación con evidencia real

- `npx tsc --noEmit` y `npm test` (10/10) limpios tras cada cambio.
- `npm run build` (tsc a `dist/`) limpio.
- Deploy real a `https://startup-next.fly.dev` (bloqueado primero por el
  mismo problema de Avast interceptando TLS ya documentado —
  `x509: certificate signed by unknown authority` contra el builder de
  Fly/Depot — resuelto pausando Avast, igual que sesiones anteriores).
- `GET /health` → `200`.
- Run real completo (`POST /runs` + `/start`) reusando el `startup_id`
  real de Cafelibros (`4df8de99-...`): `hallazgos_ontologia` con
  `rule_id: "PREREQUISITO_GENERICO"` (MVP → Experiment → Hypothesis, vía
  TBox puro), justificación del orquestador citando explícitamente "no
  hay comentario del asesor ni hechos registrados en la ontología" — sin
  ninguna rama de "modo enriquecido" en el código para activarse. Run de
  prueba borrado después de verificar (`next_action_runs` +
  `next_action_clarifications` en la Neon propia de `startup-next`).
- `flyctl secrets list` confirma `PDF_SIGNING_PUBLIC_KEY` ausente tras el
  redeploy.

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

1. **Sub-tipo "desanidado" (objeto completo anidado un nivel de más): arreglado y verificado el 2026-07-24** — ver "Fix del sub-tipo 'desanidado'..." arriba. Historial hasta ahí: confirmado en producción real el 2026-07-14 (ver sección "Entorno local verificado" arriba), reconfirmado el 2026-07-19 (PDF firmado/modo enriquecido), reconfirmado el 2026-07-21 (texto libre forzado), reconfirmado y diagnosticado el 2026-07-24 verificando `pmf` (24 corridas, 8 fallidas, ~33% — ver "Hipótesis de maxTokens..." y "Clasificación acotada..." arriba). `attemptRepair()` ahora detecta este patrón específico (el `JSON.parse()` de un campo roto produce un objeto que ya satisface el schema completo de nivel superior) y lo desanida en vez de descartarlo — verificado offline con 5 capturas reales (`tests/lib/structuredOutputRetry.test.ts`) y en producción (12/12 aprobadas, 8 de ellas vía el nuevo camino, confirmado por logs). **Sigue sin cobertura, a propósito, la otra cara del sub-tipo 2**: JSON genuinamente corrupto que ni siquiera `JSON.parse()` puede parsear (comillas mal cerradas a mitad, contenido truncado de verdad) — ese caso no se toca, mismo criterio de "no reconstruir a ciegas" ya aplicado desde el principio. **Regresión de `mvp`/`ideacion` (Cafelibro) verificada sin hallazgos el 2026-08-03** (ver "Regresión de `mvp`/`ideacion`..." arriba) — quedaba bloqueada por saldo agotado de la API de Anthropic, recargado y confirmado sin regresión contra esta misma versión de código. Fix formalmente cerrado.
2. `informeParseDecisionSchema` tiene la misma forma de riesgo (array de objetos) que `specialistDecisionSchema` pero no se lo vio fallar hoy — ya tiene la capa de reparación aplicada preventivamente, sin confirmar si hacía falta.
3. `handoff_startup_next_v2.md` y `handoff_entorno_pruebas_local.md` siguen sin trackear en este y otros repos — ambos son documentos de traspaso generados a propósito al cierre de sesiones anteriores, pensados para copiarse a las carpetas de trabajo al inicio de una sesión nueva. No se commitean (no son código); `handoff_startup_next_v2.md` contiene pendientes adicionales no reflejados aquí (Hermes en suspenso, entrevista de `startup-advisor` terminando abruptamente, excepción de Avast pendiente).
4. ~~`GET /runs/:id` no expone el campo `error`...~~ **Resuelto el 2026-07-21** (ver "Pendiente cerrado..." arriba).

## Próximos pasos sugeridos

1. Dejar correr el sistema un tiempo real y revisar los logs de reparación/fallo del especialista para confirmar o descartar la tensión del ~6% vs. producción real — ahora con cuatro confirmaciones reales, la prioridad de esto sube.
2. Considerar si otros especialistas (`financiacion`, `modelo_negocio`, `escalado`, `organizacion`, `administracion` — hoy todos caen en `sin_especialista`) son el próximo módulo a construir, siguiendo el patrón ya probado de `specialist/mvp.ts`.
3. El endpoint `POST /startups/{id}/individuals` de `ontology-engine` devuelve `500` sin detalle (encontrado el 2026-07-11, no investigado — se evitó usándolo, se usó un `startup_id` ya poblado de antes). Sigue bloqueando probar el modo enriquecido de extremo a extremo. Vale la pena mirarlo si se necesita crear datos de ontología de prueba por API.
4. Diseñar la interfaz para que Hermes invoque `startup-next` (objetivo final del proyecto según `handoff_entorno_pruebas_local.md`) — el entorno de los tres componentes ya quedó verificado y estable para arrancar esto.
