export type CapasVisibles = {
  estacionesRio: boolean
  eventosReportados: boolean
  lluviaObservada: boolean
  limitesDepartamentos: boolean
  nombresDepartamentos: boolean
  rutaAcceso: boolean
  crucesAgua: boolean
  escuelasAisladas: boolean
  /** Engine "Riesgo actual" (moderado or higher) outside Radar, where it is always drawn. */
  escuelasEnRiesgo: boolean
}

export const CAPAS_VISIBLES_DEFAULT: CapasVisibles = {
  estacionesRio: true,
  eventosReportados: true,
  lluviaObservada: true,
  limitesDepartamentos: true,
  nombresDepartamentos: true,
  rutaAcceso: true,
  crucesAgua: true,
  escuelasAisladas: false,
  escuelasEnRiesgo: false,
}

export function visibilidadCapa(visible: boolean): 'visible' | 'none' {
  return visible ? 'visible' : 'none'
}

// v2: observed rain became a default layer; preferences saved under the previous key
// stored it as off for every earlier visitor, so they are discarded.
export const CLAVE_CAPAS_VISIBLES = 'mapa-infraestructura:capas-visibles:v2'

type Almacen = Pick<Storage, 'getItem' | 'setItem'>

// Per-viewer convenience: a missing, blocked or malformed entry falls back to the defaults.
export function leerCapasGuardadas(almacen: Almacen | null | undefined): CapasVisibles {
  try {
    const crudo = almacen?.getItem(CLAVE_CAPAS_VISIBLES)
    if (!crudo) return CAPAS_VISIBLES_DEFAULT
    const guardado: unknown = JSON.parse(crudo)
    if (!guardado || typeof guardado !== 'object') return CAPAS_VISIBLES_DEFAULT
    const capas = { ...CAPAS_VISIBLES_DEFAULT }
    for (const clave of Object.keys(capas) as Array<keyof CapasVisibles>) {
      const valor = (guardado as Record<string, unknown>)[clave]
      if (typeof valor === 'boolean') capas[clave] = valor
    }
    return capas
  } catch {
    return CAPAS_VISIBLES_DEFAULT
  }
}

export function guardarCapas(almacen: Almacen | null | undefined, capas: CapasVisibles): void {
  try {
    almacen?.setItem(CLAVE_CAPAS_VISIBLES, JSON.stringify(capas))
  } catch {
    // Storage blocked or full: visibility simply resets on the next visit.
  }
}
