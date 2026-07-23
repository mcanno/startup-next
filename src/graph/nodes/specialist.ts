import { runIdeacionSpecialist } from "../../specialist/ideacion.js";
import { runMvpSpecialist } from "../../specialist/mvp.js";
import type { StartupNextStateType } from "../state.js";

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

  // Solo "mvp" e "ideacion" pueden llegar acá (orchestrator.ts solo marca
  // especialista_disponible=true para esos dos) — el resto cae a
  // sin_especialista antes de alcanzar este nodo.
  const { borrador, retrievedChunks } =
    state.accionNext.especialista_requerido === "ideacion"
      ? await runIdeacionSpecialist(state.accionNext, feedbackValidacion)
      : await runMvpSpecialist(state.accionNext, feedbackValidacion);

  return { borrador, retrievedChunks };
}
