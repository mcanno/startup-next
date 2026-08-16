# Diseño: observabilidad y evaluación de startup-next

> Documento de diseño. Fija el rumbo completo aunque la implementación llegue por
> fases. Lo que no está escrito aquí se pierde entre sesiones — este documento es
> la fuente de verdad del diseño, por delante del historial de cualquier chat.

---

## 1. Principio

Un sistema agéntico observa su propio funcionamiento desde el principio de su
existencia — no como añadido posterior. Pero esa observación respeta un límite de
confidencialidad: se observa **el centro** (lo que es nuestro y compartido:
startup-next, el servidor MCP), nunca **el borde** (los datos privados del
fundador). Lo sensible no sale a un tercero.

---

## 2. Las dos caras de la observabilidad

La observabilidad tiene dos actividades distintas, con necesidades de datos
opuestas. Confundirlas lleva a contradicciones; separarlas las resuelve.

**Salud del sistema** — ¿funciona bien, mecánicamente? Qué especialista se activa,
cuántos intentos, latencia, coste, tasa de fallos, volumen. **No necesita el
contenido** de la consulta ni de la respuesta: le bastan los metadatos. Es barata
(los datos ya existen en la ejecución).

**Calidad de las respuestas** — ¿aconseja bien? ¿La recomendación es adecuada,
metodológicamente correcta, fiel a sus fuentes? **Necesita la entrada Y la
respuesta completas**, porque evaluar es contrastar una contra otra. Es cara: cada
evaluación es una llamada extra a un LLM juez.

---

## 3. El reparto: qué va a dónde

Regla que resuelve la confidencialidad sin renunciar a observar todo:

| | Langfuse (nube, fase actual) | Local (nuestra infraestructura) |
|---|---|---|
| **Salud** — todos los casos (prueba y real) | ✓ metadatos de comportamiento | — |
| **Calidad — casos de prueba** | ✓ entrada + respuesta (inventadas, sin riesgo) | opcional |
| **Calidad — casos reales** | solo el veredicto resumido (un número) | ✓ evaluación completa (entrada + respuesta + fuentes) |

- La **salud** se observa siempre, para todos los casos, en Langfuse. Es el objetivo
  de "observabilidad sistémica de todo": ver cómo se comporta el sistema en
  producción, sin exponer nada confidencial.
- La **calidad de casos de prueba** (situaciones inventadas) se evalúa con toda su
  riqueza donde convenga — no hay nada que proteger.
- La **calidad de casos reales** se evalúa **en local**, donde la entrada del
  fundador ya vive y nunca sale de nuestro control. A la nube sube, como mucho, el
  veredicto resumido, no los textos que lo produjeron.

---

## 4. El cortafuegos de confidencialidad

Dos clases de dato **nunca** viajan a la nube de un tercero (Langfuse Cloud) en
casos reales:

1. **La entrada del fundador** (`situacion` real) — habla de su startup concreta;
   es privada.
2. **El texto íntegro de las fuentes** (`fuente_texto`, fragmentos literales de los
   libros del corpus) — por copyright.

En casos reales, a la nube van los **metadatos de comportamiento** (salud) y las
**referencias** (chunk_id, cita legible libro/capítulo/sección), nunca el contenido
sensible. La evaluación de calidad que necesita ese contenido se hace en local.

En casos de prueba, no hay cortafuegos: todo es inventado y puede ir a la nube.

Este cortafuegos es específico de la **fase Cloud**. Al autoalojar (ver §7),
desaparece la "nube de terceros" y la restricción se relaja.

---

## 5. Qué se construye ahora, qué después

**Fase 1 — ahora (lo que desbloquea la evaluación intensiva):**
- **Salud** de todos los casos, a Langfuse Cloud.
- **Calidad de casos de prueba**, a Langfuse Cloud — es donde hoy se calibra el
  sistema y la rúbrica.

**Fase 2 — cuando aparezca uso real (disparador explícito):**
- **Calidad de casos reales, en local.** No se construye hasta que haya consultas
  reales que evaluar — sería maquinaria para un flujo inexistente.
- Sub-decisión pendiente para entonces: ¿evaluar el 100% de casos reales o por
  **muestreo**? ¿**síncrono** (el fundador espera) o **asíncrono** (se responde ya y
  se juzga en background)? Debe ser asíncrono para no penalizar al fundador. Se
  decide con datos reales de volumen y coste, no ahora.

---

## 6. Esquema de captura (un registro de ejecución)

Campos marcados **[S] = sensible** (no va a la nube en casos reales).

```
IDENTIFICACIÓN
  run_id, caso_id, corrida_n (para pass^k), timestamp,
  es_prueba (bool), version_sistema (commit)

ENTRADA
  tipo_entrada (simple | informe | contexto_historico)
  situacion            [S en casos reales]
  especialista_esperado, criterios (rúbrica)   — solo en casos de prueba

EJECUCIÓN (salud — nunca sensible)
  especialista_usado, enrutamiento_correcto (bool),
  n_intentos, conceptos_recuperados (ids), latencia_ms,
  coste/tokens, status, fallo

SALIDA (material para el juicio de calidad)
  recomendaciones[]:
    · texto              [S en casos reales]
    · fuente_chunk_id
    · fuente_texto       [S siempre — copyright]
    · fuente_cita        (libro/capítulo/sección, legible — no sensible)
  marca_epistemica (Verified/Emerging — solo relevante en especialistas OKF)

EVALUACIÓN (la rellena el juez, no la captura)
  enrutamiento (graduado: PASS / PASS_PARCIAL / FAIL en fronteras),
  adecuacion_a_fase, correccion_metodologica, deteccion_riesgos,
  fidelidad_a_la_fuente, [honestidad_epistemica solo en OKF]
```

