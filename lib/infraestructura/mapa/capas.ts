export type CapasVisibles = {
  estacionesRio: boolean
  eventosReportados: boolean
  lluviaObservada: boolean
  limitesDepartamentos: boolean
  nombresDepartamentos: boolean
  rutaAcceso: boolean
  crucesAgua: boolean
  escuelasAisladas: boolean
}

export const CAPAS_VISIBLES_DEFAULT: CapasVisibles = {
  estacionesRio: true,
  eventosReportados: true,
  lluviaObservada: false,
  limitesDepartamentos: true,
  nombresDepartamentos: true,
  rutaAcceso: true,
  crucesAgua: true,
  escuelasAisladas: false,
}

export function visibilidadCapa(visible: boolean): 'visible' | 'none' {
  return visible ? 'visible' : 'none'
}
