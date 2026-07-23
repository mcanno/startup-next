# Diseño: especialista "ideacion"

> Documento de arranque, generado antes de escribir código — mismo criterio
> que `HANDOFF_HERMES.md`/`HANDOFF_CONTEXTO_HISTORICO.md` en
> `hermes-startup-next`: diseño documentado, confirmación explícita, después
> código. **No implementar nada de lo que sigue hasta confirmación
> explícita de este documento.**

## Objetivo

Implementar el especialista `ideacion`, siguiendo el patrón ya probado de
`src/specialist/mvp.ts`, para que Cafelibro (y cualquier startup real en
fase de ideación) deje de quedar atascada en `sin_especialista`. Cafelibro
hoy: `startup_id` `4df8de99-62aa-4211-b09c-e8b44fea38fb`, dos invocaciones
reales (2026-07-19) ambas resueltas a `sin_especialista`/
`especialista_faltante: "ideacion"` — ver
`hermes-startup-next/memoria/demo-cafelibro-real/*.md`.

Todo lo que sigue está investigado contra el código real (`src/`,
`ontology-engine/`, la Neon de `startup-next`), no supuesto.

## Punto 1 — Corpus RAG: no hay contenido etiquetado para ideación hoy

**Confirmado contra la base real** (`rag_chunks`, Neon propia de
`startup-next`):

```
Distribución de especialista_tags:
  ["mvp"] -> 1126

Por libro:
  Customer Development -> 778
  Guía Didáctica del Modelo Canvas (Osterwalder) -> 190
  Lean Startup -> 158
```

**Los 1.126 chunks tienen `especialista_tags: ["mvp"]`, sin excepción.**
Ninguno tiene `"ideacion"`.

**Esto no es un problema cosmético — es un bloqueo duro, confirmado
leyendo `searchRagChunks()`** (`src/db/ragQueries.ts`):

```sql
where especialista_tags @> ${tagsLiteral}::jsonb
```

`@>` es containment de JSONB: un filtro **duro**, no un sesgo de
relevancia. Si no se re-etiqueta nada, `searchRagChunks(embedding,
"ideacion")` devuelve **siempre `[]`** — el especialista de ideación
correría sin ningún fragmento del corpus, generando recomendaciones sin
respaldo real de las fuentes (y sin nada que citar en
`chunk_ids_citados`).

### De dónde vienen los tags y cómo se re-etiqueta sin volver a parsear

Investigado en `rag-ingest/rag_ingest/cli.py` y `load.py`: `especialista_tags`
se fija en el paso `parse` (un único valor de `--tags`, aplicado a **todos**
los chunks de esa corrida) y se escribe a un `.jsonl` intermedio
(`rag-ingest/out/*.jsonl`, ya presentes localmente:
`customer-development.jsonl`, `guia-canvas.jsonl`, `lean_startup.jsonl`).
El paso `load` solo lee ese `.jsonl` y hace upsert (`especialista_tags`
incluido) — no vuelve a tocar MinerU ni Voyage.

**Consecuencia práctica, confirmada**: re-etiquetar es editar los
`.jsonl` existentes línea por línea (cada línea es un chunk independiente
con su propio `capitulo`/`seccion`/`especialista_tags`) y correr
`rag-ingest load` de nuevo — sin re-parsear nada, tal como se planteó.
El propio `cli.py` asigna el mismo tag a todo un libro por corrida, pero
nada impide editar el `.jsonl` a mano con tags distintos por chunk (el
schema de la tabla ya es por-chunk).

### Qué re-etiquetar — evidencia real, por capítulo, no adivinado

Revisado el contenido real de los tres `.jsonl` por `capitulo` (título +
conteo de chunks). Los candidatos más claramente relevantes para
ideación (descubrimiento de problema, segmentación, formulación de
hipótesis — no construcción de MVP):

