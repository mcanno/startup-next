# Contexto: startup-advisor — estado actual y siguiente fase (Startup-Next)

> Documento de traspaso. Generado al cierre de la sesión que construyó Fase 1
> (ontología en producción) y Fase 2 (entrevista/informe guiados por la
> ontología). Pégalo al inicio de un hilo nuevo para continuar con el diseño
> del módulo Startup-Next con contexto limpio.

## Qué es el producto

`startup-advisor`: app que entrevista a un fundador de startup (chat con
Claude), genera un informe de situación inicial, y ahora incorpora una
ontología Lean Startup (basada en Osterwalder, Blank, Ries) para fundamentar
ese informe con reglas metodológicas explícitas, no solo la intuición del LLM.

## Arquitectura actual (todo en producción y verificado)

**`startup-advisor`** (Next.js, repo en `github.com/mcanno/startup-advisor`,
rama `master`)
- Desplegado en Vercel, plan **Pro** (se subió desde Hobby en esta sesión —
  el plan Hobby tiene techo duro de 60s en `maxDuration`, insuficiente para
  el flujo de razonamiento post-entrevista).
- **Despliegue es MANUAL**: no hay integración Git↔Vercel conectada. Cada
  cambio requiere `vercel --prod` explícito después de mergear a `master`.
  Esto causó un incidente real en esta sesión (código con fix de bug nunca
  desplegado) — no lo olvides en la siguiente fase.
- Postgres en Neon. ORM: Drizzle.
- Tablas clave: `startups` (id, userId, name, createdAt), `interviews`
  (id, userId, **startupId uuid NOT NULL** FK→startups, title, status,
  timestamps), `messages`, `reports` (content jsonb tipado `ReportContent`,
  incluye campo opcional `consideraciones_metodologicas:
  MethodologicalFinding[]` con `{rule_id, hallazgos}`).
- Un usuario puede tener varias startups; el dashboard obliga a elegir/crear
  una startup antes de arrancar una entrevista nueva.
- Flujo: `src/app/api/interview/[id]/chat/route.ts` recibe cada mensaje,
  streaming con Claude. Cuando el modelo invoca la tool `produce_report`
  (definida en `src/lib/anthropic.ts`), se dispara
  `runOntologyReasoning()` (en `src/lib/ontologyReasoning.ts`) ANTES de
  guardar el informe — ver detalle abajo.
- `src/lib/ontologyEngine.ts`: cliente HTTP hacia el ontology-engine, usa
  `process.env.ONTOLOGY_ENGINE_URL`. **Debe estar seteada en Vercel para
  los 3 entornos (production, preview) o falla en silencio** (el `try/catch`
  del flujo lo traga sin romper el informe, pero sin registrar nada).

**`ontology-engine`** (Python/FastAPI, subcarpeta `ontology-engine/` del
mismo repo, servicio independiente)
- Desplegado en **Fly.io**: `https://ontology-engine.fly.dev`
- `fly.toml`: `min_machines_running = 1` (evita cold starts en llamadas
  síncronas), health check en `/health`.
- TBox: 43 conceptos / 21 relaciones de la ontología Lean Startup
  (`domain_ontology.py`, única fuente de verdad, espejo exacto del notebook
  de diseño original). Persistido en Postgres (mismo Neon, tablas
  `ontology_concepts`, `ontology_relations`).
- ABox: `startup_individuals`, `startup_facts` — hechos por startup, con FK
  real hacia `startups.id`.
- Endpoints relevantes: `GET /concepts/{id}`, `GET /concepts/{id}/subclasses`,
  `GET /startups/{id}/graph`, `GET /startups/{id}/validate`,
  `POST /startups/{id}/individuals`, `POST /startups/{id}/facts`.
- Motor de reglas (`rules.py`), 4 reglas activas: `R1_hipotesis_sin_experimento`,
  `R2_pivote_sin_aprendizaje`, `R3_metrica_de_vanidad`,
  `R4_startup_sin_fundador`.

## Qué hace `runOntologyReasoning` (Fase 2, ya en producción)

Al cerrar una entrevista: asegura individuos `Startup`/`Founder`, hace una
llamada adicional (no streaming) a Claude con tools dinámicas
(`record_hypothesis`, `record_experiment`, `record_mvp`, `record_metric` —
los subtipos de `Hypothesis`/`Metric` se consultan en vivo al ontology-engine,
no están hardcodeados) para extraer instancias mencionadas en la
conversación, las registra en el ontology-engine, corre `validate()`, y
añade los hallazgos al informe como `consideraciones_metodologicas`. Todo
envuelto en try/catch — si el ontology-engine falla, el informe se genera
igual, sin ese campo. **No** registra relaciones entre instancias todavía
(qué experimento testea qué hipótesis) — eso quedó explícitamente pendiente
para una iteración futura.

