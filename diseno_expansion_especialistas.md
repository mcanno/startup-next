# Diseño: expansión del sistema de especialistas (2 → 6)

> Documento de arranque, generado antes de escribir código — mismo criterio
> que `diseno_especialista_ideacion.md`, que es la plantilla que esta
> expansión replica, no un diseño desde cero. **No implementar nada de lo
> que sigue hasta confirmación explícita de este documento.**

## Objetivo

Expandir `startup-next` de 2 especialistas implementados (`ideacion`, `mvp`)
a 6, según la taxonomía final ya decidida por el usuario (no a debatir):
`pmf`, `operaciones`, `escalado` y `plataformas` se suman como especialistas
nuevos; `financiacion` y `administracion` desaparecen de la taxonomía por
completo. `ideacion` y `mvp` no se renombran ni se reenrutan — solo
evolucionan en el contenido que cubren (`ideacion`: Ideación + Business
Model Canvas; `mvp`: Prototipado + MVP + economías de escala).

Todo lo que sigue está investigado contra el código real (`src/`,
`ontology-engine/domain_ontology.py`, `rag-ingest/out/*.jsonl`), no
supuesto — mismo estándar de evidencia que el documento de `ideacion`.

## Taxonomía final — mapeo de contenido

| Rol | Estado | Cubre |
|---|---|---|
| `ideacion` | existente, evoluciona | Ideación + Business Model Canvas |
| `mvp` | existente, evoluciona | Prototipado + MVP + economías de escala |
| `pmf` | nuevo | Product-market fit, desarrollo de clientes, Jobs To Be Done |
| `operaciones` | nuevo | Operaciones, poder de procesos, organizaciones IA-first |
| `escalado` | nuevo (rol ya existe en el enum, sin implementar) | Escalado, contraposicionamiento, recursos protegidos |
| `plataformas` | nuevo | Emprendimiento en plataformas |

**Nota sobre `escalado`**: no es un rol nuevo en `especialistaRoleSchema`
— ya existe hoy (uno de los 7 originales) y ya tiene ancla parcial en el
TBox (`EngineOfGrowth`, ver Punto 1 más abajo), pero nunca tuvo un
`src/specialist/escalado.ts`. Para este documento es "nuevo" en el sentido
de "a implementar", igual que `pmf`/`operaciones`/`plataformas`.

**Fuentes provistas por el usuario, no buscadas ni asumidas** — ya
definitivas (ver Punto 2 para el mapeo completo): *7 Powers* (Hamilton
Helmer, transversal a 4 especialistas por capítulo), *Jobs to be Done*
(Anthony Ulwick, → `pmf`), *Platform Scale* (Sangeet Paul Choudary, →
`plataformas`), y varios artículos/PDFs de organizaciones IA-first (→
`operaciones`). Se aportan recién cuando le toque el turno a cada
especialista en el orden del Punto 4, no todas de una vez.

## Punto 1 — Enumeración cerrada de puntos de código a tocar

`grep -rn '"mvp"\|"ideacion"\|financiacion\|administracion\|modelo_negocio\|organizacion\|especialista_requerido\|EspecialistaRole'` sobre
`src/` (excluyendo tests, que no mencionan ningún rol) da la lista completa
y cerrada — misma disciplina que encontró el hardcode de `validator.ts` en
el diseño de `ideacion`.

### 1. `src/schemas.ts:44-53` — `especialistaRoleSchema`

```ts
export const especialistaRoleSchema = z.enum([
  "ideacion", "mvp", "financiacion", "modelo_negocio",
  "escalado", "organizacion", "administracion",
]);
```

Pasa a:

```ts
export const especialistaRoleSchema = z.enum([
  "ideacion", "mvp", "pmf", "operaciones", "escalado", "plataformas",
]);
```

Este cambio por sí solo ya resuelve la mitad del punto "confirmar qué pasa
con `financiacion`/`administracion`": al no estar en el enum, el
orquestador (`orchestratorDecisionSchema.especialista_requerido`, que
reusa este mismo schema) **no puede emitirlos nunca más** — no es que
caigan a `sin_especialista` en tiempo de ejecución, es que se vuelven
estructuralmente irrepresentables. `modelo_negocio` y `organizacion`
(los otros dos de los 7 originales, no mencionados por nombre en la
taxonomía final pero tampoco presentes en ella) corren la misma suerte —
ver el punto ambiguo señalado en la tabla del Punto 5 sobre a dónde va el
ancla de `modelo_negocio` (`BusinessModelCanvas`).

