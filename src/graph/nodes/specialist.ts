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

  const { borrador, retrievedChunks } = await runMvpSpecialist(state.accionNext, feedbackValidacion);
  return { borrador, retrievedChunks };
}
