// Pure classification of a station reading against its own published thresholds.
// Thresholds come from the reading itself (never from the catalogue). A reading
// without a usable height, or flagged inconsistent, is never classified as normal.

export type EstadoAltura = 'evacuacion' | 'alerta' | 'normal' | 'sin_dato'
export type TendenciaAltura = 'crece' | 'baja' | 'estable' | 'sin_dato'

export type LecturaParaEstado = {
  lecturaM: number | null
  variacionM: number | null
  alertaM: number | null
  evacuacionM: number | null
  inconsistente: boolean
}

const UMBRAL_ESTABLE_M = 0.005

export function estadoAltura(lectura: LecturaParaEstado | null): {
  estado: EstadoAltura
  tendencia: TendenciaAltura
} {
  if (!lectura) return { estado: 'sin_dato', tendencia: 'sin_dato' }

  return {
    estado: estadoDeNivel(lectura),
    tendencia: tendenciaDe(lectura.variacionM),
  }
}

function estadoDeNivel(lectura: LecturaParaEstado): EstadoAltura {
  const { lecturaM, alertaM, evacuacionM, inconsistente } = lectura
  if (lecturaM === null || inconsistente) return 'sin_dato'
  if (evacuacionM !== null && lecturaM >= evacuacionM) return 'evacuacion'
  if (alertaM !== null && lecturaM >= alertaM) return 'alerta'
  if (alertaM === null && evacuacionM === null) return 'sin_dato'
  return 'normal'
}

function tendenciaDe(variacionM: number | null): TendenciaAltura {
  if (variacionM === null) return 'sin_dato'
  if (variacionM > UMBRAL_ESTABLE_M) return 'crece'
  if (variacionM < -UMBRAL_ESTABLE_M) return 'baja'
  return 'estable'
}
