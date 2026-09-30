import { describe, expect, it, vi } from 'vitest'
import { obtenerPronosticoRadar, VARIABLES_RADAR } from './provider'
import type { CeldaRadar } from './grilla'

const celdas = (n: number): CeldaRadar[] => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, row: i, col: i, lat: -28, lon: -58 }))
function respuesta(cantidad: number) {
  return Array.from({ length: cantidad }, (_, i) => ({ latitude: -28, longitude: -58, hourly: { time: ['2026-01-01T00:00', '2026-01-01T01:00'], ...Object.fromEntries(VARIABLES_RADAR.map((v) => [v, [i, null]])) }, hourly_units: { precipitation: 'mm' } }))
}
const cupo = { reservar: vi.fn(async () => ({ ok: true as const, esperoMs: 0 })), registrar429: vi.fn(async () => {}) }

describe('provider radar Open-Meteo', () => {
  it('divide en lotes de hasta 100, reserva cupo antes de cada llamada y parsea valores nulos', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input)), cantidad = url.searchParams.get('latitude')!.split(',').length
      return new Response(JSON.stringify(respuesta(cantidad)), { status: 200 })
    }) as unknown as typeof fetch
    const resultado = await obtenerPronosticoRadar({ celdas: celdas(205), cupo: () => cupo, fetchImpl, esperar: async () => {} })
    expect(resultado.lotes.map((l) => l.cells.length)).toEqual([100, 100, 5])
    expect(resultado.pesoTotal).toBe(205)
    expect(cupo.reservar).toHaveBeenCalledTimes(3)
    expect(resultado.lotes[0].values.precipitation[0]).toEqual([0, null])
    expect(new URL(String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0])).searchParams.get('timezone')).toBe('UTC')
  })
})