### 2. `src/graph/nodes/orchestrator.ts:27` — lista de roles en el `SYSTEM_PROMPT`

```
especialista_requerido debe ser el rol que mejor atiende la acción elegida: ideacion, mvp, financiacion, modelo_negocio, escalado, organizacion, o administracion.
```

Se reescribe completo con los 6 roles + fronteras explícitas — ver Punto 5.

### 3. `src/graph/nodes/orchestrator.ts:90` — `especialista_disponible`

```ts
especialista_disponible: especialistaRequerido === "mvp" || especialistaRequerido === "ideacion",
```

Hoy es una cadena `||` de 2 términos. Escalar a mano a 6 términos (`===
"mvp" || === "ideacion" || === "pmf" || ...`) es exactamente el tipo de
duplicación que ya causó el hardcode de `"mvp"` en `validator.ts` (hallazgo
real del diseño de `ideacion`, punto 5.4 de ese documento): dos lugares
independientes (`orchestrator.ts` y `specialist.ts`) tendrían que mantener
la misma lista de "roles implementados" sincronizada a mano, cinco veces
más grande que antes.

**Propuesta (evita repetir la clase de bug ya vista una vez)**: introducir
una única fuente de verdad, ej. en `specialist.ts` o un módulo nuevo
chico:

```ts
export const ESPECIALISTAS_IMPLEMENTADOS = new Set<EspecialistaRole>([
  "ideacion", "mvp", "pmf", "operaciones", "escalado", "plataformas",
]);
```

`orchestrator.ts` la consulta para `especialista_disponible`,
`specialist.ts` la usa como guía del dispatch (ver punto 5). Un solo lugar
que editar cuando se sume el próximo especialista, no dos. Esto no es una
abstracción especulativa: es la corrección directa de un bug de clase ya
confirmado en este mismo proyecto.

### 4. `src/graph/nodes/orchestratorModoBase.ts:24-34` — `ESPECIALISTA_A_CONCEPTO`

```ts
// Solo 3 de los 7 roles tienen ancla en el TBox hoy...
const ESPECIALISTA_A_CONCEPTO: Partial<Record<EspecialistaRole, string>> = {
  mvp: "MVP",
  modelo_negocio: "BusinessModelCanvas",
  escalado: "EngineOfGrowth",
};
```

El comentario ("7 roles", "solo mvp y modelo_negocio son match directo")
queda desactualizado con la taxonomía nueva y hay que reescribirlo. El
contenido del mapa también cambia — ver el punto de decisión abierto en el
Punto 5 (qué pasa con la entrada `modelo_negocio: "BusinessModelCanvas"`
una vez que ese rol desaparece).

### 5. `src/graph/nodes/specialist.ts` — dispatcher

Hoy es un ternario de 2 ramas (`"ideacion"` → `runIdeacionSpecialist()`,
cualquier otra cosa → `runMvpSpecialist()`, comentario explícito de que
"hoy solo mvp e ideacion pueden llegar acá"). Pasa a un dispatch real
sobre 6 ramas — ver Punto 4 para el orden de aparición de cada rama
conforme se van implementando (no hace falta escribir las 6 de una vez,
cada especialista nuevo agrega su rama cuando se implementa).

### 6. `src/specialist/pmf.ts`, `operaciones.ts`, `escalado.ts`, `plataformas.ts` — nuevos

Mismo patrón exacto que `ideacion.ts` (que a su vez es el mismo patrón que
`mvp.ts`): `const ESPECIALISTA = "..."`, `SYSTEM_PROMPT` propio,
`runXSpecialist()` reusando `specialistDecisionSchema` sin cambios (ver
razonamiento del Punto 3 de `diseno_especialista_ideacion.md` — sigue
aplicando igual, el schema es agnóstico de contenido).

### Confirmado limpio, sin cambios necesarios

- **`src/graph/nodes/validator.ts`** — `ciclo.especialista` y
  `especialistaUsado` ya usan `accionNext.especialista_requerido`
  dinámicamente (fix aplicado en el pase de `ideacion`, punto 5.4 de ese
  documento). Confirmado por lectura directa del archivo: **no hay ningún
  hardcode de rol acá** — no es una repetición del bug viejo, ya está
  corregido de raíz y no necesita tocarse para escalar a 6 roles.
- **`src/db/schema.ts:38`** — comentario genérico sobre
  `especialista_requerido`, sin enumerar roles. Sin cambios.
- **`src/schemas.ts` — `orchestratorDecisionSchema`** — reusa
  `especialistaRoleSchema` (punto 1), no tiene su propia lista de roles.
  Se actualiza gratis en cuanto cambia el enum base.
