import { formatoFechaRegion, localeRegion } from '../formato-region'

// Textos legibles para la traza y el contexto aguas arriba del veredicto.
// Sin React: lo usan la plantilla, el modal, la vista pública y el PDF.

export type TrazaLegible = {
  regla: string
  ref: string
  valor: number | null
  umbral: number | string | null
  nivel: string
}

export type MetricaLegible = {
  estacion?: { nombre: string; rio: string }
  id: string
  valor: unknown
  unidad?: string | null
  etiqueta: string
}

export type AguaArribaLegible = {
  nombre: string
  rio: 'parana' | 'uruguay'
  estadoMax: string
  alturaMaxM: number | null
  umbralM: number | null
}

const CONECTORES = new Set(['de', 'del', 'la', 'las', 'los', 'y'])

// El catálogo guarda los nombres en mayúsculas sin tildes: estas son las que llevan tilde.
const TILDES: Record<string, string> = {
  IGUAZU: 'Iguazú',
  ITATI: 'Itatí',
  ITUZAINGO: 'Ituzaingó',
  'ITA IBATE': 'Ita Ibaté',
  'SANTO TOME': 'Santo Tomé',
  YAPEYU: 'Yapeyú',
  MOCORETA: 'Mocoretá',
}

const NOMBRES_RIO: Record<AguaArribaLegible['rio'], string> = { uruguay: 'Uruguay', parana: 'Paraná' }

const ROTULO_UMBRAL_RIO: Record<string, string> = { alerta: 'alerta', evacuacion: 'evacuación' }

const METRO = 'm'

function clave(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase().trim()
}

export function nombrePropio(texto: string): string {
  const conTilde = TILDES[clave(texto).replace(/\s+/g, ' ')]
  if (conTilde) return conTilde
  return texto
    .toLowerCase()
    .split(' ')
    .map((palabra, i) => (i > 0 && CONECTORES.has(palabra) ? palabra : palabra.charAt(0).toUpperCase() + palabra.slice(1)))
    .join(' ')
}

export function nombreRio(rio: string): string {
  return NOMBRES_RIO[rio as AguaArribaLegible['rio']] ?? rio
}

export function numeroEs(valor: number, decimales: number): string {
  return valor.toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
}

