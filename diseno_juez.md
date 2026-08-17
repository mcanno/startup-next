# Diseño: el juez (LLM-as-judge) de startup-next

> Diseño de la implementación del juez de evaluación. Complementa
> diseno_observabilidad_evaluacion.md (§8, visión general del juez) y
> rubrica_juez.md (el criterio contra el que evalúa). Este documento fija CÓMO se
> construye el juez. Fuente de verdad del diseño, por delante del historial de chat.

---

## 1. Qué es y qué no es

El juez es la pieza de EVALUACIÓN que puntúa la calidad de las respuestas del
sistema para nuestro análisis. **No** es el validador (que decide en producción,
en tiempo real, si una respuesta se aprueba para el fundador). El juez no afecta lo
que el fundador recibe; nos dice a nosotros cómo de bueno es el sistema.

El veredicto del juez es una SEÑAL para el criterio humano, no una verdad. El
LLM-as-judge es conocimiento emergente, con sesgos conocidos (posición, verborrea,
autoafirmación). Se usa junto al juicio humano, no en su lugar. Por eso la
validación del juez (§7) es condición previa a fiarse de él a escala.

---

## 2. Arquitectura: desacoplado

El juez es un proceso INDEPENDIENTE de la ejecución del sistema. No evalúa dentro
del flujo de startup-next; evalúa DESPUÉS, leyendo trazas ya capturadas.

Flujo: **lee** trazas de Langfuse → **evalúa** con la rúbrica → **escribe** los
veredictos de vuelta a Langfuse como scores.

Ventajas del desacoplamiento:
- Re-evaluar sin re-ejecutar el sistema (cambiar rúbrica o modelo juez y re-juzgar
  las trazas ya capturadas).
- Evaluar en lote (capturar N casos, juzgarlos todos después).
- Cambiar el juez sin tocar startup-next.
- Encaja con pass^k: se corren k trazas por caso (no deterministas) y el juez las
  evalúa todas después.

Probable forma: un script (p. ej. scripts/langfuse-judge.ts), hermano del de
captura, que se ejecuta cuando se quiere evaluar lo capturado.

---

## 3. Entrada: qué recibe el juez por cada traza

- **situacion** (la consulta).
- **respuesta** completa (recomendaciones con su detalle).
- **fuentes** de cada recomendación, con su **fuente_texto** (texto íntegro del
  chunk — necesario para evaluar fidelidad).
- **rúbrica aplicable**: el TRONCO COMÚN + la FICHA del especialista que se activó
  (no las siete fichas — solo la que corresponde).
- las **dimensiones que tocan** según el tipo de especialista:
    - RAG (ideacion/mvp/pmf): tronco 1-4 + 5a (adecuación a fase).
    - OKF (escalado/plataformas/operaciones/gobernanza): tronco 1-4 + 5b
      (adecuación al desafío) + 6 (honestidad epistémica).

El prompt se arma dinámicamente: según el especialista activado (que viene en la
traza), se incluye su ficha y el conjunto de dimensiones que le aplican.

Todos estos datos ya se capturan hoy (verificado en el dashboard): la instrumen-
tación de calidad cuelga situacion, respuesta y fuentes con fuente_texto en los
spans, para casos de prueba.

---

## 4. Razonamiento y salida

- **Cadena de pensamiento primero**: el juez razona por dimensión (qué observa,
  contrastando respuesta / fuentes / ficha) ANTES de puntuar. El razonamiento hace
  el veredicto explicable, no solo una nota.
- **Veredicto por dimensión**: PASS / PASS_PARCIAL / FAIL + justificación de una
  frase, para cada dimensión aplicable.
- **Sin nota global**: no se promedia. Una respuesta puede ser PASS en fidelidad y
  FAIL en enrutamiento; mezclarlas oculta información. Se reporta la lista de
  dimensiones.
- **Una sola llamada** para todas las dimensiones (decisión de arranque). Si al
  validar se ve que alguna dimensión —probablemente fidelidad— se evalúa flojo por
  repartir atención, se separa en su propia llamada ENTONCES, con señal real. No
  optimizar antes de tener el juez andando.

