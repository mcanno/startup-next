// Única fuente de verdad de qué roles de especialista tienen implementación
// real hoy — ver diseno_expansion_especialistas.md, Punto 1. Evita repetir
// la lista de roles implementados en más de un lugar (orchestrator.ts para
// especialista_disponible, specialist.ts para el dispatch): esa duplicación
// ya causó un bug real una vez (validator.ts hardcodeaba "mvp" mientras
// orchestrator.ts/specialist.ts ya reconocían "ideacion", ver
// diseno_especialista_ideacion.md, punto 5.4).
//
// Roles del enum sin entrada acá (hoy: operaciones, plataformas) caen a
// sin_especialista con gracia, igual que ya hacía cualquier rol no
// implementado antes de esta refactorización.

import type { EspecialistaRole } from "../schemas.js";

export const ESPECIALISTAS_IMPLEMENTADOS: ReadonlySet<EspecialistaRole> = new Set([
  "ideacion",
  "mvp",
  "pmf",
]);
