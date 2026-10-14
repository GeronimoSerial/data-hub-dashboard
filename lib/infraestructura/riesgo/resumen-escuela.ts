export type Nivel = 'bajo' | 'moderado' | 'alto' | 'muy_alto' | 'sin_dato'

export type EntradaResumen = {
  nivelMaximo: {
    nivel: Nivel
    horizonteHoras: number | null
    motivo: 'lluvia' | 'rafagas' | 'caudal' | null
  }
  lluviaObservada72h: { mm: number | null; parcial: boolean; hasta: string | null }
  lluviaPronosticada24h: { mm: number | null }
  rio: {
    estado: 'evacuacion' | 'alerta' | 'normal' | 'sin_dato'
    estacionNombre: string
    alturaM: number | null
    medidaEn: string | null
  } | null
  pronosticoDesactualizadoDesde: string | null
}

export type ResumenEscuela = {
  titulo: 'Situación de la escuela'
  conclusion: string
  puntos: string[]
}

const ZONA_HORARIA = 'America/Argentina/Buenos_Aires'

const formatoFecha = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONA_HORARIA,
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function formatoNumero(valor: number, decimales: number): string {
  return valor.toFixed(decimales).replace('.', ',')
}

export function fechaCorta(iso: string): string {
  const partes = Object.fromEntries(
    formatoFecha.formatToParts(new Date(iso)).map((p) => [p.type, p.value]),
  )
  return `${partes.day}/${partes.month} ${partes.hour}:${partes.minute}`
}

export function cantidadLluvia(mm: number): string {
  if (mm < 1) return 'sin lluvia'
  const decimal = Math.round(mm * 10) / 10
  const numero =
    decimal >= 10 ? String(Math.round(mm)) : Number.isInteger(decimal) ? String(decimal) : formatoNumero(decimal, 1)
  const categoria = mm < 20 ? 'poca' : mm < 50 ? 'moderada' : 'mucha'
  return `${numero} mm (${categoria})`
}

const TEXTO_ESTADO_RIO = {
  evacuacion: 'evacuación',
  alerta: 'alerta',
  normal: 'normal',
  sin_dato: 'sin dato',
} as const

const TEXTO_MOTIVO = {
  lluvia: 'lluvia',
  rafagas: 'ráfagas',
  caudal: 'crecida del río',
} as const

function puntoLluvia(entrada: EntradaResumen): string {
  const { mm, parcial } = entrada.lluviaObservada72h
  const valor = mm === null ? 'sin dato' : cantidadLluvia(mm)
  const incompleto = parcial ? ' — datos incompletos' : ''
  return `Lluvia últimos 3 días: ${valor}${incompleto}`
}

function puntoPronostico(entrada: EntradaResumen): string {
  const { mm } = entrada.lluviaPronosticada24h
  const valor = mm === null ? 'sin dato' : cantidadLluvia(mm)
  const base = `Pronóstico próximas 24 h: ${valor}`
  const desde = entrada.pronosticoDesactualizadoDesde
  return desde ? `${base} (desactualizado desde ${fechaCorta(desde)})` : base
}

function puntoRio(entrada: EntradaResumen): string {
  const rio = entrada.rio
  if (rio === null) return 'Río: sin estación de referencia cercana'
  const altura = rio.alturaM === null ? '' : `${formatoNumero(rio.alturaM, 2)} m, `
  return `Río (${rio.estacionNombre}): ${altura}${TEXTO_ESTADO_RIO[rio.estado]}`
}

function conclusion(entrada: EntradaResumen): string {
  const estadoRio = entrada.rio?.estado
  if (estadoRio === 'evacuacion') {
    return 'Río en nivel de evacuación en la estación de referencia.'
  }
  if (estadoRio === 'alerta') {
    return 'Río en alerta en la estación de referencia.'
  }

  const { nivel, horizonteHoras, motivo } = entrada.nivelMaximo
  if (nivel === 'alto' || nivel === 'muy_alto') {
    const grado = nivel === 'alto' ? 'alto' : 'muy alto'
    const causa = motivo ? ` por ${TEXTO_MOTIVO[motivo]}` : ''
    const horizonte = horizonteHoras === null ? '' : ` en las próximas ${horizonteHoras} h`
    return `Riesgo ${grado}${causa}${horizonte}.`
  }
  if (nivel === 'moderado') {
    return 'Riesgo moderado: conviene seguir la evolución.'
  }
  if (nivel === 'bajo') {
    return 'Sin señales de riesgo por lluvia ni por río.'
  }
  return 'Sin datos suficientes para evaluar el riesgo.'
}

export function resumirSituacionEscuela(entrada: EntradaResumen): ResumenEscuela {
  return {
    titulo: 'Situación de la escuela',
    conclusion: conclusion(entrada),
    puntos: [puntoLluvia(entrada), puntoPronostico(entrada), puntoRio(entrada)],
  }
}
