// Prevención de duplicados (spec §9, §14, §18.14). Esta función SÓLO informa
// si hay una coincidencia; nunca decide ni bloquea. "La coincidencia
// funciona como recomendación. La decisión final corresponde al director."
// (§18.14) — la UI (batches 5/6) es quien decide qué hacer con este
// resultado, incluyendo dejar continuar al director sin cambiar nada.
//
// La categoría del candidato debe llegar ya resuelta por el servidor (ver
// resolverCategoria en validacion.ts): esta función nunca la infiere del
// motivo, preservando el invariante "la categoría la resuelve el servidor,
// el cliente nunca la manda" (CONTRACT.md).
import type { Categoria } from './trayectoria-tipos'

export interface MotivoCandidato {
  motivo: string
  categoria: Categoria
}

export interface DeteccionDuplicado<T extends MotivoCandidato> {
  hayCoincidencia: boolean
  // Afectación vigente con el mismo nombre de motivo exacto, si existe.
  coincidenciaExacta: T | null
  // Afectaciones vigentes de la misma categoría pero con un motivo distinto
  // (spec §14: "la categoría o el motivo coincide").
  coincidenciasPorCategoria: T[]
}

export function detectarMotivoDuplicado<T extends MotivoCandidato>(
  afectacionesVigentes: T[],
  candidato: MotivoCandidato,
): DeteccionDuplicado<T> {
  const coincidenciaExacta =
    afectacionesVigentes.find((a) => a.motivo === candidato.motivo) ?? null

  const coincidenciasPorCategoria = afectacionesVigentes.filter(
    (a) => a.categoria === candidato.categoria && a.motivo !== candidato.motivo,
  )

  return {
    hayCoincidencia: coincidenciaExacta !== null || coincidenciasPorCategoria.length > 0,
    coincidenciaExacta,
    coincidenciasPorCategoria,
  }
}
