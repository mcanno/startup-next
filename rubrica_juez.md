# Rúbrica del juez (LLM-as-judge) — startup-next

> Criterio de calidad contra el que el juez evalúa las respuestas del sistema.
> Emparejado con diseno_observabilidad_evaluacion.md (que define CÓMO se evalúa;
> esta rúbrica define CONTRA QUÉ). Estructura: un TRONCO COMÚN (4 dimensiones,
> todos los especialistas) + 7 FICHAS de especialista (lo específico de cada uno).
> Al evaluar un caso, el juez usa: tronco común + la ficha del especialista que se
> activó.
>
> Dimensiones por tipo de especialista:
>   - RAG (ideacion, mvp, pmf):    tronco (1-4) + 5a Adecuación a FASE.
>   - OKF (escalado, plataformas,
>          operaciones, gobernanza): tronco (1-4) + 5b Adecuación al DESAFÍO
>                                     + 6 Honestidad epistémica.


> Las cuatro dimensiones que se evalúan en TODOS los especialistas. Se combinan
> con la ficha del especialista concreto (que aporta su frontera, fuentes y
> anti-patrones). El juez evalúa cada dimensión de forma independiente y razona
> antes de puntuar (cadena de pensamiento), para que el veredicto sea explicable
> y no solo una nota.

Entradas que recibe el juez para evaluar un caso:
- La **situación** (la consulta del fundador).
- El **especialista activado** y su ficha (frontera, fuentes, anti-patrones).
- La **respuesta** completa (las recomendaciones con su detalle).
- Las **fuentes** de cada recomendación, con su **texto íntegro** (fuente_texto).

---

## Dimensión 1 — Enrutamiento (graduada: PASS / PASS_PARCIAL / FAIL)

**Qué evalúa:** si la consulta se atendió desde el especialista adecuado a lo que
el fundador necesita — y, cuando no, si la respuesta protegió igualmente al
fundador.

No es una comprobación binaria de "¿fue al especialista esperado?". Lo que importa
es si el fundador recibió el consejo correcto para su situación, venga del
especialista que venga. El enrutamiento es un medio; el fin es servir bien al
fundador.

**Graduación:**
- **PASS** — la consulta se atendió desde el especialista cuya frontera le
  corresponde (según la ficha), y la respuesta es coherente con esa frontera.
- **PASS_PARCIAL** — se atendió desde un especialista distinto al esperado, PERO
  la respuesta sigue protegiendo al fundador: reconoce los límites, no da por
  buena una premisa falsa, y no lo empuja en una dirección equivocada. (Ejemplo
  típico: un caso de frontera fase-temprana que va a `mvp` en vez de `ideacion`,
  pero cuestiona que la validación sea suficiente antes de construir.)
- **FAIL** — se atendió desde el especialista equivocado Y la respuesta perjudica
  al fundador: da por buena una premisa que debería cuestionar, lo empuja a una
  acción prematura o inadecuada, o responde a un problema distinto del que tiene.

**Banderas rojas:** dar por validado algo que no lo está; recomendar una acción de
una fase/desafío que no corresponde; responder con seguridad desde un área que no
es la de la consulta.

---

## Dimensión 2 — Corrección metodológica (PASS / PASS_PARCIAL / FAIL)

**Qué evalúa:** si la recomendación es sólida según el marco metodológico del
especialista (el de su ficha), no solo si "suena razonable".

Una respuesta puede ser fluida y plausible y aun así ser metodológicamente
incorrecta —recomendar el paso equivocado del método, saltarse una etapa,
malinterpretar un concepto—. El juez evalúa contra el método real de la fuente,
no contra el sentido común general.

**Graduación:**
- **PASS** — la recomendación aplica correctamente el marco del especialista: el
  consejo es el que la metodología prescribiría para esa situación.
- **PASS_PARCIAL** — la dirección es correcta pero hay imprecisiones: aplica el
  marco de forma incompleta, mezcla etapas, o el consejo es válido pero
  subóptimo para el caso.
