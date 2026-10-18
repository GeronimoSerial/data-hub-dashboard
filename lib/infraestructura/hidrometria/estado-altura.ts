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

export type CalidadLectura =
  | 'vigente'
  | 'vencida'
  | 'inconsistente'
  | 'sin_umbrales'
  | 'sin_lectura'

export type CalidadPuntoHistorico =
  | 'valida'
  | 'inconsistente'
  | 'sin_umbrales'
  | 'sin_lectura'

export type LecturaParaMonitoreo = LecturaParaEstado & {
  periodoHoras?: number | null
  estadoPublicado?: string | null
  motivosInconsistencia?: readonly string[]
}

export type VariacionPublicadaEvaluada = {
  variacionM: number | null
  periodoHoras: number | null
  estadoPublicado: string | null
  tendencia: TendenciaAltura
  confiable: boolean
}

export type EvaluacionMonitoreoLectura = {
  estadoNivel: EstadoAltura
  calidad: CalidadLectura
  lecturaVencida: boolean
  inconsistente: boolean
  motivosInconsistencia: string[]
  tieneUmbrales: boolean
  variacionPublicada: VariacionPublicadaEvaluada
}

export type EvaluacionPuntoHistorico = {
  estadoNivel: EstadoAltura
  calidad: CalidadPuntoHistorico
  tieneUmbrales: boolean
  variacionPublicada: VariacionPublicadaEvaluada
}

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

// Separates level classification, reading quality, and published variation reliability
// so inconsistent or expired readings never expose an active trend arrow.
export function evaluarLecturaMonitoreo(
  lectura: LecturaParaMonitoreo | null,
  opciones: { ahora?: Date; edadMaximaHoras?: number } = {},
): EvaluacionMonitoreoLectura {
  if (!lectura) {
    return {
      estadoNivel: 'sin_dato',
      calidad: 'sin_lectura',
      lecturaVencida: false,
      inconsistente: false,
      motivosInconsistencia: [],
      tieneUmbrales: false,
      variacionPublicada: {
        variacionM: null,
        periodoHoras: null,
        estadoPublicado: null,
        tendencia: 'sin_dato',
        confiable: false,
      },
    }
  }

  const ahora = opciones.ahora ?? new Date()
  const edadMaximaHoras = opciones.edadMaximaHoras ?? EDAD_MAXIMA_LECTURA_HORAS
  const vencida = estaVencida(lectura.medidaEn, ahora, edadMaximaHoras)
  const tieneUmbrales = lectura.alertaM !== null || lectura.evacuacionM !== null
  const calidad = calidadDeLectura(lectura, vencida, tieneUmbrales)
  const estadoNivel = vencida ? 'sin_dato' : estadoDeNivel(lectura)
  const variacionConfiable =
    !lectura.inconsistente && !vencida && lectura.lecturaM !== null && lectura.variacionM !== null

  return {
    estadoNivel,
    calidad,
    lecturaVencida: vencida,
    inconsistente: lectura.inconsistente,
    motivosInconsistencia: lectura.motivosInconsistencia ? [...lectura.motivosInconsistencia] : [],
    tieneUmbrales,
    variacionPublicada: {
      variacionM: lectura.variacionM,
      periodoHoras: lectura.periodoHoras ?? null,
      estadoPublicado: lectura.estadoPublicado ?? null,
      tendencia: variacionConfiable ? tendenciaDe(lectura.variacionM) : 'sin_dato',
      confiable: variacionConfiable,
    },
  }
}

// Evaluates a stored observation at its measurement instant without applying the
// 18 h current-staleness cutoff used for live monitoring.
export function evaluarPuntoHistorico(lectura: LecturaParaMonitoreo): EvaluacionPuntoHistorico {
  const tieneUmbrales = lectura.alertaM !== null || lectura.evacuacionM !== null
  const calidad = calidadDePuntoHistorico(lectura, tieneUmbrales)
  const estadoNivel = estadoDeNivel(lectura)
  const variacionConfiable =
    !lectura.inconsistente && lectura.lecturaM !== null && lectura.variacionM !== null

  return {
    estadoNivel,
    calidad,
    tieneUmbrales,
    variacionPublicada: {
      variacionM: lectura.variacionM,
      periodoHoras: lectura.periodoHoras ?? null,
      estadoPublicado: lectura.estadoPublicado ?? null,
      tendencia: variacionConfiable ? tendenciaDe(lectura.variacionM) : 'sin_dato',
      confiable: variacionConfiable,
    },
  }
}

function calidadDeLectura(
  lectura: LecturaParaEstado,
  vencida: boolean,
  tieneUmbrales: boolean,
): CalidadLectura {
  if (lectura.inconsistente) return 'inconsistente'
  if (lectura.lecturaM === null) return 'sin_lectura'
  if (vencida) return 'vencida'
  if (!tieneUmbrales) return 'sin_umbrales'
  return 'vigente'
}

function calidadDePuntoHistorico(
  lectura: LecturaParaEstado,
  tieneUmbrales: boolean,
): CalidadPuntoHistorico {
  if (lectura.inconsistente) return 'inconsistente'
  if (lectura.lecturaM === null) return 'sin_lectura'
  if (!tieneUmbrales) return 'sin_umbrales'
  return 'valida'
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
