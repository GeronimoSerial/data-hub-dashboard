// "Posible centro de evacuados": escuela sin evidencia positiva de riesgo. Es NO
// apta sólo con riesgo actual moderado/alto/muy alto, exposición de sitio o de ruta
// media/alta, o sitio junto a laguna. El dato ausente (sin snapshot, sin evidencia
// válida, sin_dato, sin_ruta, sin fila) nunca descarta. No es lo mismo que el estado
// reportado `centro_evacuados` de los partes: es una sugerencia, no una confirmación.

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
  | 'riesgo_no_bajo'
  | 'exposicion_sitio'
  | 'junto_laguna'
  | 'exposicion_ruta'

export interface ResultadoAptitud {
  apta: boolean
  motivo: MotivoNoApta | null
  // Apta porque no hay ningún dato de riesgo, sitio ni ruta (no porque haya
  // evidencia de que es segura): la ficha lo aclara.
  sinAntecedentes: boolean
}

const NIVELES_RIESGO_POSITIVO: ReadonlySet<string> = new Set(['moderado', 'alto', 'muy_alto'])
const EXPOSICION_POSITIVA: ReadonlySet<string> = new Set(['medio', 'alto'])
const EXPOSICION_CON_DATO: ReadonlySet<string> = new Set(['bajo', 'medio', 'alto', 'sin_riesgo'])

export function evaluarAptitud(entrada: EntradaAptitud): ResultadoAptitud {
  const no = (motivo: MotivoNoApta): ResultadoAptitud => ({ apta: false, motivo, sinAntecedentes: false })
  if (!entrada.tieneCoordenadas) return no('sin_coordenadas')
  const nivel = entrada.riesgo?.evidenciaValida ? entrada.riesgo.nivelRiesgo : null
  if (nivel !== null && NIVELES_RIESGO_POSITIVO.has(nivel)) return no('riesgo_no_bajo')
  if (entrada.claseRio !== null && EXPOSICION_POSITIVA.has(entrada.claseRio)) return no('exposicion_sitio')
  if (entrada.juntoLaguna === true) return no('junto_laguna')
  if (entrada.claseRuta !== null && EXPOSICION_POSITIVA.has(entrada.claseRuta)) return no('exposicion_ruta')
  const sinAntecedentes = nivel === null
    && (entrada.claseRio === null || !EXPOSICION_CON_DATO.has(entrada.claseRio))
    && (entrada.claseRuta === null || !EXPOSICION_CON_DATO.has(entrada.claseRuta))
  return { apta: true, motivo: null, sinAntecedentes }
}
