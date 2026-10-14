// Cliente de Ogimet (bloques SYNOP en texto). Una petición por estación y
// período; la decodificación vive en synop-parser.ts.
//
// Ogimet puede responder HTTP 200 con un texto de error ("Status: 500",
// "#Sorry" por cupo). Esos cuerpos se tratan como ErrorOgimet para no
// confundirlos con un período sin datos. Los mensajes son fijos: nunca incluyen
// el cuerpo de la respuesta.

import { getDefaultAutoSelectFamilyAttemptTimeout, setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net'

// Happy Eyeballs de Node espera 250 ms por familia de direcciones. El handshake
// IPv4 con Ogimet tarda más desde Argentina y, sin IPv6 en el host, fetch
// aborta con ETIMEDOUT aunque curl conecte en < 1 s (diagnóstico 2026-10-14).
// Subir el umbral sólo agrega paciencia; nunca lo baja si ya es mayor.
const ESPERA_POR_FAMILIA_MS = 2000
if (getDefaultAutoSelectFamilyAttemptTimeout() < ESPERA_POR_FAMILIA_MS) {
  setDefaultAutoSelectFamilyAttemptTimeout(ESPERA_POR_FAMILIA_MS)
}

export const URL_OGIMET_SYNOP = 'https://www.ogimet.com/cgi-bin/getsynop'

export const USER_AGENT_OGIMET = 'data-hub-dashboard/1.0 (+riesgo escuelas Corrientes)'

const TIMEOUT_MS_DEFAULT = 30_000

export class ErrorOgimet extends Error {
  readonly status: number | null

  constructor(mensaje: string, status: number | null = null) {
    super(mensaje)
    this.name = 'ErrorOgimet'
    this.status = status
  }
}

export type ParametrosDescargaOgimet = {
  wmo: string
  desde: Date
  hasta: Date
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

function formatearFechaOgimet(fecha: Date): string {
  // YYYYMMDDHHmm en UTC.
  return fecha.toISOString().slice(0, 16).replace(/[-T:]/g, '')
}

function esRespuestaDeError(cuerpo: string): boolean {
  const texto = cuerpo.trim()
  if (texto.startsWith('#')) return true
  return texto.includes('Status:') && !texto.includes('AAXX')
}

/**
 * Descarga el texto SYNOP de una estación para [desde, hasta] (UTC).
 * Lanza ErrorOgimet ante HTTP no 2xx (429 incluido), timeout o cuerpo de error.
 */
export async function descargarSynopOgimet(params: ParametrosDescargaOgimet): Promise<string> {
  const { wmo, desde, hasta } = params
  const fetchImpl = params.fetchImpl ?? fetch
  const timeoutMs = params.timeoutMs ?? TIMEOUT_MS_DEFAULT

  const url = new URL(URL_OGIMET_SYNOP)
  url.searchParams.set('block', wmo)
  url.searchParams.set('begin', formatearFechaOgimet(desde))
  url.searchParams.set('end', formatearFechaOgimet(hasta))

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const respuesta = await fetchImpl(url.toString(), {
      headers: { 'User-Agent': USER_AGENT_OGIMET, Accept: 'text/plain' },
      signal: controller.signal,
    })
    if (respuesta.status === 429) {
      throw new ErrorOgimet('Ogimet limitó las consultas (HTTP 429)', 429)
    }
    if (!respuesta.ok) {
      throw new ErrorOgimet(`Ogimet respondió HTTP ${respuesta.status}`, respuesta.status)
    }
    const cuerpo = await respuesta.text()
    if (esRespuestaDeError(cuerpo)) {
      throw new ErrorOgimet('Ogimet devolvió un mensaje de error en lugar de datos SYNOP')
    }
    return cuerpo
  } catch (error) {
    if (error instanceof ErrorOgimet) throw error
    if (controller.signal.aborted) throw new ErrorOgimet('timeout al consultar Ogimet')
    throw new ErrorOgimet('error de red al consultar Ogimet')
  } finally {
    clearTimeout(timer)
  }
}