function partesArt(iso: string): Record<string, string> {
  const partes = formatoFechaRegion(localeRegion(), {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  return Object.fromEntries(partes.map((p) => [p.type, p.value]))
}

export function horaArt(iso: string): string {
  const p = partesArt(iso)
  return `${p.hour}:${p.minute}`
}

export function fechaHoraArt(iso: string): string {
  const p = partesArt(iso)
  return `${p.day}/${p.month} ${p.hour}:${p.minute}`
}

function metrica(metricas: MetricaLegible[], id: string): MetricaLegible | undefined {
  return metricas.find((m) => m.id === id)
}

function valorMetrica(m: MetricaLegible | undefined): number | null {
  return typeof m?.valor === 'number' ? m.valor : null
}

// 'rio.<estacionId>.estado_max' → estacionId
function estacionDeRef(ref: string): string {
  return ref.replace(/^rio\./, '').replace(/\.estado_max$/, '')
}

function identidadRio(ref: string, metricas: MetricaLegible[]): string {
  const estacionId = estacionDeRef(ref)
  const altura = metrica(metricas, `rio.${estacionId}.altura_max_m`)
  const estacion = altura?.estacion ?? metricas.find((m) => m.id.startsWith(`rio.${estacionId}.`) && m.estacion)?.estacion
  const nombre = estacion
    ? nombrePropio(estacion.nombre)
    : altura
      ? nombrePropio(altura.etiqueta.replace(/^Altura máxima /, ''))
      : 'estación'
  return estacion ? `Prefectura ${nombre} (río ${nombreRio(estacion.rio)})` : `Prefectura ${nombre}`
}

function porcentaje(fraccion: number): string {
  return `${numeroEs(fraccion * 100, 0)} %`
}

function describirRio(entrada: TrazaLegible, metricas: MetricaLegible[]): string {
  const cabecera = identidadRio(entrada.ref, metricas)
  const estacionId = estacionDeRef(entrada.ref)
  if (entrada.regla === 'rio.tendencia') {
    // Aquí `valor` es el margen a la alerta, no una tendencia.
    const margen = entrada.valor === null ? 'sin dato' : `a ${numeroEs(entrada.valor, 2)} ${METRO} de la alerta`
    const umbral = typeof entrada.umbral === 'number' ? ` (umbral ${numeroEs(entrada.umbral, 2)} ${METRO})` : ''
    return `${cabecera}: ${margen}${umbral}`
  }
  if (typeof entrada.umbral === 'number') {
    // Subida de 24 h de un río en alerta: `valor` es la tendencia.
    const subida = entrada.valor === null ? 'sin dato' : `subió ${numeroEs(entrada.valor, 2)} ${METRO} en 24 h`
    return `${cabecera}: ${subida} (umbral ${numeroEs(entrada.umbral, 2)} ${METRO})`
  }
  // Altura siempre explícita, con el estado al lado y el umbral como dato secundario.
  const altura = `Altura del río: ${entrada.valor === null ? 'sin dato' : `${numeroEs(entrada.valor, 2)} ${METRO}`}`
  const rotulo = typeof entrada.umbral === 'string' ? ROTULO_UMBRAL_RIO[entrada.umbral] : undefined
  if (!rotulo) return `${cabecera} — ${altura}`
  const cota = valorMetrica(metrica(metricas, `rio.${estacionId}.${entrada.umbral === 'evacuacion' ? 'evacuacion_m' : 'alerta_m'}`))
  const estado = rotulo.charAt(0).toUpperCase() + rotulo.slice(1)
  const umbral = cota === null ? '' : ` (${rotulo} ${numeroEs(cota, 2)} ${METRO})`
  return `${cabecera} — ${altura} · ${estado}${umbral}`
}

function percentil(umbral: number | string | null): string {
  return typeof umbral === 'string' ? umbral.replace(/^p/, '') : String(umbral ?? '')
}

function describirCaudal(entrada: TrazaLegible, metricas: MetricaLegible[]): string {
  const m = metricas.find((x) => x.id === entrada.ref)
  const nombre = m ? m.etiqueta.replace(/^Caudal pico /, '') : ''
  const sujeto = nombre ? `Caudal pronosticado ${nombre}` : 'Caudal pronosticado'
  const valor = entrada.valor === null ? 'sin dato' : `${numeroEs(entrada.valor, 0)} m³/s`
  return `${sujeto}: ${valor} (sobre el percentil ${percentil(entrada.umbral)})`
}

function valorMm(valor: number | null, decimales: number): string {
  return valor === null ? 'sin dato' : `${numeroEs(valor, decimales)} mm`
}

function describirSenalConocida(entrada: TrazaLegible, metricas: MetricaLegible[]): string | null {
  switch (entrada.regla) {
    case 'rio.estado':
    case 'rio.tendencia':
      return describirRio(entrada, metricas)
    case 'lluvia.obs_24h':
      return `Lluvia máxima en 24 h: ${valorMm(entrada.valor, 1)} (sobre el percentil ${percentil(entrada.umbral)} climatológico)`
    case 'lluvia.obs_72h': {
      const umbral = typeof entrada.umbral === 'number' ? ` ≥ ${numeroEs(entrada.umbral, 0)} mm` : ''
      return `Lluvia máxima en 72 h: ${valorMm(entrada.valor, 1)}${umbral}`
    }
    case 'lluvia.pron_24h': {
      const umbral = typeof entrada.umbral === 'number' ? ` ≥ ${numeroEs(entrada.umbral, 0)} mm` : ''
      return `Lluvia pronosticada en 24 h (ECMWF): ${valorMm(entrada.valor, 1)}${umbral}`
    }
    case 'caudal.percentil':
      return describirCaudal(entrada, metricas)
    case 'ensamble.prob': {
      const p = /prob_p(\d+)/.exec(entrada.ref)?.[1] ?? ''
      const valor = entrada.valor === null ? 'sin dato' : porcentaje(entrada.valor)
      const umbral = typeof entrada.umbral === 'number' ? ` ≥ ${porcentaje(entrada.umbral)}` : ''
      return `Probabilidad de lluvia sobre el percentil ${p}: ${valor}${umbral}`
    }
    case 'smn.aviso':
      return `Aviso del SMN nivel ${String(entrada.umbral ?? 'sin nivel')}`
    default:
      return null
  }
}

// Regla desconocida: se usa la etiqueta de su métrica, sin ids ni snake_case.
function describirSenalDesconocida(entrada: TrazaLegible, metricas: MetricaLegible[]): string {
  const m = metrica(metricas, entrada.ref)
  if (!m) return 'Señal sin descripción disponible'
  const valor = typeof m.valor === 'number' ? m.valor.toLocaleString('es-AR', { maximumFractionDigits: 2 }) : String(m.valor ?? 'sin dato')
  return `${m.etiqueta}: ${valor}${m.unidad ? ` ${m.unidad}` : ''}`
}

export function describirTraza(entrada: TrazaLegible, metricas: MetricaLegible[]): string {
  return describirSenalConocida(entrada, metricas) ?? describirSenalDesconocida(entrada, metricas)
}

export function describirAguaArriba(a: AguaArribaLegible): string {
  const nombre = nombrePropio(a.nombre)
  const cabecera = `Prefectura ${nombre} (río ${nombreRio(a.rio)})`
  const altura = `Altura del río: ${a.alturaMaxM === null ? 'sin dato' : `${numeroEs(a.alturaMaxM, 2)} ${METRO}`}`
  if (a.umbralM === null) return `${cabecera} — ${altura}`
  const cota = `${numeroEs(a.umbralM, 2)} ${METRO}`
  const estado =
    a.estadoMax === 'evacuacion'
      ? `Evacuación (evacuación ${cota})`
      : a.estadoMax === 'alerta'
        ? `Alerta (alerta ${cota})`
        : `Normal (alerta ${cota})`
  return `${cabecera} — ${altura} · ${estado}`
}
