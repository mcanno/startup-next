import { runEscaladoSpecialist } from "../../specialist/escalado.js";
import { runIdeacionSpecialist } from "../../specialist/ideacion.js";
import { runMvpSpecialist } from "../../specialist/mvp.js";
import { runOperacionesSpecialist } from "../../specialist/operaciones.js";
import { runPlataformasSpecialist } from "../../specialist/plataformas.js";
import { runPmfSpecialist } from "../../specialist/pmf.js";
import type { AccionNext, Borrador, ValidacionCiclo } from "../../schemas.js";
import type { RetrievedChunk } from "../../db/ragQueries.js";
import type { RetrievedOkfConcept } from "../../okf/types.js";
import type { StartupNextStateType } from "../state.js";

// Solo los roles en ESPECIALISTAS_IMPLEMENTADOS (../especialistasImplementados.ts)
// pueden llegar acá — orchestrator.ts solo marca especialista_disponible=true
// para esos, el resto cae a sin_especialista antes de alcanzar este nodo. El
// default lanza en vez de asumir mvp: si algún día ese invariante se rompe,
// mejor un error explícito que enrutar en silencio al especialista
// equivocado.
//
// retrievedChunks/retrievedConcepts: un especialista RAG (ideacion/mvp/pmf)
// devuelve retrievedConcepts: [] explícito; uno OKF (escalado) devuelve
// retrievedChunks: [] explícito -- ver diseno_mecanismo_okf_grafo.md,
// Punto 6.2.
function dispatchSpecialist(
  accionNext: AccionNext,
  feedbackValidacion: ValidacionCiclo | undefined,
): Promise<{ borrador: Borrador; retrievedChunks: RetrievedChunk[]; retrievedConcepts: RetrievedOkfConcept[] }> {
  switch (accionNext.especialista_requerido) {
    case "ideacion":
      return runIdeacionSpecialist(accionNext, feedbackValidacion);
    case "pmf":
      return runPmfSpecialist(accionNext, feedbackValidacion);
    case "escalado":
      return runEscaladoSpecialist(accionNext, feedbackValidacion);
    case "plataformas":
      return runPlataformasSpecialist(accionNext, feedbackValidacion);
    case "operaciones":
      return runOperacionesSpecialist(accionNext, feedbackValidacion);
    case "mvp":
      return runMvpSpecialist(accionNext, feedbackValidacion);
    default:
      throw new Error(`specialistNode: especialista "${accionNext.especialista_requerido}" no implementado`);
  }
}

export async function specialistNode(
  state: StartupNextStateType,
): Promise<Partial<StartupNextStateType>> {
  if (!state.accionNext) {
    throw new Error("specialistNode invocado sin accion_next resuelta");
  }

  // Sección 7: cuando cycle > 0, el especialista recibe también la
  // validación del ciclo anterior para poder corregirse en vez de repetir
  // el mismo borrador rechazado.
  const feedbackValidacion = state.cycle > 0 ? state.ciclos[state.cycle - 1]?.validacion : undefined;

  const { borrador, retrievedChunks, retrievedConcepts } = await dispatchSpecialist(
    state.accionNext,
    feedbackValidacion,
  );

  return { borrador, retrievedChunks, retrievedConcepts };
}