## Verificado en producción real (con evidencia, no solo código revisado)

- `Startup`, `Founder`, `ProblemHypothesis`/`ValueHypothesis`/`GrowthHypothesis`
  (con subtipo correcto), `Experiment`, `MVP` — todos confirmados registrándose
  correctamente vía `GET /startups/{id}/graph` tras una entrevista real.
- **`Metric` confirmado.** Prueba dirigida (entrevista mencionando
  explícitamente "40% completó el registro usando comandos de voz")
  verificada vía `GET /startups/{id}/graph`: se registraron correctamente
  una `ActionableMetric` (el 40%) y, de forma espontánea, también una
  `VanityMetric` (un conteo total de registrados) — confirma que el
  modelo distingue bien entre ambos subtipos sin que se le haya pedido
  explícitamente clasificar la segunda.
- Vista de transcripción de solo lectura (`/interview/[id]/transcript`)
  añadida y enlazada desde la página de informe — **confirmada en
  navegador, funcionando correctamente.**

### Fase 2: CERRADA POR COMPLETO

Las 4 tools de extracción (`record_hypothesis`, `record_experiment`,
`record_mvp`, `record_metric`) están verificadas funcionando de punta a
punta en producción real, con datos de entrevistas reales, no solo por
revisión de código. No queda ningún pendiente abierto de Fase 1 ni Fase 2.

## Decisiones de diseño ya tomadas para Startup-Next (nuevo módulo)

- **Servicio independiente**, no un módulo dentro de `startup-advisor` —
  mismo patrón que `ontology-engine` (Python o lo que convenga, desplegado
  aparte, ej. Fly.io).
- **Invocación explícita/autónoma por el fundador** — no se dispara
  automáticamente al cerrar una entrevista. El fundador pide "qué hago
  ahora" cuando quiere.
- **Debe ser invocable desde dos clientes distintos**: la app Next.js, y un
  asistente agéntico privado/local tipo Hermes. Esto implica:
  - El estado de los ciclos (máximo 3) debe vivir del lado de
    `Startup-Next`, no en quien lo invoca — ambos clientes comparten el
    mismo histórico.
  - Necesita autenticación por invocador (API key o similar) desde el
    diseño inicial, no añadida después.
- **Arquitectura interna**: agente orquestador → clasifica y enruta a un
  agente especialista (ideación / MVP / financiación / modelo de negocio /
  escalado / organización / administración) → el especialista consulta un
  RAG compilado (textos de los 3 libros + otros que se añadan) → devuelve
  informe → agente validador (calidad + verificación de fuentes, debe
  reusar `validate()` del ontology-engine para la coherencia metodológica,
  no reimplementar reglas) → si aprueba, informe final; si no, vuelve al
  orquestador, máximo 3 ciclos.
- **Probablemente asíncrono**, no síncrono dentro de una request de Vercel:
  cada ciclo implica ≥2 llamadas a LLM + RAG + ontology-engine: puede ser
  lento. Mejor un servicio persistente que devuelva un `run_id` y se
  consulte el resultado después (o webhook), en vez de repetir el problema
  de latencia que ya tuvimos en Fase 2.
- Entra un **comentario opcional del asesor** junto al informe de situación
  como input — formato aún sin decidir (texto libre es el punto de partida
  razonable).

## Preguntas abiertas para la siguiente sesión

1. Contrato exacto de entrada/salida de `Startup-Next` (payload JSON).
2. Esquema de las tablas nuevas (algo como `next_action_runs`: startup_id,
   cycle, informe_situacion_ref, comentario_asesor, resultado, status).
3. Mecanismo de autenticación para llamadas externas (Hermes vs. app).
4. Dónde y cómo se construye el RAG compilado (qué textos además de los
   3 libros base, qué motor: embeddings reales esta vez, no TF-IDF).
5. Formato definitivo del comentario del asesor.
6. Confirmar si Startup-Next comparte la misma Postgres (Neon) o tiene su
   propio almacenamiento.

## Nota de cierre de esta sesión

Fase 1 y Fase 2 quedan cerradas con evidencia verificada en producción
real (no solo revisión de código) en cada pieza: esquema, seed, motor de
reglas, despliegue del ontology-engine, las 4 tools de extracción, y la
vista de transcripción. El único trabajo pendiente al abrir el hilo nuevo
es el diseño de `Startup-Next` — ninguna deuda técnica arrastrada de las
fases anteriores.
