import { textoAlturaRio } from '@/lib/infraestructura/presentacion/textos-dato'
import { formatoFechaRegion } from '@/lib/infraestructura/formato-region'

export type Nivel = 'bajo' | 'moderado' | 'alto' | 'muy_alto' | 'sin_dato'

export type EntradaResumen = {
  nivelMaximo: {
    nivel: Nivel
    horizonteHoras: number | null
    motivo: 'lluvia' | 'rafagas' | 'caudal' | null
  }
  lluviaObservada72h: { mm: number | null; parcial: boolean; hasta: string | null }
  /** `corridaEn`: ISO de la corrida de pronóstico más reciente usada, si se conoce. */
  lluviaPronosticada24h: { mm: number | null; corridaEn?: string | null }
  rio: {
    estado: 'evacuacion' | 'alerta' | 'normal' | 'sin_dato'
    estacionNombre: string
    alturaM: number | null
    medidaEn: string | null
    alertaM?: number | null
    evacuacionM?: number | null
    vencido?: boolean
  } | null
  /** Última actualización del pronóstico cuando la fuente superó su umbral de frescura. */
  pronosticoDesactualizadoDesde: string | null
}

/** Un dato de apoyo: el texto va limpio; la fecha y la frescura van al tooltip / estilo atenuado. */
export type PuntoResumen = {
  texto: string
  /** Texto secundario (p. ej. umbrales del río). */
  detalle?: string
  /** ISO de la última actualización conocida, para el tooltip. */
  actualizado: string | null
  vencido: boolean
}

export type ResumenEscuela = {
  titulo: 'Situación de la escuela'
  conclusion: string
  puntos: PuntoResumen[]
}

function formatoNumero(valor: number, decimales: number): string {
  return valor.toFixed(decimales).replace('.', ',')
}

export function fechaCorta(iso: string): string {
  const formato = formatoFechaRegion('en-GB', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const partes = Object.fromEntries(
    formato.formatToParts(new Date(iso)).map((p) => [p.type, p.value]),
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

const TEXTO_MOTIVO = {
  lluvia: 'lluvia',
  rafagas: 'ráfagas',
  caudal: 'crecida del río',
} as const

function puntoLluvia(entrada: EntradaResumen): PuntoResumen {
  const { mm, hasta } = entrada.lluviaObservada72h
  const valor = mm === null ? 'sin dato' : cantidadLluvia(mm)
  return { texto: `Lluvia últimos 3 días: ${valor}`, actualizado: hasta, vencido: false }
}

function puntoPronostico(entrada: EntradaResumen): PuntoResumen {
  const { mm } = entrada.lluviaPronosticada24h
  const valor = mm === null ? 'sin dato' : cantidadLluvia(mm)
  const desde = entrada.pronosticoDesactualizadoDesde
  // Vencido: la fecha del último éxito de la fuente; al día: la de la corrida usada.
  const actualizado = desde ?? entrada.lluviaPronosticada24h.corridaEn ?? null
  return { texto: `Pronóstico próximas 24 h: ${valor}`, actualizado, vencido: desde !== null }
}

function puntoRio(entrada: EntradaResumen): PuntoResumen {
  const rio = entrada.rio
  if (rio === null) return { texto: 'Río: sin estación de referencia cercana', actualizado: null, vencido: false }
  const altura = textoAlturaRio({
    alturaM: rio.alturaM,
    estado: rio.estado,
    alertaM: rio.alertaM ?? null,
    evacuacionM: rio.evacuacionM ?? null,
  })
  return {
    texto: `${altura.altura} · ${altura.estado} (${rio.estacionNombre})`,
    ...(altura.umbrales ? { detalle: altura.umbrales } : {}),
    actualizado: rio.medidaEn,
    vencido: rio.vencido ?? false,
  }
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
