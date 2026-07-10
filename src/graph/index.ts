import { END, START, StateGraph } from "@langchain/langgraph";
import { getCheckpointer } from "./checkpointer.js";
import { orchestratorNode } from "./nodes/orchestrator.js";
import { specialistNode } from "./nodes/specialist.js";
import { validatorNode } from "./nodes/validator.js";
import { StartupNextState, type StartupNextStateType } from "./state.js";

let compiled: ReturnType<typeof buildGraph> | undefined;

function buildGraph() {
  return new StateGraph(StartupNextState)
    .addNode("orchestrator", orchestratorNode)
    .addNode("specialist", specialistNode)
    .addNode("validator", validatorNode)
    .addEdge(START, "orchestrator")
    // "running" es el único estado desde el que tiene sentido seguir al
    // especialista — cualquier otro (sin_especialista, peticion_incoherente,
    // y lo que se agregue después) es terminal y no dejó accionNext resuelto
    // del todo. Chequear la lista negativa (=== "running") en vez de cada
    // status terminal por nombre evita el bug real que esto reemplaza: un
    // nuevo status terminal (peticion_incoherente) caía por default a
    // "specialist" y explotaba porque nunca se seteó accionNext.
    .addConditionalEdges("orchestrator", (state: StartupNextStateType) =>
      state.status === "running" ? "specialist" : END,
    )
    .addEdge("specialist", "validator")
    .addConditionalEdges("validator", (state: StartupNextStateType) => {
      if (state.status === "approved") return END;
      if (state.cycle >= state.maxCycles) return END;
      return "orchestrator";
    })
    .compile({ checkpointer: getCheckpointer() });
}

// Lazy: getCheckpointer() lee DATABASE_URL perezosamente, así que compilar
// el grafo en el primer uso (no al importar el módulo) respeta la misma
// convención que db/index.ts y evita el bug de orden de evaluación ESM.
export function getGraph() {
  if (!compiled) {
    compiled = buildGraph();
  }
  return compiled;
}