| Libro | Capítulo | Chunks | Por qué |
|---|---|---|---|
| Customer Development | "Una introducción al descubrimiento de clientes" | 85 | Fase 1 completa de Customer Development — literalmente descubrimiento de problema/cliente |
| Customer Development | "El descubrimiento de clientes" | 5 | Idem, sección más corta |
| Customer Development | "Camino a la epifanía: El modelo de desarrollo de clientes" | 23 | Marco conceptual completo del modelo, aplica a la fase de ideación antes que a cualquier fase posterior |
| Customer Development | "Camino al desastre: Una startup no es una versión reducida de una gran empresa" | 24 | Tesis fundacional de Blank sobre hipótesis vs. hechos — el problema central que ideación tiene que atender |
| Guía Canvas | "SESIÓN 1 DE LA IDEA, AL NEGOCIO" | 23 | Título literal: de la idea al negocio |
| Guía Canvas | "MÓDULOS DE CONTENIDO SESIÓN 2" (¿Qué valoran los clientes?) | 21 | Propuesta de valor / segmento — núcleo de ideación |
| Guía Canvas | "SESIÓN 2 ¿QUÉ VALORAN LOS CLIENTES?" | 3 | Idem |
| Guía Canvas | "MÓDULOS DE CONTENIDO SESIÓN 3" (Conectar con el cliente) | 20 | Segmentación/descubrimiento |
| Guía Canvas | "SESIÓN 3 CONECTAR CON EL CLIENTE" | 3 | Idem |

