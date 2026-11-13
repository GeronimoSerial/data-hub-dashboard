// Cliente del CSV de niveles de SGB/SACE (Manaus, Río Negro). Descarga el CSV
// y lo parsea con funciones puras. Los mensajes de error son fijos y nunca
// incluyen el cuerpo de la respuesta.

export const SACE_URL_MANAUS = 'https://sace.sgb.gov.br/niveis/api/dados/amazonas_8_cota.csv'
export const SACE_ESTACION_ID = 'amazonas_8'
// Hora de SACE: se observó +1 h respecto de Brasília (UTC-2 efectivo), inferido; ver docs/ejecucion-enos/B0/rio-y-alertas.md
export const SACE_OFFSET_HORAS = -2

const CABECERA = 'data_hora_medicao;indice'
const TIMEOUT_MS_DEFAULT = 20_000
const TAMANO_MAXIMO_CUERPO = 5_000_000
const REGEX_FECHA = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/
const REGEX_NIVEL = /^-?\d+(\.\d+)?$/
const MS_POR_HORA = 3_600_000

export type LecturaSace = { estacionId: string; medidaEn: string /* ISO UTC */; lecturaM: number /* cm/100 */ }

type FetchImpl = typeof fetch

export type ParametrosDescargaSace = {
  url?: string
  fetchImpl?: FetchImpl
  timeoutMs?: number
}

// Los campos se asignan explícitamente: el modo strip-only de Node no admite
// propiedades de parámetro en el constructor.
export class HttpSaceError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`HTTP ${status}`)
    this.name = 'HttpSaceError'
    this.status = status
  }
}

export class ErrorRedSace extends Error {}

export class RespuestaSaceInvalidaError extends Error {}

function medidaEnDe(fecha: string): string | null {
  const partes = REGEX_FECHA.exec(fecha)
  if (partes === null) return null
  const [anio, mes, dia, hora, minuto, segundo] = partes.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  const local = new Date(Date.UTC(anio, mes - 1, dia, hora, minuto, segundo))
  // Descarta fechas que Date.UTC habría desbordado (mes 13, hora 24, etc.).
  const valida =
    local.getUTCFullYear() === anio &&
    local.getUTCMonth() === mes - 1 &&
    local.getUTCDate() === dia &&
    local.getUTCHours() === hora &&
    local.getUTCMinutes() === minuto &&
    local.getUTCSeconds() === segundo
  if (!valida) return null
  return new Date(local.getTime() - SACE_OFFSET_HORAS * MS_POR_HORA).toISOString()
}

function parsearLineaSace(linea: string, estacionId: string): LecturaSace | null {
  const celdas = linea.split(';')
  if (celdas.length !== 2) return null
  const medidaEn = medidaEnDe((celdas[0] ?? '').trim())
  const nivel = (celdas[1] ?? '').trim()
  if (medidaEn === null || !REGEX_NIVEL.test(nivel)) return null
  return { estacionId, medidaEn, lecturaM: Number(nivel) / 100 }
}

/**
 * Parsea el CSV de SACE. Exige la cabecera; las líneas inválidas se cuentan
 * en `descartadas`. Las líneas en blanco se ignoran. Devuelve las lecturas
 * ordenadas de forma ascendente.
 */
export function parsearCsvSace(
  csv: string,
  estacionId: string = SACE_ESTACION_ID,
): { lecturas: LecturaSace[]; descartadas: number } {
  const lineas = csv.split(/\r?\n/)
  const primera = lineas.findIndex((linea) => linea.trim() !== '')
  if (primera === -1 || (lineas[primera] ?? '').trim() !== CABECERA) {
    throw new RespuestaSaceInvalidaError('El CSV de SACE no tiene la cabecera esperada')
  }

  const lecturas: LecturaSace[] = []
  let descartadas = 0
  for (const linea of lineas.slice(primera + 1)) {
    if (linea.trim() === '') continue
    const lectura = parsearLineaSace(linea, estacionId)
    if (lectura === null) descartadas++
    else lecturas.push(lectura)
  }

  lecturas.sort((a, b) => (a.medidaEn < b.medidaEn ? -1 : a.medidaEn > b.medidaEn ? 1 : 0))
  return { lecturas, descartadas }
}

async function pedirCuerpo(url: string, fetchImpl: FetchImpl, timeoutMs: number): Promise<string> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  // Algún fetch puede ignorar la señal de cancelación; el timeout se aplica
  // también con su propia promesa.
  const limite = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new ErrorRedSace('timeout al consultar SACE'))
    }, timeoutMs)
  })

  const solicitud = (async (): Promise<string> => {
    const respuesta = await fetchImpl(url, {
      headers: { Accept: 'text/csv' },
      signal: controller.signal,
    })
    if (!respuesta.ok) throw new HttpSaceError(respuesta.status)
    return respuesta.text()
  })()

  try {
    return await Promise.race([solicitud, limite])
  } catch (error) {
    if (error instanceof HttpSaceError || error instanceof ErrorRedSace) throw error
    throw new ErrorRedSace('error de red al consultar SACE')
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Descarga y parsea el CSV de SACE. Sin reintentos: cualquier fallo se
 * reporta con su error tipado.
 */
export async function descargarCotasSace(
  params: ParametrosDescargaSace = {},
): Promise<{ lecturas: LecturaSace[]; descartadas: number }> {
  const url = params.url ?? SACE_URL_MANAUS
  const fetchImpl = params.fetchImpl ?? fetch
  const timeoutMs = params.timeoutMs ?? TIMEOUT_MS_DEFAULT

  const cuerpo = await pedirCuerpo(url, fetchImpl, timeoutMs)
  if (cuerpo.length > TAMANO_MAXIMO_CUERPO) {
    throw new RespuestaSaceInvalidaError('La respuesta de SACE excede el tamaño máximo')
  }
  if (cuerpo.trimStart().startsWith('<')) {
    throw new RespuestaSaceInvalidaError('SACE devolvió HTML en lugar de CSV')
  }
  return parsearCsvSace(cuerpo)
}