- **FAIL** — la recomendación contradice el método, aplica mal un concepto, o
  aconseja algo que la metodología desaconsejaría.

**Banderas rojas:** invertir el orden de un proceso metodológico (p. ej. construir
antes de validar); confundir conceptos del marco; dar consejo genérico de
"coaching" en vez de aplicar la metodología específica.

---

## Dimensión 3 — Detección de riesgos y anti-patrones (PASS / PASS_PARCIAL / FAIL)

**Qué evalúa:** si la respuesta identifica los riesgos y anti-patrones relevantes
presentes en la situación del fundador (los de la ficha del especialista).

No basta con dar buen consejo; un buen colega **avisa de las trampas**. Si la
situación del fundador contiene una señal de riesgo conocido (un anti-patrón de
esa área), la respuesta debería detectarlo y advertirlo.

**Graduación:**
- **PASS** — detecta y advierte los anti-patrones relevantes presentes en la
  situación, y lo hace de forma útil (explica por qué es un riesgo).
- **PASS_PARCIAL** — detecta algún riesgo pero pasa por alto otro relevante, o lo
  menciona sin explicar por qué importa.
- **FAIL** — no detecta un anti-patrón claramente presente en la situación, o peor,
  refuerza el comportamiento de riesgo (da por bueno lo que debería cuestionar).

**Banderas rojas:** ignorar una señal de riesgo evidente; validar una premisa
peligrosa del fundador; no advertir de una trampa conocida del área cuando la
situación la contiene.

---

## Dimensión 4 — Fidelidad a la fuente (PASS / PASS_PARCIAL / FAIL)

**Qué evalúa:** si lo que afirma cada recomendación está realmente respaldado por
el texto de la fuente que cita (el fuente_texto), o si el modelo añadió contenido
de su cosecha presentándolo con la misma autoridad que la cita.

Esta es la dimensión central del proyecto: la propuesta de valor es no colar
conjeturas como hechos validados. El juez contrasta cada afirmación de la
recomendación contra el texto íntegro del chunk citado.

**Graduación:**
- **PASS** — lo que afirma la recomendación está respaldado por el texto de la
  fuente citada. Parafrasea o aplica fielmente el contenido del chunk, sin añadir
  afirmaciones no respaldadas presentadas como si vinieran de la fuente.
- **PASS_PARCIAL** — el grueso es fiel, pero hay algún detalle o matiz que va más
  allá de lo que dice la fuente (una extrapolación razonable pero no explícita en
  el texto citado).
- **FAIL** — la recomendación afirma algo que NO está en la fuente citada y lo
  presenta con autoridad de cita (alucinación con apariencia de fundamento), o
  cita una fuente que no respalda lo que se dice.

**Nota para especialistas OKF:** además de la fidelidad al texto, verificar que no
haya **fuga de concepto** — que el especialista no cite un concepto que pertenece
a otro especialista (p. ej. escalado citando "economías de escala", que es de mvp).
La fuga es un fallo de fidelidad estructural.

**Banderas rojas:** introducir marcos, escalas o taxonomías con apariencia de cita
que no están en el fuente_texto; atribuir a la fuente una conclusión que no
contiene; citar un chunk cuyo contenido no tiene relación con la afirmación.

---

## Cómo emite el juez su veredicto

Para cada dimensión aplicable:
1. **Razona primero** (breve): qué observa en la respuesta respecto a esa dimensión,
   contrastando con la situación / las fuentes / la ficha.
2. **Puntúa**: PASS / PASS_PARCIAL / FAIL.
3. **Justifica en una frase** por qué esa puntuación.

El juez NO emite una nota global agregada por defecto (una respuesta puede ser
PASS en fidelidad y FAIL en enrutamiento — mezclarlas oculta información). Cada
dimensión se reporta por separado. Si se necesita un resumen, es la lista de
dimensiones, no un promedio.



