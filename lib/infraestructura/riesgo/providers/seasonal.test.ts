import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  MIEMBROS_TOTAL_SEASONAL,
  obtenerTendenciaEstacional,
  TAMANO_LOTE_DEPARTAMENTOS_SEASONAL,
} from './seasonal'
import { longitudesDeUrl } from './__fixtures__/url'

// Fixture REAL fechado (única request real permitida en este batch, ver
// registro.md): captura del endpoint Seasonal de Open-Meteo para el
// centroide de Capital (Corrientes), recortada a 100 días.
const fixtureReal = JSON.parse(
  readFileSync(new URL('../__fixtures__/hazard/seasonal-2026-09-27.json', import.meta.url), 'utf8'),
) as unknown as { daily: { time: string[] } & Record<string, unknown> }

const EMISION_EN = new Date('2026-09-27T00:00:00Z')

// Payload sintético por departamento: cada miembro reparte la longitud entre
// los días, de modo que el acumulado de la ventana [30,90] sea determinístico
// y fácil de aserir. El miembro de control siempre vale `base`; los
// perturbados varían por índice para poder testear la fracción que lo supera.
function payloadSeasonalParaLongitudes(
  longitudes: number[],
  dias: number,
): Array<{ daily: Record<string, unknown> }> {
  const time = Array.from({ length: dias }, (_, i) => {
    const fecha = new Date(EMISION_EN.getTime() + i * 86_400_000)
    return fecha.toISOString().slice(0, 10)
  })

  return longitudes.map((lon) => {
    const daily: Record<string, unknown> = { time }
    // Control: valor fijo `lon` cada día → acumulado ventana = lon * nDiasVentana.
    daily.precipitation_sum = Array.from({ length: dias }, () => lon)
    for (let m = 1; m <= 50; m++) {
      const nombre = `precipitation_sum_member${String(m).padStart(2, '0')}`
      // Miembros 1..25 quedan por debajo del control (lon - 1), 26..50 por
      // encima (lon + 1): exactamente 25/50 superan al control.
      const valorDiario = m <= 25 ? lon - 1 : lon + 1
      daily[nombre] = Array.from({ length: dias }, () => valorDiario)
    }
    return { daily }
  })
}

function centroidesSinteticos(cantidad: number) {
  return Array.from({ length: cantidad }, (_, indice) => ({
    departamento: `Depto-${indice}`,
    lat: -27,
    lon: indice + 1,
  }))
}

describe('obtenerTendenciaEstacional', () => {
  it('parsea el fixture real (52 columnas diarias: control + 50 miembros) sin lanzar', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => JSON.stringify(fixtureReal),
    })) as unknown as typeof fetch

    const { estadisticas, erroresPorDepartamento } = await obtenerTendenciaEstacional({
      centroides: [{ departamento: 'Capital', lat: -27.5223, lon: -58.7625 }],
      emisionEn: EMISION_EN,
      fetchImpl,
    })

    expect(erroresPorDepartamento).toEqual({})
    expect(estadisticas).toHaveLength(1)
    const [fila] = estadisticas
    expect(fila.departamento).toBe('Capital')
    expect(fila.variable).toBe('precipitacion_acumulada')
    expect(fila.emisionEn).toBe('2026-09-27')
    expect(fila.validoDesde).toBe('2026-10-27')
    expect(fila.validoHasta).toBe('2026-12-26')
    expect(fila.horizonteDesdeDias).toBe(30)
    expect(fila.horizonteHastaDias).toBe(90)
    expect(fila.miembrosTotal).toBe(MIEMBROS_TOTAL_SEASONAL)
    expect(fila.miembrosValidos).toBeGreaterThan(0)
    expect(fila.mediaMm).not.toBeNull()
    expect(fila.probabilidadSobreNormal).not.toBeNull()
    if (fila.probabilidadSobreNormal !== null) {
      expect(fila.probabilidadSobreNormal).toBeGreaterThanOrEqual(0)
      expect(fila.probabilidadSobreNormal).toBeLessThanOrEqual(1)
    }
  })

  it('calcula probabilidadSobreNormal como la fracción de miembros perturbados que superan al control', async () => {
    const centroides = centroidesSinteticos(1)
    const fetchImpl = vi.fn(async (url: string) => {
      const longitudes = longitudesDeUrl(url)
      const payload = payloadSeasonalParaLongitudes(longitudes, 100)
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        text: async () => JSON.stringify(payload),
      }
    }) as unknown as typeof fetch

    const { estadisticas } = await obtenerTendenciaEstacional({
      centroides,
      emisionEn: EMISION_EN,
      fetchImpl,
    })

    expect(estadisticas).toHaveLength(1)
    // 25 de los 50 miembros perturbados quedan por encima del control → 0.5.
    expect(estadisticas[0].probabilidadSobreNormal).toBeCloseTo(0.5, 5)
  })

  it('agrupa en lotes de TAMANO_LOTE_DEPARTAMENTOS_SEASONAL y aísla el error de un lote', async () => {
    const centroides = centroidesSinteticos(TAMANO_LOTE_DEPARTAMENTOS_SEASONAL + 2)
    // El primer lote falla con HTTP 500: ejecutarConReintentos reintenta hasta
    // agotar sus 3 intentos antes de darlo por perdido, así que ese lote solo
    // consume 3 llamadas antes de pasar al segundo lote (que sí responde ok).
    let llamada = 0
    let llamadasPrimerLote = 0
    const fetchImpl = vi.fn(async (url: string) => {
      llamada += 1
      if (llamadasPrimerLote < 3) {
        llamadasPrimerLote += 1
        return { ok: false, status: 500, headers: new Headers(), text: async () => 'error' }
      }
      const longitudes = longitudesDeUrl(url)
      const payload = payloadSeasonalParaLongitudes(longitudes, 100)
      return { ok: true, status: 200, headers: new Headers(), text: async () => JSON.stringify(payload) }
    }) as unknown as typeof fetch

    const { estadisticas, erroresPorDepartamento } = await obtenerTendenciaEstacional({
      centroides,
      emisionEn: EMISION_EN,
      fetchImpl,
    })

    expect(llamada).toBe(4)
    expect(Object.keys(erroresPorDepartamento)).toHaveLength(TAMANO_LOTE_DEPARTAMENTOS_SEASONAL)
    expect(estadisticas).toHaveLength(2)
  })

  it('un día null en cualquier miembro invalida el acumulado de ese miembro (no imputa 0)', async () => {
    const centroides = centroidesSinteticos(1)
    const fetchImpl = vi.fn(async (url: string) => {
      const longitudes = longitudesDeUrl(url)
      const payload = payloadSeasonalParaLongitudes(longitudes, 100)
      // Anula un día de un miembro perturbado dentro de la ventana [30,90].
      ;(payload[0].daily as Record<string, unknown[]>).precipitation_sum_member01[50] = null
      return { ok: true, status: 200, headers: new Headers(), text: async () => JSON.stringify(payload) }
    }) as unknown as typeof fetch

    const { estadisticas } = await obtenerTendenciaEstacional({
      centroides,
      emisionEn: EMISION_EN,
      fetchImpl,
    })

    // 50 miembros perturbados - 1 inválido = 49 válidos + control = 50 total.
    expect(estadisticas[0].miembrosValidos).toBe(50)
  })
})
