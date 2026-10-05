import type { DiffParte } from './movimiento-diff'
import { SEVERIDADES, type Severidad } from './validacion'

// Devuelve la gravedad más alta que aparece en los cambios del movimiento.
export function severidadDelMovimiento(resumen: DiffParte): Severidad | null {
  const datos = resumen as Partial<DiffParte>
  const candidatas = [
    ...(datos.afectacionesAgregadas ?? []).map((afectacion) => afectacion.severidad),
    ...(datos.severidadesCambiadas ?? []).map((cambio) => cambio.a),
  ]
  if (candidatas.length === 0) return null

  return candidatas.reduce((peor, severidad) =>
    SEVERIDADES.indexOf(severidad) > SEVERIDADES.indexOf(peor) ? severidad : peor,
  )
}