> Cada ficha aporta lo ESPECÍFICO del especialista. Se combina con el tronco común
> (dimensiones 1-4). La dimensión específica de estos tres es la 5a: Adecuación a
> fase. Los RAG NO llevan honestidad epistémica (dim. 6) — el mecanismo
> Verified/Emerging no existe en ellos.

Nota transversal para los tres (hallazgo del etiquetado aditivo): en fase temprana
"citó la fuente correcta" casi NO discrimina, porque el corpus está etiquetado de
forma acumulativa (todo chunk de ideacion/pmf lleva también el tag mvp). Por eso
la frontera real entre estos especialistas se evalúa por el CONTENIDO y la FASE de
la recomendación, no por el chunk_id citado. La dimensión de fidelidad (dim. 4)
sigue evaluándose sobre el fuente_texto; pero el enrutamiento y la adecuación a
fase se juzgan por lo que la recomendación DICE, no por de dónde la sacó.

---

## Ficha: ideacion

**Frontera (para dim. 1 — enrutamiento):**
El problema o el segmento de cliente aún NO están validados, o se está trabajando
el modelo de negocio inicial (BMC). El fundador todavía no ha confirmado con
evidencia real que el problema exista y duela. Es la fase de *descubrimiento*.

Se distingue de:
- **mvp** — mvp es cuando el problema YA está validado y toca construir. Si la
  validación aún es floja o inexistente, es ideacion, no mvp.
- **pmf** — pmf es cuando ya hay producto y clientes; ideacion es antes de eso.

**Fuentes reales (para dims. 2 y 4):**
- *Customer Development* (Steve Blank & Bob Dorf) — descubrimiento de clientes,
  "salir del edificio", validación de hipótesis de problema.
- *Guía / Business Model Canvas* (Alexander Osterwalder) — modelo de negocio
  inicial.

**Anti-patrones que debe cazar (para dim. 3):**
- **"Sé lo que quiere el cliente"** (el pecado capital de Blank): el fundador da
  por hecho que conoce el problema/solución sin haberlo validado. Anti-patrón de
  oro — verificado en producción, el sistema lo cita por su nombre.
- **Saltar a construir sin validar**: querer diseñar/programar el producto antes
  de confirmar que el problema es real.
- **Confundir interés con validación**: tomar el "me parece buena idea" de un
  interlocutor como evidencia de problema.

