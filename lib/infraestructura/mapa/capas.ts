export type CapasVisibles = {
  limitesDepartamentos: boolean
  nombresDepartamentos: boolean
  rutaAcceso: boolean
  crucesAgua: boolean
  escuelasAisladas: boolean
}

export const CAPAS_VISIBLES_DEFAULT: CapasVisibles = {
  limitesDepartamentos: true,
  nombresDepartamentos: true,
  rutaAcceso: true,
  crucesAgua: true,
  escuelasAisladas: false,
}

export function visibilidadCapa(visible: boolean): 'visible' | 'none' {
  return visible ? 'visible' : 'none'
}
