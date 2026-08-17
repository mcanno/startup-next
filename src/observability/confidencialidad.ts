// Cortafuegos de confidencialidad (diseno_observabilidad_evaluacion.md, §4):
// el contenido de calidad -- situacion de entrada, la respuesta completa del
// especialista y fuente_texto de las recomendaciones -- solo viaja a
// Langfuse Cloud en casos de prueba (es_prueba=true, datos inventados, sin
// riesgo). En casos reales esos campos son sensibles (la entrada habla de la
// startup concreta del fundador; fuente_texto es texto íntegro de los libros
// del corpus, por copyright) y NO se envían a la nube: la evaluación de
// calidad de casos reales corre en local (Fase 2 del diseño, §5 -- todavía
// no construida, no hay flujo real que evaluar).
//
// Esta función es el único lugar donde vive esa regla: tanto el script de
// prueba (scripts/langfuse-trace-run.ts) como la futura instrumentación de
// producción la consultan, en vez de reconstruirla cada uno por su lado. Hoy
// es un gate binario (todo o nada) porque Fase 2 -- que enviaría un veredicto
// resumido de casos reales -- no existe aún; el día que se construya, esta
// función es el punto a extender, no a duplicar.
export function contenidoDeCalidadPermitido(esPrueba: boolean): boolean {
  return esPrueba;
}