- **Convenciones compartidas del Punto 4 de `diseno_especialista_ideacion.md`**
  (`thinking` desactivado, `SPECIALIST_MODEL` compartido,
  `invokeStructured()` genérico, `translateFuentes()` agnóstico de
  especialista): se heredan gratis por reuso para los 4 especialistas
  nuevos, igual que ya se confirmó para `ideacion`. Ningún archivo de
  `config/models.ts` necesita una entrada por especialista.

### Fuera del repo, pero downstream — anotado, no bloqueante

`startup-next-ui/lib/types.ts:20-26` tiene un union type de TypeScript
espejado a mano del enum viejo de 7 roles (`"ideacion" | "mvp" |
"financiacion" | "modelo_negocio" | "escalado" | "organizacion" |
"administracion"`). No se toca en este documento (fuera de alcance de
`startup-next`), pero queda anotado como seguimiento necesario en una
sesión aparte sobre `startup-next-ui` una vez que la taxonomía nueva esté
implementada y desplegada — de lo contrario ese repo queda con un tipo que
miente sobre los valores reales que `especialista_usado` puede traer.

## Punto 2 — Plan de ingesta de fuentes nuevas

### Fuentes definitivas y mapeo fuente → `especialista_tags`, confirmado

| Fuente | Autor | Especialista(s) destino | Cómo se decide |
|---|---|---|---|
| *7 Powers* | Hamilton Helmer | `mvp`, `escalado`, `operaciones`, `plataformas` — ver desglose por capítulo abajo | **No 1:1** — transversal, mapeo por capítulo. |
| *Jobs to be Done* | Anthony Ulwick | `pmf` | Explícito en la taxonomía: "pmf... jobs to be done". Mapeo 1:1. |
| *Platform Scale* | Sangeet Paul Choudary | `plataformas` | Explícito: "plataformas: emprendimiento en plataformas". Mapeo 1:1 — ver justificación de la elección abajo. |
| Artículos/PDFs de organizaciones IA-first (varios) | varios | `operaciones` | Explícito: "operaciones... organizaciones IA-first". Mapeo 1:1. |

### `7 Powers`: una fuente, cuatro especialistas — mapeo por capítulo, cerrado

*7 Powers* describe 7 "powers" en capítulos separados. Mapeo completo,
confirmado, sin capítulos huérfanos:

| Capítulo (power) | Especialista destino |
|---|---|
| Scale Economies | `mvp` |
| Counter-Positioning | `escalado` |
| Switching Costs | `escalado` |
| Branding | `escalado` |
| Cornered Resource | `escalado` |
| Process Power | `operaciones` |
| Network Economies (efectos de red) | `plataformas` |

**Mecánica de ingesta, dado que `rag-ingest parse --tags` aplica un único
tag a todos los chunks de una corrida** (confirmado en `cli.py`, mismo
mecanismo ya usado para `ideacion`): parsear *7 Powers* una sola vez con
un tag provisorio (`escalado`, el especialista con más contenido del
libro: 4 de los 7 capítulos), después editar el `.jsonl` resultante a mano
por capítulo — exactamente el mismo procedimiento "editar `.jsonl`,
re-`load`, verificar con `searchRagChunks()`" ya probado para el
re-etiquetado de `ideacion` — para mover los chunks de Scale Economies a
`["escalado", "mvp"]`, los de Process Power a
`["escalado", "operaciones"]`, y los de Network Economies a
`["escalado", "plataformas"]` (aditivo en todos los casos, no exclusivo,
mismo criterio que la vez pasada — no `["escalado"]` puro para ningún
capítulo salvo Counter-Positioning/Switching Costs/Branding/Cornered
Resource, que sí quedan solo con `escalado` por no tener rol adicional
asignado).

### `Platform Scale` sobre `Platform Revolution` — elección deliberada, no la única fuente de plataformas posible

Entre las fuentes candidatas de referencia para plataformas, se elige
*Platform Scale* (Choudary) en vez de *Platform Revolution* (Parker/Van
Alstyne/Choudary) por ser más operativo/accionable: diseño de la
interacción central (*core interaction*), arranque en frío, bucles de
crecimiento — contenido más directamente traducible a recomendaciones
concretas para un especialista de `startup-next`, frente al enfoque más
panorámico/conceptual del otro. **Mismo criterio ya aplicado en el corpus
actual**: la Guía Didáctica del Modelo Canvas se prefirió sobre el PDF
original de Osterwalder por ser "más densa en contenido accionable para
el especialista" (`diseno_startup_next.md`, sección 4). La cara más
conceptual de plataformas (efectos de red) queda cubierta igual, por el
capítulo Network Economies de *7 Powers* (ver arriba) — no es un hueco.

