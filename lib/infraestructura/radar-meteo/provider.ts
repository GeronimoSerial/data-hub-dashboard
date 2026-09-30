import { agregarApiKey, construirBaseUrl, type ControladorCupoOM } from '../riesgo/providers/cupo-om'
import { ejecutarConReintentos } from '../riesgo/providers/cliente-http'
import type { CeldaRadar } from './grilla'
import { VARIABLES_RADAR, type VariableRadar } from './variables'
export { VARIABLES_RADAR } from './variables'
export type { VariableRadar } from './variables'
export type LoteRadar = { times: string[]; cells: Array<{ id: string; lat: number; lon: number; latModelo: number; lonModelo: number }>; values: Record<VariableRadar, Array<Array<number | null>>>; units: Record<string, string> }
type FetchImpl = typeof fetch

function validar(json: unknown, celdas: CeldaRadar[]): LoteRadar {
  if (!Array.isArray(json)) throw new Error('Respuesta Open-Meteo inválida: se esperaba lista de ubicaciones')
  const ubicaciones = json as Array<{ latitude: number; longitude: number; hourly?: Record<string, unknown>; hourly_units?: Record<string, string> }>
  if (ubicaciones.length !== celdas.length) throw new Error('Cantidad de ubicaciones distinta a la solicitada')
  const times = (ubicaciones[0]?.hourly?.time as string[]) ?? []
  if (!times.length) throw new Error('Pronóstico sin horas')
  const values = Object.fromEntries(VARIABLES_RADAR.map((v) => [v, []])) as unknown as LoteRadar['values']
  for (let i = 0; i < celdas.length; i++) {
    const h = ubicaciones[i].hourly
    if (!h) throw new Error('Ubicación sin datos horarios')
    for (const v of VARIABLES_RADAR) {
      const serie = h[v]
      if (!Array.isArray(serie) || serie.length !== times.length) throw new Error(`Serie inválida: ${v}`)
      values[v].push(serie.map((n) => typeof n === 'number' && Number.isFinite(n) ? n : null))
    }
  }
  return { times, cells: celdas.map((c, i) => ({ ...c, latModelo: ubicaciones[i].latitude, lonModelo: ubicaciones[i].longitude })), values, units: ubicaciones[0].hourly_units ?? {} }
}

export async function obtenerPronosticoRadar(params: { celdas: CeldaRadar[]; cupo: ControladorCupoOM | ((peso: number) => ControladorCupoOM); apiKey?: string; fetchImpl?: FetchImpl; esperar?: (ms: number) => Promise<void> }): Promise<{ lotes: LoteRadar[]; pesoTotal: number }> {
  const lotes: LoteRadar[] = []
  let pesoTotal = 0
  for (let i = 0; i < params.celdas.length; i += 100) {
    const grupo = params.celdas.slice(i, i + 100)
    const peso = grupo.length * Math.max(1, VARIABLES_RADAR.length / 10) * Math.max(1, 7 / 14)
    if (i > 0) await (params.esperar ?? ((ms) => new Promise((r) => setTimeout(r, ms))))(60_000)
    const base = construirBaseUrl('api', '/v1/forecast', params.apiKey)
    const url = new URL(base)
    url.searchParams.set('latitude', grupo.map((c) => c.lat).join(',')); url.searchParams.set('longitude', grupo.map((c) => c.lon).join(','))
    url.searchParams.set('hourly', VARIABLES_RADAR.join(',')); url.searchParams.set('forecast_days', '7'); url.searchParams.set('timezone', 'UTC'); url.searchParams.set('models', 'best_match')
    const cupo = typeof params.cupo === 'function' ? params.cupo(peso) : params.cupo
    const response = await ejecutarConReintentos({ url: agregarApiKey(url.toString(), params.apiKey), fetchImpl: params.fetchImpl, cupo, parsearPayload: (json) => validar(json, grupo) })
    if (!response.ok) throw new Error(`Open-Meteo ${response.motivo}: ${response.detalle}`)
    lotes.push(response.datos); pesoTotal += peso
  }
  return { lotes, pesoTotal }
}