**Dimensión específica 5a — Adecuación a fase (criterio del early adopter):**
Una buena respuesta de ideacion distingue entre un **curioso** y un **early
adopter**, y no da por validado el problema si solo hay curiosos. El criterio (del
fundador): es early adopter quien (1) ha identificado el problema por sí mismo,
(2) ha gastado tiempo/esfuerzo intentando resolverlo, y (3) está dispuesto a
comprometer recursos en una solución. Reconocer el problema ("me suena", "estaría
bien") es solo curiosidad — no valida nada.

- **PASS** — la respuesta mantiene al fundador en descubrimiento cuando la
  validación es floja; busca early adopters reales (las tres señales), no se
  conforma con curiosos; recomienda validar el problema antes de avanzar.
- **PASS_PARCIAL** — orienta bien pero no distingue con nitidez curioso/early
  adopter, o acepta señales de validación débiles sin cuestionarlas del todo.
- **FAIL** — da por validado el problema con evidencia de mera curiosidad, o
  empuja a construir/avanzar cuando aún no hay early adopters reales.

---

## Ficha: mvp

**Frontera (para dim. 1 — enrutamiento):**
El problema YA está validado (hay early adopters reales, no solo curiosos) y toca
CONSTRUIR el producto — el mínimo producto viable que permita seguir aprendiendo.
Es la fase de *construcción para validar la solución*.

Se distingue de:
- **ideacion** — si el problema aún NO está validado, es ideacion. mvp presupone
  validación de problema hecha.
- **pmf** — pmf es validar el ENCAJE de un producto que ya existe con el mercado;
  mvp es construir ese primer producto. Si ya hay producto en manos de clientes y
  se mide el encaje, es pmf.

Nota: mvp es un SUPERCONJUNTO del corpus de fase temprana (puede citar todo el
material), y es el único con *Lean Startup* en exclusiva. Por eso, en fidelidad,
una cita de Lean Startup es señal fuerte de mvp; pero recuerda que el enrutamiento
se juzga por contenido/fase, no solo por la fuente.

**Fuentes reales (para dims. 2 y 4):**
- *El método Lean Startup* (Eric Ries) — MVP, ciclo construir-medir-aprender,
  aprendizaje validado, pivotar/perseverar. (Exclusiva de mvp.)
- Además, por el etiquetado aditivo, puede citar material de descubrimiento y
  validación (Customer Development, Canvas).

**Anti-patrones que debe cazar (para dim. 3):**
- **Construir de más / producto demasiado grande**: hacer un producto completo en
  vez de un mínimo viable; no aplicar el "mínimo".
- **Construir sin métrica de aprendizaje**: lanzar sin haber definido qué se
  quiere aprender ni cómo se medirá (vanity metrics vs. métricas accionables).
- **No cerrar el ciclo construir-medir-aprender**: construir sin plan de medir y
  decidir pivotar/perseverar.
- **Perseverar por inercia**: seguir con el plan pese a datos que sugieren pivotar.

**Dimensión específica 5a — Adecuación a fase:**
Una buena respuesta de mvp presupone que el problema está validado (si no lo
está, debería devolver al fundador a descubrimiento — y entonces el enrutamiento
sería cuestionable). Dado que la validación existe, ayuda a construir lo MÍNIMO
para seguir aprendiendo, con un ciclo de medición definido.

- **PASS** — orienta a construir un producto mínimo con un objetivo de aprendizaje
  claro y una métrica accionable; respeta el "mínimo"; contempla el ciclo
  construir-medir-aprender.
- **PASS_PARCIAL** — orienta a construir pero sin insistir en el "mínimo" o sin un
  plan claro de qué se aprende y cómo se mide.
- **FAIL** — recomienda construir un producto grande sin foco de aprendizaje, o
  da por validado el problema cuando la situación indica que no lo está (en cuyo
  caso también falla enrutamiento).

---

## Ficha: pmf (encaje producto-mercado)

**Frontera (para dim. 1 — enrutamiento):**
YA existe un producto y clientes reales usándolo; la tarea es validar o mejorar el
ENCAJE producto-mercado. Es la fase de *validación del encaje*, posterior a haber
construido el producto.

Se distingue de:
- **mvp** — mvp es construir el producto por primera vez; pmf es validar el encaje
  de un producto que ya existe y ya está en manos de clientes.
- **escalado** — escalado es crecer de forma defendible UNA VEZ hay encaje; pmf es
  todavía confirmar/mejorar ese encaje. Si aún no hay PMF, no toca escalar.

**Fuentes reales (para dims. 2 y 4):**
- *Customer Development* (Steve Blank & Bob Dorf) — fase de validación de clientes.
  Es la ÚNICA fuente real de pmf (comparte los 309 chunks de validación con mvp
  por el etiquetado aditivo).

**IMPORTANTE — JTBD no es fuente real (ver cabos_sueltos.md):**
La frontera del orquestador menciona "Jobs To Be Done" como algo esperado de una
tarea de pmf, PERO no hay material JTBD en el sistema (ni RAG ni OKF). Por tanto:
- **NO penalizar** a pmf por no citar JTBD ni usar su marco — no puede, no tiene
  el material. Exigirlo sería un falso negativo.
- **SÍ sospechar alucinación** (fidelidad FAIL) si pmf afirma algo "según Jobs To
  Be Done" o invoca conceptos JTBD (trabajo a realizar, resultados deseados,
  entrevista de switch...) como si fueran fuente: no hay ningún fuente_texto que
  pueda respaldarlo, así que estaría trayéndolo de su entrenamiento general y
  presentándolo con apariencia de fundamento. Es el caso clásico de cita
  fantasma. (Esta regla se retirará cuando JTBD se incorpore de verdad.)