Total candidato: **~207 chunks** (de 1.126) con una lectura de título
razonablemente inequívoca hacia ideación. Lean Startup ("Comentarios
sobre El método Lean Startup", 142 chunks) es más genérico/transversal —
no se propone re-etiquetar nada de ese libro en esta pasada sin revisar
contenido, no solo título (fuera de alcance de este documento de diseño,
ver "Fuera de alcance" más abajo).

**Decisión propuesta**: agregar `"ideacion"` a `especialista_tags` de
esos ~207 chunks (no reemplazar `"mvp"` — un chunk puede servir a ambos
especialistas; `@>` de containment ya soporta arrays con más de un tag).
Edición manual de los tres `.jsonl`, `rag-ingest load` por libro
afectado, verificado con `verify_ingestion()` (ya lo corre `load`
automáticamente) más una consulta de `searchRagChunks(embedding,
"ideacion")` real antes de dar por cerrado este punto.

**Pendiente real, no resuelto en este documento**: la clasificación es
por título de capítulo, una heurística razonable pero no una revisión
exhaustiva de cada chunk. Si al implementar aparecen chunks mal
clasificados (ej. un capítulo de Fase 1 con contenido tangencial de
construcción), ajustar sobre la marcha — no bloquea el diseño.

## Punto 2 — Ancla en la ontología: confirmado, sigue sin existir

**Confirmado contra `ontology-engine/domain_ontology.py` real** (no solo
contra lo que dice `diseno_startup_next.md` sección 8, que podía estar
desactualizado): los 43 conceptos del TBox no incluyen ningún `Ideation`/
`Ideacion`/equivalente. Los conceptos más cercanos por contenido serían
`CustomerDiscovery` (Fase 1), `ProblemHypothesis`, `Hypothesis`,
`CustomerSegment` — ninguno es un match directo para "ideación" como
actividad.

`ESPECIALISTA_A_CONCEPTO` en `orchestratorModoBase.ts` confirma el mismo
hecho del lado de `startup-next`: es un `Partial<Record<...>>` con solo
`mvp`, `modelo_negocio`, `escalado` — `ideacion` no está, y
`getPrerequisitosParaEspecialista("ideacion")` ya devuelve `[]` con
gracia (`if (!conceptId) return []`), exactamente el mismo camino que
hoy toman los otros 3 roles sin anclar.

**Decisión propuesta**: **no modelar un concepto nuevo en el TBox en
esta pasada.** El especialista funciona igual sin ancla directa —
`hallazgos_ontologia` para tareas de ideación en modo base queda `[]`
(sin `PREREQUISITO_GENERICO`, ninguna narrativa de prerrequisitos), y en
modo enriquecido (caso Cafelibro) sigue viniendo de `validate()` sobre
hechos reales (R1/R2/R4), que no depende de `ESPECIALISTA_A_CONCEPTO`
para nada. Esto es consistente con "no features especulativas": modelar
un concepto de ideación en el TBox sin evidencia real de qué forma
debería tener (¿un concepto nuevo? ¿una relación hacia
`ProblemHypothesis`/`CustomerDiscovery` ya existentes?) sería inventar
estructura sin necesidad confirmada. Queda anotado como mejora futura si
el uso real muestra que el especialista se beneficiaría de un ancla
propia.

## Punto 3 — Esquema de salida: reusar `specialistDecisionSchema` tal cual

Revisado el schema real (`src/schemas.ts`): `resumen_estrategia` (string)
+ `recomendaciones[]` (`titulo`/`detalle`/`chunk_ids_citados`). Es
**agnóstico de contenido** — no tiene ninguna forma específica de MVP
(no pide "experimento", "métrica" ni nada por el estilo, es
título+detalle+citas genérico). No hay necesidad real de un schema
nuevo: el contenido de ideación (validar problema, identificar
segmento, formular hipótesis de valor) encaja en la misma forma sin
forzar nada.

**Propuesta**: reusar `specialistDecisionSchema` sin cambios. La
adaptación real a ideación pasa por el `SYSTEM_PROMPT` de
`runIdeacionSpecialist()` (contenido: validar problema/cliente,
identificar y priorizar segmento, formular y priorizar hipótesis de
valor/problema — no MVP/experimentos), no por el schema.

Si en la práctica aparece contenido que el schema genérico no puede
representar bien, es un ajuste a discutir con evidencia real de esa
corrida — no se especula acá.

## Punto 4 — Convenciones ya establecidas: se heredan gratis por reuso

Confirmado que ninguna de estas requiere código nuevo, porque son
compartidas entre todos los especialistas, no específicas de MVP:

- **`thinking` desactivado**: vive en `getChatModel()`
  (`config/models.ts`), aplica a cualquier llamada que pase por ahí — no
  hay nada que declarar por especialista.
- **≥2 campos de nivel superior** (evita el colapso a string ya
  documentado): ya lo tiene `specialistDecisionSchema` en sí mismo
  (`resumen_estrategia` + `recomendaciones`) — se hereda al reusar el
  schema, punto 3.
- **`translateFuentes()`**: vive en `validator.ts`, opera sobre
  `Borrador.recomendaciones[].fuentes` genéricamente — no sabe ni le
  importa qué especialista produjo el borrador.
- **Modelo vía `SPECIALIST_MODEL`**: confirmado en `config/models.ts`
  que `getSpecialistModelConfig()` es **compartida por todos los
  especialistas** (no hay `getIdeacionModelConfig()` separado, ni falta
  — mismo patrón que ya usa `mvp.ts`). `runIdeacionSpecialist()` la
  reusa tal cual.
- **`invokeStructured()`**: genérico sobre cualquier schema, se reusa
  llamándolo con `specialistDecisionSchema` igual que hace `mvp.ts`.

Ningún archivo compartido necesita tocarse para esto — es consecuencia
directa de reusar la infraestructura existente, no una pieza nueva.

## Punto 5 — Enrutamiento: 5 puntos exactos de código, confirmados por grep

`grep -rn '"mvp"' src/` (excluyendo tests) da la lista completa y
cerrada de lo que hoy asume "el único especialista real es mvp":

1. **`src/graph/nodes/orchestrator.ts:102`** —
   `especialista_disponible: especialistaRequerido === "mvp"`. Cambia a
   `especialistaRequerido === "mvp" || especialistaRequerido === "ideacion"`.
   Este es el único punto que decide si el run avanza a `running` (→
   especialista) o cae a `sin_especialista` — el cambio mínimo real.
2. **`src/graph/nodes/orchestrator.ts:90` y `:158`** —
   `decision.especialista_requerido ?? "mvp"`, default cuando el LLM no
   declaró el rol. Es un fallback razonable, no una puerta de
   enrutamiento — **sin cambios**.
3. **`src/graph/nodes/specialist.ts`** (`specialistNode`) — hoy llama
   `runMvpSpecialist()` sin condicional alguno. Pasa a despachar según
   `state.accionNext.especialista_requerido`: `"ideacion"` →
   `runIdeacionSpecialist()`, cualquier otro valor (hoy solo `"mvp"`
   puede llegar acá, por el punto 1) → `runMvpSpecialist()` sin cambios.
4. **`src/graph/nodes/validator.ts:125` y `:134`** — **hallazgo real de
   esta investigación, no mencionado en la lista de puntos original**:
   `ciclo.especialista` y `patch.especialistaUsado` están **hardcodeados
   a `"mvp"`** en el validador, no solo en `specialist.ts`. Sin corregir
   esto, un ciclo de ideación aprobado quedaría registrado con
   `especialista_usado: "mvp"` en `next_action_runs` — incorrecto y
   engañoso para cualquier auditoría futura (incluida la consolidación
   por entidad que ya usa `especialista_usado` del lado de Hermes).
   Cambia a `state.accionNext.especialista_requerido` en ambos lugares.
5. **`src/specialist/mvp.ts:16`** (`const ESPECIALISTA = "mvp"`) — sin
   cambios; el archivo nuevo `src/specialist/ideacion.ts` tiene su
   propio `const ESPECIALISTA = "ideacion"`, mismo patrón.

**No se toca ninguna lógica de los otros 5 roles sin implementar**
(`financiacion`, `modelo_negocio`, `escalado`, `organizacion`,
`administracion`): siguen cayendo a `sin_especialista` exactamente como
hoy, porque el cambio en el punto 1 de esta lista es una condición
`||` explícita, no una reescritura del criterio general.

## Punto 6 — Plan de verificación

**Caso principal, con evidencia real**: reusar Cafelibro
(`4df8de99-62aa-4211-b09c-e8b44fea38fb`) contra
`startup-next.fly.dev` producción, reinvocando con la misma tarea real
ya usada (`Elegir un único segmento y validarlo con entrevistas...`, ver
`memoria/demo-cafelibro-real/invocacion-2026-07-19T173347930Z-f3034ebb.md`
del lado de Hermes) o una invocación nueva equivalente. Confirmar:

- El run ya no resuelve a `sin_especialista` — llega a `approved` (o a
  `max_cycles_reached` si el validador rechaza, que sería señal real a
  investigar, no un fallo del plan de verificación en sí).
- `especialista_usado: "ideacion"` en la respuesta de `GET /runs/:id`
  (confirma el fix del punto 5.4 de arriba).
- `informe_final.recomendaciones[].fuentes` con citas reales, legibles
  (confirma que el re-etiquetado del punto 1 funcionó — sin esto,
  `chunk_ids_citados` vendría vacío en toda recomendación o el
  especialista fallaría por falta de contexto).

**Nota importante para el plan, no obvia**: Cafelibro tiene 8
individuals reales en `ontology-engine` (confirmado en
`HANDOFF_HERMES.md`) — el run corre en **modo enriquecido**, no en modo
base. Esto valida el especialista en sí y el corpus RAG, pero **no**
ejercita el camino de `getPrerequisitosParaEspecialista("ideacion")`
devolviendo `[]` (punto 2, modo base). Para cubrir ese camino también,
agregar un segundo caso con texto libre nuevo (sin PDF, `startup_id`
aleatorio) pidiendo una tarea de ideación — confirmar que igual llega a
`approved`, con `hallazgos_ontologia: []` (nunca error, nunca bloqueo).

**Limpieza**: cualquier run de prueba adicional (el segundo caso, modo
base) se borra al cierre, mismo criterio y mismo mecanismo ya usado en
esta sesión (`@neondatabase/serverless`, leyendo `.env.local` directo,
confirmado por conteo antes/después). El run real de Cafelibro **no se
borra** — es uso genuino del producto, no un artefacto de prueba.

## Fuera de alcance de este documento

- Revisión chunk-por-chunk (no solo por título de capítulo) del corpus
  para refinar el re-etiquetado del punto 1.
- Modelado de un concepto de ideación en el TBox (punto 2) — deferido
  hasta que haya evidencia real de que hace falta.
- Los otros 5 especialistas sin implementar.
- Cualquier cambio del lado de `hermes-startup-next` — Hermes ya sabe
  interpretar `especialista_usado`/`sin_especialista` genéricamente, no
  necesita saber que "ideacion" existe.

## Confirmación pedida

Con esto, quedan resueltos con evidencia real los 6 puntos pedidos. No
se escribe código de `src/specialist/ideacion.ts` ni se toca
`orchestrator.ts`/`validator.ts`/`specialist.ts` ni se re-etiqueta el
corpus hasta que este documento se confirme explícitamente.