---

## 5. El modelo del juez

Configurable e independiente, con el patrón de config perezosa del repo (leer
process.env en el cuerpo de la función, no en const de módulo):

    JUDGE_MODEL     (arranque: un modelo de Gemini)
    JUDGE_PROVIDER  = google
    JUDGE_API_KEY   (en .env.local, fuera de git)

**Por qué Gemini de arranque**: el sistema genera con Sonnet (Claude). Un juez de
OTRA familia (Gemini) da la máxima independencia frente al sesgo de autoafirmación
(un modelo tiende a puntuar mejor sus propias salidas). Gemini ya está integrado en
getChatModel() (soporte Google existente), así que no añade proveedor nuevo.

**Configurable**: JUDGE_MODEL permite cambiarlo sin tocar código (probar otro
modelo, comparar jueces, ajustar por coste). No hay compromiso permanente con
Gemini; es el punto de partida.

A verificar en implementación (no asumir de memoria): el nombre del modelo Gemini
vigente y que getChatModel() lo soporta. Los nombres de modelos cambian.

---

## 6. De dónde lee y dónde escribe; qué está pendiente

- **Lee** de Langfuse (para casos de PRUEBA; la traza ya está allí). Vía API.
- **Escribe** el veredicto como SCORES de Langfuse (uno por dimensión, con su
  justificación). Langfuse tiene scores nativos pensados para esto.
- **Coherencia con el cortafuegos** (diseno_observabilidad_evaluacion.md §4): esto
  es la ruta de PRUEBAS (todo en Langfuse). Para casos REALES (fase 2), el juez
  correría en LOCAL sobre datos locales, y a Langfuse solo subiría el veredicto
  resumido — nunca la situacion cruda ni el fuente_texto. La ruta de casos reales
  NO se construye ahora.

**Pendiente de fontanería (resolver en implementación):** cómo sabe el juez qué
trazas evaluar (distinguir "pendiente" de "ya evaluada"). Opciones: un tag/score en
Langfuse que marque las evaluadas, o evaluar por lote/rango temporal. Sencillo, se
decide al implementar.

---

## 7. Validación del juez (condición previa a fiarse a escala)

Antes de usar el juez de forma masiva, confirmar que CONCUERDA con el criterio
humano. Sin esta validación, el juez es un generador de veredictos no calibrado.

Material de validación ya disponible:
- Casos ya corridos y evaluados mentalmente por el humano (ideacion-001; el caso
  de frontera ideacion/mvp).
- El **par de calibración natural** para la honestidad epistémica (dim. 6):
  operaciones (debe marcar Emerging) vs. escalado/gobernanza/plataformas (no deben
  marcar). Contraste ya verificado en producción — se sabe cuál es la respuesta
  correcta.

Procedimiento: el humano evalúa un conjunto semilla; el juez evalúa los mismos; se
comparan. Si concuerdan (sobre todo en el par de calibración y en la fidelidad), se
confía en el juez para el volumen. Si no, se ajusta el prompt/rúbrica y se repite.
El juez complementa el criterio humano; esta validación es lo que justifica
apoyarse en él.

---

## 8. Resumen operativo

- Juez DESACOPLADO: script que lee trazas de Langfuse, evalúa, escribe scores.
- Entrada: situacion + respuesta + fuentes con fuente_texto + (tronco + ficha del
  especialista activado) + dimensiones según tipo (RAG: 1-4,5a / OKF: 1-4,5b,6).
- Salida: cadena de pensamiento + veredicto por dimensión (PASS/PARCIAL/FAIL +
  justificación), sin nota global, en una llamada.
- Modelo: Gemini de arranque, configurable (JUDGE_MODEL), independiente del
  generador (Sonnet) para evitar autoafirmación.
- Escribe scores en Langfuse (ruta de pruebas). Casos reales (local) = fase 2.
- Validación contra criterio humano (par de calibración) ANTES de fiarse a escala.