**Anti-patrones que debe cazar (para dim. 3):**
- **Declarar PMF prematuramente**: creer que hay encaje sin evidencia sólida
  (retención, uso repetido, clientes que lo recomiendan), por entusiasmo o por
  señales débiles.
- **Confundir tracción vanidosa con encaje real**: tomar métricas de vanidad
  (registros, descargas, picos puntuales) como prueba de encaje, en vez de
  métricas de valor sostenido (retención, uso, disposición a pagar/recomendar).
- **No escuchar a los clientes que ya usan el producto**: buscar el encaje en
  abstracto en vez de en la evidencia de los usuarios reales actuales.
- **Escalar antes de confirmar el encaje**: meter gasolina (marketing, ventas,
  contratación) sobre un encaje aún no probado — el error de "escalar
  prematuramente".

**Dimensión específica 5a — Adecuación a fase:**
Una buena respuesta de pmf trabaja sobre la EVIDENCIA de encaje de clientes reales
existentes, no sobre hipótesis (eso era ideacion) ni sobre construir (eso era
mvp). Distingue encaje real (retención, valor sostenido) de señales engañosas
(vanidad), y no da por bueno el encaje sin evidencia sólida.

- **PASS** — orienta a validar el encaje con evidencia real de los clientes
  actuales (retención, uso sostenido, disposición a pagar/recomendar); no da por
  bueno el PMF sin esa evidencia; no empuja a escalar antes de confirmarlo.
- **PASS_PARCIAL** — orienta hacia la validación del encaje pero acepta señales
  débiles, o no distingue con nitidez tracción vanidosa de encaje real.
- **FAIL** — da por confirmado el PMF con evidencia de vanidad o insuficiente, o
  empuja a escalar sobre un encaje no probado.



> Cada ficha aporta lo específico del especialista OKF. Se combina con el tronco
> común (dims. 1-4). Los OKF tienen DOS dimensiones específicas:
>   - 5b. Adecuación al DESAFÍO (no a la fase — los OKF van por tipo de problema).
>   - 6.  Honestidad epistémica (EXCLUSIVA de OKF — el mecanismo Verified/Emerging).

---

## La dimensión 6 — Honestidad epistémica (común a los 4 OKF, redactada 1 vez)

**Qué evalúa:** si el especialista marca correctamente el grado de validación de
su conocimiento — si presenta lo Verified con autoridad normal y lo Emerging con
la cautela y el marcador explícito que le corresponde.

**Cómo funciona el mecanismo (para que el juez sepa qué buscar):**
Cada concepto OKF tiene un `status: Verified | Emerging` (decisión editorial al
importar la fuente). Al citarse, `buildSourceCitation` antepone
`[Conocimiento emergente, no validado]` a las citas Emerging, y NADA a las
Verified. Ese marcador llega intacto a lo que ve el fundador.

**El estado real por especialista (verificado):**
- **escalado, plataformas, gobernanza** → TODO Verified. Sus citas NO deben llevar
  marcador Emerging. Si una cita suya apareciera marcada Emerging, es un fallo.
- **operaciones** → TODO Emerging (categoría "startup nativa de IA", aún en
  formación — decisión editorial explícita: declararla Verified habría mentido
  sobre su validación). TODAS sus citas DEBEN llevar `[Conocimiento emergente, no
  validado]`, y su prompt instruye a presentar con más cautela. Si una cita de
  operaciones apareciera SIN marcador, es un fallo.

**Graduación:**
- **PASS** — el marcador epistémico de las citas coincide con el status real de la
  fuente: Verified sin marca, Emerging con marca. Y el tono es coherente
  (operaciones presenta su conocimiento con la cautela que corresponde a lo
  emergente; los demás con autoridad normal).
