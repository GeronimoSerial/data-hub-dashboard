// Parser puro de la tabla histórica de alturas de Prefectura Naval Argentina
// (página ?page=historico&id=<estación>). Sin red ni reloj: el llamador aporta el HTML.
// Las horas de la página son locales de Argentina (UTC-3, sin horario de verano).

const DESFASE_ARGENTINA_HORAS = 3

export class EstructuraHistoricoCambiadaError extends Error {
  constructor(motivo: string) {
    super(`La estructura del histórico de Prefectura cambió: ${motivo}`)
    this.name = 'EstructuraHistoricoCambiadaError'
  }
}

export type LecturaHistorica = {
  /** Instante en ISO 8601 UTC. */
  medidaEn: string
  lecturaM: number
}

export type EstadisticasNivel = {
  n: number
  mediana: number
  p10: number
  p90: number
  desde: string
  hasta: string
}

function textoPlano(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

function extraerCeldas(filaHtml: string): string[] {
  return [...filaHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1] ?? '')
}

function parsearMedidaEn(textoFecha: string): string | null {
  const m = textoFecha.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})/)
  if (!m) return null
  const [, anio, mes, dia, hora, minuto] = m
  const instante = Date.UTC(
    Number(anio),
    Number(mes) - 1,
    Number(dia),
    Number(hora) + DESFASE_ARGENTINA_HORAS,
    Number(minuto),
  )
  return new Date(instante).toISOString()
}

function parsearLecturaM(textoValor: string): number | null {
  const m = textoValor.match(/(-?\d+(?:[.,]\d+)?)\s*Mts/i)
  if (!m || m[1] === undefined) return null
  return Number(m[1].replace(',', '.'))
}

export function parsearHistoricoPrefectura(html: string): LecturaHistorica[] {
  const cabecera = html.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i)
  if (!cabecera || !/Registro/i.test(textoPlano(cabecera[1] ?? ''))) {
    throw new EstructuraHistoricoCambiadaError('la cabecera no contiene "Registro"')
  }

  const cuerpo = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)
  if (!cuerpo) {
    throw new EstructuraHistoricoCambiadaError('no hay <tbody>')
  }

  const porMedidaEn = new Map<string, LecturaHistorica>()
  for (const fila of (cuerpo[1] ?? '').split(/<tr[^>]*>/i).slice(1)) {
    const celdas = extraerCeldas(fila)
    if (celdas.length < 2) continue

    const medidaEn = parsearMedidaEn(textoPlano(celdas[0] ?? ''))
    const lecturaM = parsearLecturaM(textoPlano(celdas[1] ?? ''))
    if (medidaEn === null || lecturaM === null) continue

    porMedidaEn.set(medidaEn, { medidaEn, lecturaM })
  }

  return [...porMedidaEn.values()].sort((a, b) => a.medidaEn.localeCompare(b.medidaEn))
}

// Percentil con interpolación lineal (equivale al método por defecto de numpy).
function percentil(ordenados: readonly number[], p: number): number {
  const indice = p * (ordenados.length - 1)
  const inferior = Math.floor(indice)
  const superior = Math.ceil(indice)
  const minimo = ordenados[inferior]
  const maximo = ordenados[superior]
  if (minimo === undefined || maximo === undefined) {
    throw new Error('percentil sobre una muestra vacía')
  }
  return minimo + (maximo - minimo) * (indice - inferior)
}

export function estadisticasNivel(lecturas: readonly LecturaHistorica[]): EstadisticasNivel | null {
  if (lecturas.length === 0) return null

  const valores = lecturas.map((l) => l.lecturaM).sort((a, b) => a - b)
  const instantes = lecturas.map((l) => l.medidaEn).sort()
  const primero = instantes[0]
  const ultimo = instantes[instantes.length - 1]
  if (primero === undefined || ultimo === undefined) return null

  return {
    n: lecturas.length,
    mediana: percentil(valores, 0.5),
    p10: percentil(valores, 0.1),
    p90: percentil(valores, 0.9),
    desde: primero,
    hasta: ultimo,
  }
}
