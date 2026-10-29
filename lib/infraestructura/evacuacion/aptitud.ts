// "Posible centro de evacuados": escuela con riesgo actual bajo Y exposición
// histórica a inundación baja o nula (sitio y ruta de acceso). No es lo mismo que
// el estado reportado `centro_evacuados` de los partes: esto es una sugerencia
// calculada, nunca una confirmación. Todo dato ausente cuenta como NO apta.

export interface RiesgoVigente {
  evidenciaValida: boolean
  nivelRiesgo: string | null
}

export interface EntradaAptitud {
  tieneCoordenadas: boolean
  riesgo: RiesgoVigente | null
  claseRio: string | null
  juntoLaguna: boolean | null
  claseRuta: string | null
}

export type MotivoNoApta =
  | 'sin_coordenadas'
  | 'sin_dato_riesgo'
  | 'riesgo_no_bajo'
  | 'exposicion_sitio'
  | 'junto_laguna'
  | 'exposicion_ruta'

export interface ResultadoAptitud {
  apta: boolean
  motivo: MotivoNoApta | null
}

const EXPOSICION_ACEPTABLE: ReadonlySet<string> = new Set(['bajo', 'sin_riesgo'])

export function evaluarAptitud(entrada: EntradaAptitud): ResultadoAptitud {
  const no = (motivo: MotivoNoApta): ResultadoAptitud => ({ apta: false, motivo })
  if (!entrada.tieneCoordenadas) return no('sin_coordenadas')
  if (!entrada.riesgo || !entrada.riesgo.evidenciaValida || entrada.riesgo.nivelRiesgo === null) return no('sin_dato_riesgo')
  if (entrada.riesgo.nivelRiesgo !== 'bajo') return no('riesgo_no_bajo')
  if (entrada.claseRio === null || !EXPOSICION_ACEPTABLE.has(entrada.claseRio)) return no('exposicion_sitio')
  if (entrada.juntoLaguna === true) return no('junto_laguna')
  if (entrada.claseRuta === null || !EXPOSICION_ACEPTABLE.has(entrada.claseRuta)) return no('exposicion_ruta')
  return { apta: true, motivo: null }
}
