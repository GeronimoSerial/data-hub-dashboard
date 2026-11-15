import { textoAlturaRio } from '@/lib/infraestructura/presentacion/textos-dato'
import { formatoFechaRegion } from '@/lib/infraestructura/formato-region'
import { es } from '@/lib/i18n/diccionarios/es'
import type { Diccionario } from '@/lib/i18n/diccionarios/tipos'

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
  /** The point only says a value is missing; essential views skip it. */
  sinDato?: true
}

export type ResumenEscuela = {
  titulo: string
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

export function cantidadLluvia(mm: number, t: Diccionario = es): string {
  if (mm < 1) return t.libTextos2.lluvia.sinLluvia
  const decimal = Math.round(mm * 10) / 10
  const numero =
    decimal >= 10 ? String(Math.round(mm)) : Number.isInteger(decimal) ? String(decimal) : formatoNumero(decimal, 1)
  const categoria = mm < 20 ? 'poca' : mm < 50 ? 'moderada' : 'mucha'
  return t.libTextos2.lluvia.cantidad(numero, categoria)
}

function puntoLluvia(entrada: EntradaResumen, t: Diccionario): PuntoResumen {
  const { mm, hasta } = entrada.lluviaObservada72h
  const valor = mm === null ? t.libTextos2.lluvia.sinDato : cantidadLluvia(mm, t)
  return {
    texto: t.libTextos2.resumenEscuela.lluviaTresDias(valor),
    actualizado: hasta,
    vencido: false,
    ...(mm === null ? { sinDato: true as const } : {}),
  }
}

function puntoPronostico(entrada: EntradaResumen, t: Diccionario): PuntoResumen {
  const { mm } = entrada.lluviaPronosticada24h
  const valor = mm === null ? t.libTextos2.lluvia.sinDato : cantidadLluvia(mm, t)
  const desde = entrada.pronosticoDesactualizadoDesde
  // Vencido: la fecha del último éxito de la fuente; al día: la de la corrida usada.
  const actualizado = desde ?? entrada.lluviaPronosticada24h.corridaEn ?? null
  return {
    texto: t.libTextos2.resumenEscuela.pronostico24h(valor),
    actualizado,
    vencido: desde !== null,
    ...(mm === null ? { sinDato: true as const } : {}),
  }
}

function puntoRio(entrada: EntradaResumen, t: Diccionario): PuntoResumen {
  const rio = entrada.rio
  if (rio === null) {
    return { texto: t.libTextos2.resumenEscuela.sinEstacion, actualizado: null, vencido: false, sinDato: true }
  }
  const altura = textoAlturaRio({
    alturaM: rio.alturaM,
    estado: rio.estado,
    alertaM: rio.alertaM ?? null,
    evacuacionM: rio.evacuacionM ?? null,
  }, t)
  return {
    texto: `${altura.altura} · ${altura.estado} (${rio.estacionNombre})`,
    ...(altura.umbrales ? { detalle: altura.umbrales } : {}),
    actualizado: rio.medidaEn,
    vencido: rio.vencido ?? false,
  }
}

function conclusion(entrada: EntradaResumen, t: Diccionario): string {
  const c = t.libTextos2.resumenEscuela.conclusion
  const estadoRio = entrada.rio?.estado
  if (estadoRio === 'evacuacion') {
    return c.evacuacionRio
  }
  if (estadoRio === 'alerta') {
    return c.alertaRio
  }

  const { nivel, horizonteHoras, motivo } = entrada.nivelMaximo
  if (nivel === 'alto' || nivel === 'muy_alto') {
    const causa = motivo ? c.causa(t.libTextos2.resumenEscuela.motivo[motivo]) : ''
    const horizonte = horizonteHoras === null ? '' : c.horizonte(horizonteHoras)
    return c.riesgo(nivel === 'muy_alto', causa, horizonte)
  }
  if (nivel === 'moderado') {
    return c.moderado
  }
  if (nivel === 'bajo') {
    return c.bajo
  }
  return c.sinDatos
}

export function resumirSituacionEscuela(entrada: EntradaResumen, t: Diccionario = es): ResumenEscuela {
  return {
    titulo: t.libTextos2.resumenEscuela.titulo,
    conclusion: conclusion(entrada, t),
    puntos: [puntoLluvia(entrada, t), puntoPronostico(entrada, t), puntoRio(entrada, t)],
  }
}
