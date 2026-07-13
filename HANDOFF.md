# HANDOFF — startup-next (backend)

Última actualización: 2026-07-11.

## Módulo recién completado: verificación de firma del PDF + capa de reparación de structured output

Ambos, implementados y probados con datos reales (no mocks), pendientes de commit.

**Estado: funcional, verificado end-to-end, sin commitear todavía.**

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

1. **Nada de lo de hoy está commiteado todavía.** Rama `master`, último commit pusheado es `27fbbbc`.
2. Segundo sub-tipo de fallo del especialista (JSON genuinamente corrupto) sigue sin cobertura — monitorear los logs de `structured output reparado sin reintento` (o su ausencia en un `failed`) para medir la tasa real.
3. `informeParseDecisionSchema` tiene la misma forma de riesgo (array de objetos) que `specialistDecisionSchema` pero no se lo vio fallar hoy — ya tiene la capa de reparación aplicada preventivamente, sin confirmar si hacía falta.
4. Un archivo `handoff_startup_next_v2.md` apareció sin trackear en este y otros dos repos — origen desconocido, no se tocó.

## Próximos pasos sugeridos

1. Commitear el trabajo de hoy (repair layer + verificación de firma) y pushear.
2. Dejar correr el sistema un tiempo real y revisar los logs de reparación/fallo del especialista para confirmar o descartar la tensión del ~6% vs. producción real.
3. Considerar si otros especialistas (`financiacion`, `modelo_negocio`, `escalado`, `organizacion`, `administracion` — hoy todos caen en `sin_especialista`) son el próximo módulo a construir, siguiendo el patrón ya probado de `specialist/mvp.ts`.
4. El endpoint `POST /startups/{id}/individuals` de `ontology-engine` devuelve `500` sin detalle (encontrado hoy, no investigado — se evitó usándolo, se usó un `startup_id` ya poblado de antes). Vale la pena mirarlo si se necesita crear datos de ontología de prueba por API.