- **PASS_PARCIAL** — el marcador es correcto pero el tono no acompaña (p. ej.
  operaciones marca Emerging pero presenta el consejo con seguridad excesiva, como
  si fuera validado), o viceversa.
- **FAIL** — el marcador contradice el status real: una cita Emerging presentada
  sin marca (haciendo pasar lo emergente por validado — el fallo más grave, es la
  traición directa a la propuesta de valor), o una cita Verified marcada como
  emergente sin motivo.

**Par de calibración natural (para validar al propio juez):**
operaciones (debe marcar Emerging) vs. gobernanza/escalado/plataformas (no deben
marcar) es un caso de contraste ya verificado en producción. Un juez que evalúa
bien esta dimensión debe distinguir estos dos casos correctamente.

---

## Ficha: escalado

**Frontera (dim. 1):** crecer de forma DEFENDIBLE una vez hay encaje
producto-mercado — identificar y construir la barrera competitiva (el "poder")
adecuada al momento. Se distingue de operaciones (ejecución interna del día a día)
y de pmf (aún validando mercado, no defendiendo posición).

**Fuente real (dims. 2, 4):** *7 Poderes: Los Fundamentos de la Estrategia
Empresarial* (Hamilton Helmer). 6 conceptos son de escalado: contraposicionamiento,
costos de cambio, creación de marcas, definición de poder, progresión del poder,
recurso acorralado.

**Fuga de concepto a vigilar (dim. 4):** 3 conceptos de 7 Powers NO son de
escalado sino de mvp: **economías de escala, economías de red, poder del proceso**.
Si escalado cita alguno de estos tres, es fuga de concepto (fallo de fidelidad
estructural).

**Anti-patrones (dim. 3):**
- Buscar crecimiento sin barrera defendible (crecer sin "poder" que proteja la
  posición).
- Elegir un tipo de poder inadecuado al momento de la startup (progresión del
  poder: cada poder tiene su fase).
- Confundir tracción con defensibilidad (crecer rápido no es lo mismo que ser
  defendible).

**Dim. 5b — Adecuación al desafío:** una buena respuesta trabaja la
defensibilidad/poder adecuado al momento, presuponiendo que ya hay encaje. Si la
tarea es de operación interna o de validación de mercado, escalado no es el
especialista (enrutamiento cuestionable).

**Dim. 6 — Honestidad epistémica:** Verified. Sus citas NO deben llevar marcador
Emerging.

---

## Ficha: plataformas

**Frontera (dim. 1):** el negocio EN SÍ es una plataforma — dos o más lados de
mercado, efectos de red, problema del huevo y la gallina. Es TRANSVERSAL: aplica
aunque la startup esté en ideación o escalado, SI la tarea trata específicamente
la dinámica de plataforma (precios multi-lado, arranque de red). Si no trata la
dinámica de plataforma en sí, se clasifica por fase como de costumbre aunque el
negocio sea una plataforma.

Nota de enrutamiento: por ser transversal, el juez debe evaluar el enrutamiento
con cuidado. Que una consulta venga de una startup-plataforma NO significa que
deba ir a `plataformas`; solo si la tarea trata la dinámica de plataforma en sí.
Y al revés: una tarea de dinámica de plataforma SÍ va a plataformas aunque la
startup esté en fase temprana.

**Fuente real (dims. 2, 4):** *La Escalada de la Plataforma* (Sangeet Paul
Choudary). 10 conceptos, todos de plataformas: interacción central, pila de la
plataforma, motor Pull-Facilitate-Match, resolución huevo-gallina, lienzo de la
plataforma, marco TRIE, valor acumulativo, matriz tracción-fricción, efectos de
red inversos, escala plataforma vs. tubería.

**Anti-patrones (dim. 3):**
- Ignorar el problema del huevo y la gallina (lanzar una plataforma sin plan de
  arranque de los dos lados).
