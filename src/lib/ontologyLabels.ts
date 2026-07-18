// Traducción de concept_id/relacion del TBox a español legible para el
// fundador (diseno_startup_next.md sección 8, modo base). Copia manual de
// los labels ya definidos en startup-advisor/ontology-engine/domain_ontology.py
// (fuente de verdad del TBox) — sin dependencia de red nueva a propósito,
// el mapeo es contenido estático que casi no cambia. Si el TBox crece con
// un concept_id o relacion no listado acá, se degrada al id crudo (misma
// filosofía de degradación elegante que el resto del sistema) en vez de
// romper.

const CONCEPT_LABELS: Record<string, string> = {
  Startup: "Startup",
  Founder: "Fundador/Emprendedor",
  BusinessModelCanvas: "Business Model Canvas",
  CustomerSegment: "Segmento de clientes",
  ValueProposition: "Propuesta de valor",
  Channel: "Canal",
  CustomerRelationship: "Relación con clientes",
  RevenueStream: "Flujo de ingresos",
  KeyResource: "Recursos clave",
  KeyActivity: "Actividades clave",
  KeyPartnership: "Socios clave",
  CostStructure: "Estructura de costos",
  CustomerDiscovery: "Descubrimiento de clientes",
  CustomerValidation: "Validación de clientes",
  CustomerCreation: "Creación de clientes",
  CompanyBuilding: "Construcción de la empresa",
  Hypothesis: "Hipótesis",
  ProblemHypothesis: "Hipótesis de problema",
  ValueHypothesis: "Hipótesis de valor",
  GrowthHypothesis: "Hipótesis de crecimiento",
  EarlyEvangelist: "Cliente evangelista temprano",
  GetOutOfTheBuilding: "Salir del edificio",
  MVP: "Producto Mínimo Viable",
  Experiment: "Experimento",
  BuildMeasureLearnLoop: "Ciclo Construir-Medir-Aprender",
  Metric: "Métrica",
  ActionableMetric: "Métrica accionable",
  VanityMetric: "Métrica de vanidad",
  ValidatedLearning: "Aprendizaje validado",
  InnovationAccounting: "Contabilidad de la innovación",
  Pivot: "Pivote",
  Persevere: "Perseverar",
  EngineOfGrowth: "Motor de crecimiento",
  ZoomInPivot: "Pivote de acercamiento (una función se convierte en todo el producto)",
  ZoomOutPivot: "Pivote de alejamiento (todo el producto pasa a ser una función)",
  CustomerSegmentPivot: "Pivote de segmento de cliente",
  CustomerNeedPivot: "Pivote de necesidad del cliente",
  PlatformPivot: "Pivote de plataforma (de app a plataforma o viceversa)",
  BusinessArchitecturePivot: "Pivote de arquitectura de negocio (alto margen/bajo volumen vs. viceversa)",
  ValueCapturePivot: "Pivote de captura de valor (modelo de monetización)",
  EngineOfGrowthPivot: "Pivote de motor de crecimiento",
  ChannelPivot: "Pivote de canal",
  TechnologyPivot: "Pivote de tecnología",
};

const RELATION_LABELS: Record<string, string> = {
  tiene_fundador: "tiene fundador",
  define_canvas: "define",
  compuesto_por: "compuesto por",
  formula_hipotesis: "formula",
  relaciona_con_bloque: "se relaciona con",
  se_testea_con: "se testea con",
  produce: "produce",
  se_mide_con: "se mide con",
  genera_aprendizaje: "genera",
  informa_decision_pivot: "informa decisión de pivotar",
  informa_decision_perseverar: "informa decisión de perseverar",
  modifica_bloque: "modifica",
  atraviesa_fase: "atraviesa",
  precede_a: "precede a",
  precede_a_2: "precede a",
  precede_a_3: "precede a",
  ejecuta_ciclo: "ejecuta",
  identifica_evangelista: "identifica",
  aplica_principio: "aplica",
  usa_motor: "usa",
  cuantifica_con: "cuantifica con",
};

export function conceptLabel(conceptId: string): string {
  return CONCEPT_LABELS[conceptId] ?? conceptId;
}

export function relationLabel(relacion: string): string {
  return RELATION_LABELS[relacion] ?? relacion;
}
