# Cabos sueltos — rúbrica y sistema

> Pendientes anotados para que no se pierdan entre sesiones. No bloquean la
> rúbrica actual, pero deben resolverse en su momento.

---

## JTBD (Jobs To Be Done) — incorporar al sistema, RAG u OKF

**Estado (verificado contra el código, no de memoria):** JTBD NO existe en
startup-next hoy. No hay chunks RAG (el corpus tiene solo Customer Development,
Guía Canvas y Lean Startup), no hay concepto OKF (`okf/` tiene solo 7-powers,
platform-scale, startup-nativa-ia, gobernanza), y la única mención está en la
frontera de enrutamiento del orquestador (orchestrator.ts:31), que anuncia "Jobs
To Be Done" como algo que espera de una tarea de pmf — pero el especialista pmf
solo tiene Customer Development para respaldar sus recomendaciones.

**El material fuente SÍ existe:** el usuario tiene los ficheros OKF relacionados
con JTBD en TRABAJO/fuentes/ — listos para incorporar, pero NO incorporados al
sistema.

**La decisión pendiente (metodológica, importante):** ¿incorporar JTBD como RAG
o como OKF?
- **Como RAG** — JTBD entra como texto troceado, fuente adicional del corpus de
  pmf. pmf sigue siendo un especialista RAG puro. Más simple.
- **Como OKF** — JTBD se destila en conceptos estructurados (candidato natural:
  es un marco bastante estructurable — trabajo a realizar, resultados deseados,
  circunstancias, entrevista de switch...). CONSECUENCIA IMPORTANTE: pmf pasaría
  a ser el PRIMER ESPECIALISTA MIXTO (RAG + OKF), y ganaría la dimensión de
  honestidad epistémica (Verified/Emerging) para su parte OKF — cuando hoy, como
  RAG puro, no la tiene. Esto toca la arquitectura, no solo el contenido.

**Es trabajo de SISTEMA, no de rúbrica** — del tamaño de "añadir un especialista"
(verificar fuentes, decidir RAG/OKF, importar, marcar Verified/Emerging si OKF,
verificar recuperación). Merece su propia sesión.

**Impacto en la rúbrica cuando se resuelva:** hay que ACTUALIZAR la ficha de pmf
(solo esa — la estructura tronco+fichas lo permite):
- Hoy la ficha dice: fuente = Customer Development; NO esperar cita JTBD; si pmf
  cita JTBD, sospechar alucinación (fidelidad FAIL), porque no hay material que
  lo respalde.
- Cuando JTBD entre: quitar la alerta de alucinación y añadir JTBD como fuente
  legítima. Si entra como OKF, añadir a pmf la dimensión de honestidad epistémica
  (dim. 6) para su parte OKF.

**Trasladar esta nota al repo de startup-next** (donde viven los pendientes de
sistema) cuando se toque el repo — aquí está por conveniencia inmediata, pero su
sitio natural es junto al código.