Notas de rúbrica ya decididas:
- **Enrutamiento graduado, no binario**: en casos de frontera, PASS si va al
  especialista esperado, PASS PARCIAL si va a otro pero la respuesta protege al
  fundador (p. ej. cuestiona una validación insuficiente), FAIL si va a otro y da
  por buena una premisa falsa. Lo que importa no es "¿acertó el especialista?" sino
  "¿el sistema sirvió bien al fundador?".
- **Fidelidad a la fuente, rutinaria**: se evalúa siempre (no puntual), por ser la
  propuesta de valor central del proyecto. Requiere `fuente_texto` para contrastar
  lo que afirma la recomendación contra lo que dice la fuente.
- **Honestidad epistémica (Verified/Emerging)**: solo evaluable en especialistas
  OKF, donde el marcador existe. En especialistas RAG no aplica (no hay mecanismo
  que pueda fallar), así que no se incluye como dimensión de sus casos.
- **Sistema no determinista**: el enrutamiento varía entre corridas idénticas. Cada
  caso se corre **k veces** (pass^k), de ahí `corrida_n`.

---

## 7. Infraestructura: Langfuse Cloud ahora, autoalojado después

**Ahora — Langfuse Cloud.** Permite empezar a evaluar ya, con la herramienta
definitiva (mismo SDK, mismo modelo de datos que el autoalojado), sin montar
infraestructura. Solo para datos que no exigen confidencialidad (pruebas + salud +
veredictos resumidos), según el cortafuegos de §4.

**Después — Langfuse autoalojado (Fly.io, Docker, como ontology-engine).**
Disparador de migración: **cuando se quiera capturar uso real** que exija
confidencialidad. Langfuse v3 self-hosted es un stack de varios servicios
(web, worker, Postgres, ClickHouse, Redis, almacenamiento) — un hito de
infraestructura propio, no trivial; por eso se pospone hasta que su necesidad sea
real. **Verificar la documentación de self-hosting vigente antes de montarlo**, no
asumir la forma de instalación.

**Deuda de la migración Cloud → autoalojado: baja.** Misma herramienta, mismo SDK,
mismo modelo de datos. La migración es reapuntar variables de entorno
(`LANGFUSE_HOST` y claves) y, opcionalmente, exportar datos históricos (que siendo
de prueba, quizá no haga falta conservar). No se reescribe código ni se reaprende
la herramienta.

---

## 8. El juez (LLM-as-judge)

**El juez es una pieza de evaluación, distinta del validador del sistema.** No
confundirlos:
- **Validador** — interno al grafo de producción; decide en tiempo real si una
  respuesta se aprueba o se reintenta, para el fundador. Afecta lo que el fundador
  recibe.
- **Juez** — externo al flujo; puntúa la calidad de las respuestas para *nuestro*
  análisis. No afecta lo que el fundador recibe; nos dice a nosotros cómo de bueno
  es el sistema.

**Modelo configurable e independiente.** El modelo del juez se fija por
configuración (`JUDGE_MODEL` / `JUDGE_PROVIDER` / `JUDGE_API_KEY`), con el mismo
patrón de lectura perezosa que orquestador/validador/especialista. Debe ser
**distinto del modelo que genera las respuestas evaluadas**, para mitigar el
**sesgo de autoafirmación** (un modelo tiende a puntuar mejor sus propias salidas).
Por defecto, un modelo independiente y al menos tan capaz como el especialista.

**Dónde corre.** Para casos de prueba, da igual (datos inventados). Para casos
reales, el juez corre **en local**, donde están los datos confidenciales — nunca
enviando la entrada del fundador a un servicio externo. Coherente con §3–§4.

**Sesgos conocidos a tener presentes** (conocimiento emergente sobre la técnica,
tratado con la misma honestidad epistémica que el resto): posición, verborrea,
autoafirmación. Mitigaciones habituales: rúbricas explícitas, aleatorización de
posición en comparaciones, cadena de pensamiento. El juez **complementa** el juicio
humano, no lo sustituye — su veredicto es una señal para nuestro criterio, no un
oráculo de calidad.

---

## 9. Resumen operativo

- Observabilidad = dos caras: **salud** (siempre, Langfuse) y **calidad** (pruebas
  en Langfuse; casos reales en local).
- **Nunca** a la nube en casos reales: la entrada del fundador y el texto íntegro de
  las fuentes.
- Se construye ya: salud + calidad de pruebas. Se pospone: calidad de casos reales
  (disparador: uso real).
- Langfuse Cloud ahora; autoalojado cuando haya uso real (deuda de migración baja).
- Juez: modelo configurable, independiente del generador, distinto del validador,
  en local para casos reales.