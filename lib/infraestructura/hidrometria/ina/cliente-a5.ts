// Cliente HTTP de la API pública INA A5. Sin autenticación; timeouts y
// reintentos acotados vía ejecutarConReintentos. Devuelve el payload ya
// validado junto con su sha256 para conservarlo como lote crudo inmutable.
import { createHash } from 'node:crypto'
import { ejecutarConReintentos, type ResultadoHttp } from '@/lib/infraestructura/riesgo/providers/cliente-http'
import { CONFIG_FUENTES } from '@/lib/infraestructura/riesgo/providers/config-fuentes'
import { type EstacionA5, type ObservacionA5, parsearEstacionesA5, parsearObservacionesA5 } from './parser-a5'

export type LoteObservacionesA5 = {
  url: string
  payload: unknown
  /** sha256 de JSON.stringify(payload) tal como se recibió. */
  sha256: string
  observaciones: ObservacionA5[]
}

export type ClienteA5 = {
  obtenerEstaciones(): Promise<ResultadoHttp<EstacionA5[]>>
  /** Observaciones de la serie entre dos fechas `YYYY-MM-DD` (inclusive según A5). */
  obtenerObservaciones(serieId: number, desde: string, hasta: string): Promise<ResultadoHttp<LoteObservacionesA5>>
}

export type OpcionesClienteA5 = {
  fetchImpl?: typeof fetch
  baseUrl?: string
  timeoutMs?: number
  maxIntentos?: number
  backoffBaseMs?: number
}

export function sha256Json(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

export function crearClienteA5(opts: OpcionesClienteA5 = {}): ClienteA5 {
  const cfg = CONFIG_FUENTES.inaA5
  const baseUrl = opts.baseUrl ?? cfg.baseUrl
  const comunes = {
    fetchImpl: opts.fetchImpl,
    timeoutMs: opts.timeoutMs ?? cfg.timeoutMs,
    maxIntentos: opts.maxIntentos ?? cfg.reintentos,
    backoffBaseMs: opts.backoffBaseMs,
  }
  return {
    obtenerEstaciones: () =>
      ejecutarConReintentos({
        ...comunes,
        url: `${baseUrl}/obs/puntual/estaciones?tabla=alturas_prefe&format=json`,
        parsearPayload: parsearEstacionesA5,
      }),
    obtenerObservaciones: (serieId, desde, hasta) => {
      const url = `${baseUrl}/obs/puntual/series/${serieId}/observaciones?timestart=${desde}&timeend=${hasta}&format=json`
      return ejecutarConReintentos({
        ...comunes,
        url,
        parsearPayload: (json) => ({
          url,
          payload: json,
          sha256: sha256Json(json),
          observaciones: parsearObservacionesA5(json, serieId),
        }),
      })
    },
  }
}