### Atribución del campo `libro` al ingerir — cuidado explícito

Mismo criterio ya aplicado con la Guía del Canvas: el campo `libro` de
cada chunk (usado en `translateFuentes()` para armar la cita legible de
`informe_final`) debe reflejar la autoría real de la fuente, no
atribuirle a un autor una cita que viene de otro. Para *7 Powers*, *Jobs
to be Done* y *Platform Scale* esto es directo (`libro` = título +
autor, un solo origen cada uno). **Para el grupo de artículos IA-first,
no es directo** — son varios archivos de procedencia distinta, no un
libro único. Se decide en el momento de la ingesta de ese grupo (Punto 4,
último en el orden) cómo nombrar `libro` por artículo para que la cita
resultante en `informe_final.recomendaciones[].fuentes` sea útil y
honesta (ej. `libro` = título del artículo + medio/autor, no un nombre de
grupo genérico que oculte la fuente real de cada chunk).

### Nota de idioma — no traducir al ingerir

Cada fuente se carga en el idioma en que se tenga — no se traducen los
PDFs antes de `parse` (perdería fidelidad y trazabilidad de la cita
contra el original). Si alguna fuente (ej. *Jobs to be Done*, *Platform
Scale*) resulta en inglés, el `SYSTEM_PROMPT` del especialista
correspondiente (`pmf.ts`, `plataformas.ts`) debe indicar explícitamente
que las recomendaciones se redactan siempre en español de España aunque
los fragmentos recuperados estén en inglés — mismo criterio de idioma ya
aplicado al resto del sistema (`HANDOFF.md`, "Cierre de sesión: español de
España..."). El título de la cita (`libro`/`capitulo`) puede conservar el
original en inglés — no se traduce la metadata de la fuente, solo la
redacción de la recomendación.

### Orden de ingesta

Atado al orden de construcción del Punto 4: se ingiere la fuente que
necesita el próximo especialista a construir, no todas de una vez. Un
libro/fuente a la vez, siguiendo siempre `parse` → editar tags si aplica →
`load` → `verify_ingestion()` (automático) → una consulta real de
`searchRagChunks()` por el tag nuevo, antes de dar por cerrada la ingesta
de esa fuente — mismo checklist que ya usó `ideacion`.

**Contenedor**: ya construido (`rag-ingest/Dockerfile`), no hace falta
reconstruirlo. **Nota de entorno heredada** (de `HANDOFF.md`,
`ideacion`): `load` es liviano (solo `psycopg`/`pgvector`/`voyageai`), no
requiere el Dockerfile completo con MinerU/torch — pero `parse` sí
necesita el entorno con MinerU real para trocear el PDF, y ese paso no se
evadió la vez pasada porque no hizo falta (los 3 libros ya estaban
parseados). Para las fuentes nuevas, `parse` es un paso real a ejecutar,
no solo `load` — confirmar que el entorno de MinerU (contenedor o
intérprete Python correcto) esté disponible antes de arrancar, no
asumirlo.

## Punto 3 — Re-etiquetado del corpus existente (1.126 chunks)

Mismo método que `ideacion`: candidatos identificados por título de
capítulo (`capitulo` real de los `.jsonl`, no adivinado), con la misma
salvedad ya documentada entonces — es una heurística razonable, no una
revisión exhaustiva por chunk. Etiquetado **aditivo** (`especialista_tags`
gana un tag, no lo reemplaza), mismo criterio que garantiza cero regresión
por construcción para `mvp`/`ideacion`.

### Candidatos para `pmf` — `customer-development.jsonl`

| Capítulo | Chunks | Por qué |
|---|---|---|
| "Introducción a la validación de clientes" | 65 | Fase 2 de Customer Development (Blank) — literalmente "Customer Validation", el antecedente directo de PMF |
| "Validación de clientes, fase 2:" | 22 | Idem, continuación |
| "Validación de clientes, fase 3: Desarrollar el posicionamiento de la empresa y del producto" | 222 | Idem, fase de validación con clientes reales — núcleo de "encaje producto-mercado" |

Total candidato, alta confianza por título: **309 chunks**.

**Candidatos de confianza media, no incluidos de entrada — requieren
revisión de contenido, no solo título** (misma salvedad que `ideacion`
dejó explícita para casos así):

- "Los programas de retención se mantienen vivos o mueren en función de..."
  (87 chunks) — trata seguimiento/retención de clientes, señal de PMF
  (curvas de retención) pero también podría leerse como contenido de
  `escalado` (motor de crecimiento) según el enfoque real del texto.
- "Descubrimiento de clientes, fase 4: Comprobar el modelo de negocio y
  pivotar o continuar" (18 chunks) — decisión de pivotar/perseverar,
  podría ser `pmf` (evaluar si hay encaje) o quedar fuera (es un momento de
  decisión, no necesariamente contenido metodológico de una fase).

No se decide su destino en este documento — quedan para revisión de
contenido real al momento de re-etiquetar, mismo criterio que "ajustar
sobre la marcha" ya usado en `ideacion`.

### Candidatos para `operaciones` — `guia-canvas.jsonl`

| Capítulo | Chunks | Por qué |
|---|---|---|
| "SESIÓN 4 ¿CÓMO CONSEGUIR INGRESOS?" | 3 | Flujos de ingresos (BMC) |
| "MÓDULOS DE CONTENIDO SESIÓN 4" | 21 | Idem, contenido extendido |
| "SESIÓN 5 PERO ¿VA A COSTAR MUCHO DINERO?" | 13 | Estructura de costos (BMC) |
| "MÓDULOS DE CONTENIDO SESIÓN 5" | 26 | Idem |

Total candidato: **63 chunks**. Confianza **media**: estos módulos tratan
Revenue Streams/Cost Structure del Canvas — son "cómo funciona
operativamente el negocio por dentro" en un sentido amplio, pero también
podrían leerse como parte natural de `ideacion` (que ya cubre BMC
explícitamente en la taxonomía nueva). **Tensión real a resolver antes de
etiquetar, no asumida**: si `ideacion` cubre "Business Model Canvas"
completo (los 9 bloques), estas sesiones 4/5 ya deberían estar cubiertas
por los tags `["mvp", "ideacion"]` que `guia-canvas.jsonl` ya tiene en su
mayoría (ver distribución real abajo) — sumarles también `operaciones`
sería una decisión de solapamiento deliberado, no automática. Se marca
como pregunta a resolver al implementar, con evidencia de contenido, no
por título solo.

### Sin candidatos identificados para `escalado` (más allá de 7 Powers) ni `plataformas`

Revisado el resto de capítulos de los tres `.jsonl` (incluida la lista
completa de `customer-development.jsonl` y `lean_startup.jsonl` — la
"Prepararse para vender: Adquisición/activación de clientes Web/móvil", 77
chunks, es la más cercana a `escalado` por tema de adquisición/crecimiento,
pero es contenido de Customer Creation (Fase 3 de Blank), más específico
de canales de adquisición temprana que de "motor de crecimiento" en el
sentido de Ries/7 Powers — confianza baja, no se propone como candidato
sin revisión de contenido). **`plataformas` no tiene ningún candidato real
en el corpus actual** — depende enteramente de la fuente nueva dedicada,
esperado dado que ninguno de los 3 libros actuales trata modelos de
negocio de plataforma.

`lean_startup.jsonl` (142 chunks en "Comentarios sobre El método Lean
Startup", genérico/transversal) sigue fuera de alcance sin revisión de
contenido — mismo criterio ya aplicado en `ideacion`.

### Verificación (mismo método que `ideacion`)

- `SELECT count(*), especialista_tags FROM rag_chunks GROUP BY
  especialista_tags` antes/después — confirmar conteo exacto de chunks
  re-etiquetados, cero chunks perdidos (sigue en 1.126 + los que sume la
  ingesta nueva).
- `searchRagChunks(embedding, "pmf")` / `"operaciones"` / etc. con una
  consulta real, temáticamente verificable — antes del re-etiquetado
  devuelve `[]` siempre (mismo argumento que `ideacion`: `@>` es
  containment duro, no un sesgo de relevancia).
- `searchRagChunks(embedding, "mvp")` y `"ideacion"` con las consultas ya
  usadas antes — confirmar **cero regresión** (garantizado por
  construcción al ser aditivo, pero se reconfirma con una corrida real,
  mismo estándar que la vez pasada).

## Punto 4 — Orden de construcción propuesto

**Criterio explícito**: (a) disponibilidad de fuente ya cargada frente a
fuente nueva por ingerir — construir primero lo que no bloquea con una
ingesta pendiente; (b) claridad de frontera con especialistas ya
construidos — construir primero los que tienen un límite más nítido reduce
el riesgo de mal-enrutamiento temprano contaminando la medición de los
siguientes; (c) eficiencia de ingesta — agrupar especialistas que comparten
una misma fuente nueva (7 Powers) para no re-parsear el mismo PDF dos
veces.

1. **`pmf`** — primero. Su fuente principal (`customer-development.jsonl`,
   fases de validación de clientes) ya está cargada y re-etiquetable hoy
   mismo, sin esperar ninguna ingesta nueva (JTBD se suma después, no
   bloquea el arranque). Frontera con `ideacion` es relativamente clara
   (antes de tener clientes reales vs. después, validando repetibilidad) y
   con `mvp` también (construir el producto vs. validar que el mercado lo
   quiere).
2. **`escalado`** — segundo. Ya tiene ancla parcial en el TBox
   (`EngineOfGrowth`, existente desde antes de este documento) y su fuente
   nueva (7 Powers, capítulos Counter-Positioning/Cornered Resource) se
   ingiere en el mismo parseo que `operaciones` (ver siguiente punto) —
   construirlo primero entre los dos aprovecha la ingesta ya hecha sin
   esperar.
3. **`operaciones`** — tercero, justo después de `escalado` porque
   **comparte la misma fuente 7 Powers** (Process Power) — un solo
   parse+re-etiquetado de ese PDF cubre ambos, no tiene sentido separarlos
   por una ingesta que ya ocurrió. La otra fuente de `operaciones`
   (artículos IA-first) es independiente y más liviana (varios PDFs cortos
   en vez de un libro), se suma cuando esté lista.
4. **`plataformas`** — último. Depende enteramente de una fuente nueva y
   dedicada, sin ningún candidato en el corpus existente ni superposición
   con ninguna ingesta ya planeada — es el que más tiempo de preparación
   externa necesita (esperar la fuente del usuario) antes de poder
   arrancar el ciclo.

Cada uno de los 4 sigue el ciclo completo ya probado con `ideacion`:

```
1. Diseño breve (mini-documento, mismo criterio que este archivo pero
   acotado a un especialista — puede ser más corto porque el patrón ya
   está confirmado a nivel de sistema, no hay que re-justificar la
   arquitectura general).
2. Ingesta/etiquetado de la fuente correspondiente (Puntos 2/3).
3. Implementación: src/specialist/<rol>.ts + las entradas de enrutamiento
   del Punto 1 que le correspondan (agregar su rama en specialist.ts,
   sumarlo a ESPECIALISTAS_IMPLEMENTADOS).
4. Verificación real contra producción (Punto 6) antes de pasar al
   siguiente.
```

No se implementan los 4 de una vez ni en paralelo — un especialista a la
vez, verificado end-to-end, mismo ritmo que ya funcionó para `ideacion`.

## Punto 5 — Prompt del orquestador: fronteras explícitas

### Reescritura propuesta de la línea de roles en `orchestrator.ts` (`SYSTEM_PROMPT`)

Reemplaza la línea única actual por una lista con frontera de una frase
cada una, versionada en el prompt (no implícita) — mismo criterio ya usado
para el criterio de selección de contexto histórico en
`hermes-startup-next` ("texto explícito y versionado... el criterio no
debe quedar implícito"):

> especialista_requerido debe ser el rol que mejor atiende la acción
> elegida, según estas fronteras:
> - **ideacion**: el problema, el cliente o el segmento todavía no están
>   validados, o la tarea es diseñar/ajustar el modelo de negocio (Business
>   Model Canvas) en su forma inicial — antes de construir nada.
> - **mvp**: construir y probar una primera versión real del producto
>   (prototipado, experimentos, métricas), incluyendo decisiones de diseño
>   sobre economías de escala del producto en sí — no todavía escalar el
>   negocio.
> - **pmf**: ya existe un producto y clientes reales; la tarea es validar
>   o mejorar el encaje producto-mercado (desarrollo de clientes en fase de
>   validación, Jobs To Be Done) — no construir el producto por primera vez
>   (eso es mvp) ni escalar (eso es escalado).
> - **operaciones**: cómo se organiza y ejecuta el trabajo interno una vez
>   el negocio funciona (procesos, estructura, adopción de IA en la
>   operación) — no la estrategia de crecimiento externo (escalado) ni la
>   validación de mercado (pmf).
> - **escalado**: crecer de forma defendible una vez hay encaje
>   producto-mercado (motor de crecimiento, contraposicionamiento, recursos
>   protegidos) — no la operación interna del día a día (operaciones).
> - **plataformas**: el negocio en sí es una plataforma (dos o más lados de
>   mercado, efectos de red, problema del huevo y la gallina). Es
>   transversal: si la tarea trata específicamente la dinámica de
>   plataforma (precios multi-lado, arranque de red), elegí plataformas
>   aunque la startup también esté en fase de ideación o escalado; si no,
>   clasificá por fase como de costumbre aunque el negocio sea una
>   plataforma.

**Punto de decisión abierto, no resuelto acá**: la entrada
`modelo_negocio: "BusinessModelCanvas"` de `ESPECIALISTA_A_CONCEPTO`
(`orchestratorModoBase.ts`) queda huérfana porque el rol `modelo_negocio`
desaparece. Dado que la taxonomía nueva asigna explícitamente "Business
Model Canvas" a `ideacion`, la opción con más sentido es reasignar el
ancla: `ideacion: "BusinessModelCanvas"`. **No se decide unilateralmente
acá** porque cambia comportamiento observable (tareas de `ideacion` en
modo base empezarían a traer `PREREQUISITO_GENERICO` del TBox, cosa que
hoy nunca pasa — ver Punto 2 de `diseno_especialista_ideacion.md`, que
decidió explícitamente no anclar `ideacion` a nada por falta de evidencia
en ese momento). Se pregunta al confirmar este documento. El resto del
mapa queda: `mvp: "MVP"` (sin cambios), `escalado: "EngineOfGrowth"` (sin
cambios, ya existía sin especialista implementado). `pmf`, `operaciones`,
`plataformas` quedan sin ancla (mismo criterio que `ideacion` en su
momento: no modelar concepto nuevo en el TBox sin evidencia real de que
haga falta — `getPrerequisitosParaEspecialista()` ya degrada con gracia a
`[]` para cualquier rol sin entrada en el mapa).

### Comentario de `ESPECIALISTA_A_CONCEPTO` a reescribir

El comentario actual ("Solo 3 de los 7 roles tienen ancla en el TBox hoy")
pasa a reflejar 6 roles totales, 2 o 3 con ancla según se resuelva el punto
de decisión de arriba.

## Punto 6 — Verificación

### Regresión de los 2 existentes (obligatoria, no opcional)

El cambio al `SYSTEM_PROMPT` del orquestador es **compartido** por los 6
roles — cualquier corrida, incluidas las de `mvp`/`ideacion`, pasa por el
prompt nuevo. Antes de dar por cerrado cualquier especialista nuevo:

- Reinvocar el caso real de Cafelibro (`ideacion`, mismo `startup_id` y
  tarea ya usados en la verificación de `diseno_especialista_ideacion.md`)
  contra producción — confirmar `especialista_usado: "ideacion"` sin
  cambios de comportamiento.
- Un caso real o realista de `mvp` (texto libre pidiendo explícitamente
  construir/probar un prototipo) — confirmar `especialista_usado: "mvp"`.

Se repite esta regresión **después de cada cambio al prompt compartido**,
no solo una vez al final — si el prompt se ajusta de nuevo tras ver
resultados del primer especialista nuevo (`pmf`), se re-verifica antes de
seguir con `escalado`.

### Por especialista nuevo — mínimo un caso real o realista contra producción

Para cada uno de los 4 (`pmf`, `escalado`, `operaciones`, `plataformas`),
al momento de implementarlo (Punto 4):

- Un texto libre diseñado para caer inequívocamente en ese rol (ej. para
  `pmf`: "Ya tenemos 50 clientes usando el producto, necesitamos saber si
  esto realmente engancha antes de invertir en crecimiento").
- Confirmar `especialista_usado` correcto en `GET /runs/:id`.
- Confirmar `informe_final.recomendaciones[].fuentes` con citas legibles
  que vengan del corpus recién re-etiquetado/ingerido para ese rol (mismo
  chequeo que `ideacion` hizo con Customer Development) — sin esto, el
  re-etiquetado del Punto 3 no está realmente verificado, solo contado en
  la base.

### Casos de frontera (recomendado, no bloqueante)

Al menos un caso deliberadamente ambiguo entre dos roles vecinos (ej. una
tarea que podría leerse como `mvp` o `pmf` según énfasis) para confirmar
que el lenguaje de frontera del Punto 5 efectivamente discrimina, no solo
que existe en el prompt. No bloquea el cierre de cada especialista si no
da tiempo — pero vale la pena si aparece ambigüedad real durante las
pruebas normales.

### Limpieza

Mismo protocolo que todas las sesiones anteriores del proyecto: cualquier
run de prueba se borra al cierre (`@neondatabase/serverless`, leyendo
`.env.local` directo, confirmado por conteo antes/después), runs reales de
fundadores nunca se tocan.

## Fuera de alcance de este documento

- Actualizar `startup-next-ui/lib/types.ts` (repo distinto, seguimiento
  anotado en Punto 1, no implementado acá).
- Modelar conceptos nuevos en el TBox de `ontology-engine` para `pmf`,
  `operaciones` o `plataformas` — mismo criterio que `ideacion`: sin
  evidencia real de que haga falta, no se especula estructura nueva.
- Cambios del lado de `hermes-startup-next` — ya interpreta
  `especialista_usado`/`sin_especialista` genéricamente, no necesita saber
  qué roles existen.
- El re-etiquetado por contenido real (no solo título) de los candidatos
  de confianza media señalados en el Punto 3.
- Decidir el destino de los capítulos de 7 Powers no nombrados en la
  taxonomía (Network Economies, Switching Costs, Branding) — pregunta
  abierta para el usuario, no una decisión de diseño.

## Confirmación pedida

Quedan dos preguntas explícitas para el usuario antes de implementar (no
asumidas en este documento):

1. **`ESPECIALISTA_A_CONCEPTO["ideacion"]`**: ¿se reasigna el ancla
   `BusinessModelCanvas` (huérfana tras eliminar `modelo_negocio`) a
   `ideacion`, dado que la taxonomía nueva le asigna BMC explícitamente? Si
   sí, `ideacion` en modo base empezaría a traer `PREREQUISITO_GENERICO`
   del TBox, cosa que hoy nunca hace.
2. **Capítulos de 7 Powers no nombrados en la taxonomía** (Network
   Economies, Switching Costs, Branding): ¿quedan sin etiquetar, o se
   asignan a algún especialista? Sin instrucción explícita, la propuesta
   por defecto es dejarlos sin etiquetar (no entran al corpus de ningún
   especialista) hasta que haya una decisión.

Con esas dos respuestas, quedan resueltos con evidencia real los 6 puntos
pedidos. No se escribe código de `src/specialist/{pmf,operaciones,escalado,plataformas}.ts`
ni se toca `schemas.ts`/`orchestrator.ts`/`orchestratorModoBase.ts`/
`specialist.ts` ni se re-etiqueta o ingiere ningún corpus hasta que este
documento se confirme explícitamente.

## Confirmado — decisiones del usuario

Documento confirmado con las dos preguntas abiertas resueltas y un ajuste
al Punto 3:

1. **Capítulos restantes de 7 Powers**: efectos de red (Network Economies)
   → `plataformas`; costes de cambio (Switching Costs) → `escalado`; marca
   (Branding) → `escalado`. Con esto, ningún capítulo del libro queda
   huérfano — mapeo completo de los 7 capítulos: Scale Economies → `mvp`;
   Network Economies → `plataformas`; Counter-Positioning, Switching Costs,
   Branding, Cornered Resource → `escalado`; Process Power → `operaciones`.
2. **Ancla `BusinessModelCanvas`**: reasignada a `ideacion`. Era el ancla
   del antiguo `modelo_negocio`, ya fuera de la taxonomía; `ideacion` cubre
   BMC explícitamente en la taxonomía nueva. `ESPECIALISTA_A_CONCEPTO` final:
   `ideacion: "BusinessModelCanvas"`, `mvp: "MVP"`, `escalado:
   "EngineOfGrowth"` — `pmf`/`operaciones`/`plataformas` sin ancla.
3. **Ajuste al re-etiquetado (Punto 3)**: los 309 chunks de alta confianza
   para `pmf` se etiquetan según lo propuesto. Los 63 de confianza media
   candidatos a `operaciones` (sesiones 4/5 de `guia-canvas.jsonl`,
   ingresos/costos) **no se etiquetan por ahora** — la tensión con el BMC
   de `ideacion` es real, y `operaciones` va a tener fuentes propias
   mejores (7 Powers Process Power + artículos IA-first). Preferencia
   explícita: corpus pequeño y limpio por sobre chunks prestados que
   compiten con otro rol. Si la verificación de `operaciones` muestra que
   recupera poco, se re-etiqueta después con evidencia real de esa
   verificación, no a priori.

**Orden de implementación confirmado**: `pmf` → `escalado` → `operaciones`
→ `plataformas`, un especialista a la vez, con `ESPECIALISTAS_IMPLEMENTADOS`
compartido (Punto 1) para evitar la clase de bug del hardcode ya conocida.
`pmf` arranca ya (única fuente principal ya en el corpus); los otros tres
esperan a que el usuario aporte las rutas de sus PDFs respectivos, pedidas
en el momento de cada uno, no antes.
