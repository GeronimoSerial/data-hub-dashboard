// Pure classification of a station reading against its own published thresholds.
// Thresholds come from the reading itself (never from the catalogue). A reading
// without a usable height, flagged inconsistent, or too old to be current is never
// classified as normal or alerta.

export type EstadoAltura = 'evacuacion' | 'alerta' | 'normal' | 'sin_dato'
export type TendenciaAltura = 'crece' | 'baja' | 'estable' | 'sin_dato'

export type LecturaParaEstado = {
  lecturaM: number | null
  variacionM: number | null
  alertaM: number | null
  evacuacionM: number | null
  inconsistente: boolean
  medidaEn?: string | null
}

// Many Prefectura stations publish only twice a day (00:00 and 12:00 ART) and the
// sync job runs hourly, so the cutoff covers a 12 h cadence plus sync lag.
export const EDAD_MAXIMA_LECTURA_HORAS = 18

const UMBRAL_ESTABLE_M = 0.005
const MILISEGUNDOS_POR_HORA = 3_600_000

export function estadoAltura(
  lectura: LecturaParaEstado | null,
  opciones: { ahora?: Date; edadMaximaHoras?: number } = {},
): {
  estado: EstadoAltura
  tendencia: TendenciaAltura
  vencida: boolean
} {
  if (!lectura) return { estado: 'sin_dato', tendencia: 'sin_dato', vencida: false }

  const ahora = opciones.ahora ?? new Date()
  const edadMaximaHoras = opciones.edadMaximaHoras ?? EDAD_MAXIMA_LECTURA_HORAS
  if (estaVencida(lectura.medidaEn, ahora, edadMaximaHoras)) {
    return { estado: 'sin_dato', tendencia: 'sin_dato', vencida: true }
  }

  return {
    estado: estadoDeNivel(lectura),
    tendencia: tendenciaDe(lectura.variacionM),
    vencida: false,
  }
}

function estaVencida(
  medidaEn: string | null | undefined,
  ahora: Date,
  edadMaximaHoras: number,
): boolean {
  if (medidaEn === undefined || medidaEn === null) return false
  const instante = Date.parse(medidaEn)
  if (Number.isNaN(instante)) return true
  return ahora.getTime() - instante > edadMaximaHoras * MILISEGUNDOS_POR_HORA
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