- Tratar la plataforma como un producto lineal (tubería) en vez de como
  plataforma multi-lado.
- No gestionar los efectos de red inversos (degradación de calidad al crecer:
  spam, ruido).

**Dim. 5b — Adecuación al desafío:** una buena respuesta trabaja la dinámica de
plataforma (multi-lado, efectos de red, arranque). Correcto incluso si la startup
está en fase temprana, siempre que la tarea sea de plataforma.

**Dim. 6 — Honestidad epistémica:** Verified. Sus citas NO deben llevar marcador
Emerging.

---

## Ficha: operaciones

**Frontera (dim. 1):** cómo se organiza y ejecuta el trabajo INTERNO una vez el
negocio funciona (procesos, estructura, adopción de IA en la operación). Se
distingue de escalado (crecimiento externo) y de pmf (validación de mercado).

**Fuente real (dims. 2, 4):** categoría emergente "startup nativa de IA" — NO un
único libro, sino 4 autores: Hyunjin Kim & Rembrand Koning, Andrew Odewahn, Iain
Roberts, Enrique Dans. 4 conceptos, todos de operaciones.

**Anti-patrones (dim. 3):**
- Digitalizar sin repensar (meter IA en procesos viejos sin rediseñarlos).
- Organización ilegible para la IA (procesos que ni las personas ni los agentes
  pueden entender/ejecutar — falta de "legibilidad organizacional").
- Delegar a agentes sin claridad de quién decide qué (automatizar el caos).

**Dim. 5b — Adecuación al desafío:** una buena respuesta trabaja la organización
interna del trabajo (procesos, estructura, adopción de IA operativa),
presuponiendo un negocio que ya funciona.

**Dim. 6 — Honestidad epistémica — EL CASO ESPECIAL:** Emerging. TODAS las citas
de operaciones DEBEN llevar `[Conocimiento emergente, no validado]`, y el consejo
debe presentarse con más cautela que el de los otros OKF (su propio prompt lo
instruye). Es el único OKF donde el marcador Emerging es lo CORRECTO. Un fallo
aquí es: presentar el conocimiento de operaciones SIN marca, como si fuera
validado — precisamente la deshonestidad epistémica que el proyecto combate.
Este especialista es la mitad "Emerging" del par de calibración.

---

## Ficha: gobernanza

**Frontera (dim. 1):** la estructura LEGAL/ESTATUTARIA de la empresa y cómo blindar
su misión frente a la extracción de valor cortoplacista (composición y deber
fiduciario del directorio, clases de acciones y derechos de voto, estructuras de
holding o fideicomiso, protección ante adquisiciones hostiles o presión de
inversores). Se distingue de ideacion (diseño del modelo de negocio en sí) y de
escalado (motor de crecimiento) — aunque la tarea surja en cualquier fase.

**Fuente real (dims. 2, 4):** *Incorruptible* (Eric Ries). 4 conceptos: gobernanza
constitucional, gravedad financiera, sociedad holding espiritual, y la síntesis de
longevidad institucional.

**Anti-patrones (dim. 3):**
- Ceder control estructural sin protección de la misión (aceptar términos de
  inversores que la exponen al cortoplacismo).
- Ignorar la "gravedad financiera" (la presión estructural hacia la extracción de
  valor si no se blinda).
- Diseñar la estructura legal sin pensar en la resiliencia a largo plazo
  (adquisiciones hostiles, cambios de control).

**Dim. 5b — Adecuación al desafío:** una buena respuesta trabaja la estructura
legal/estatutaria y el blindaje de la misión. Si la tarea es de modelo de negocio
o de crecimiento, gobernanza no es el especialista (enrutamiento cuestionable).

**Dim. 6 — Honestidad epistémica:** Verified (libro publicado con ISBN, no
categoría en formación). Sus citas NO deben llevar marcador Emerging. Es una de
las tres mitades "Verified" del par de calibración frente a operaciones.
