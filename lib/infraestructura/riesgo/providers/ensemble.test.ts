import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  calcularDispersion,
  contarProbabilidadSuperarUmbral,
  esperaEntreLotesEnsembleMs,
  obtenerProbabilidadesEnsemble,
  pesoLoteEnsemble,
  TAMANO_LOTE_COORDENADAS_ENSEMBLE,
} from './ensemble'
import type { HazardEnsembleProbPunto } from './ensemble'
import { longitudesDeUrl } from './__fixtures__/url'
import { fetchOk, fetchJsonPorUrl } from './__fixtures__/fetch'

const fixtureJson = JSON.parse(
  readFileSync(
    new URL('../__fixtures__/hazard/ensemble-2026-09-26.json', import.meta.url),
    'utf8',
  ),
) as unknown

const CORRIDA_EN = '2026-09-27T00:00:00Z'

const NOMBRES_MIEMBROS = [
  'precipitation',
  ...Array.from(
    { length: 50 },
    (_, indice) => `precipitation_member${String(indice + 1).padStart(2, '0')}`,
  ),
]

// Payload sintético por coordenada en el orden pedido: cada miembro reparte la
// longitud entre las horas, de modo que su acumulado de 24 h sea exactamente la
// longitud. latitude/longitude del cuerpo es señuelo a propósito: el provider
// debe emparejar por POSICIÓN, no por el lat/lon que devuelve la API.
function payloadEnsembleParaLongitudes(longitudes: number[], horas = 24) {
  const baseMs = Date.UTC(2026, 8, 27, 0)
  return longitudes.map((lon) => {
    const time = Array.from({ length: horas }, (_, i) =>
      new Date(baseMs + i * 3_600_000).toISOString().slice(0, 16),
    )
    const hourly: Record<string, unknown> = { time }
    for (const nombre of NOMBRES_MIEMBROS) {
      hourly[nombre] = Array.from({ length: horas }, () => lon / horas)
    }
    return { latitude: 999, longitude: 999, hourly }
  })
}

function celdasSinteticas(cantidad: number) {
  return Array.from({ length: cantidad }, (_, indice) => ({
    geometryRef: `-27_${indice}`,
    lat: -27,
    lon: indice,
  }))
}

function mapasUmbral(refs: string[], p95: number, p99: number) {
  return {
    umbralP95PorCelda: new Map(refs.map((ref) => [ref, p95])),
    umbralP99PorCelda: new Map(refs.map((ref) => [ref, p99])),
  }
}

function geometríasDe(puntos: HazardEnsembleProbPunto[]): string[] {
  return puntos.map((punto) => punto.geometryRef)
}

describe('contarProbabilidadSuperarUmbral', () => {
  it('calcula la probabilidad sobre los miembros válidos y descarta nulls', () => {
    const { probabilidad, miembrosValidos } = contarProbabilidadSuperarUmbral(
      [10, 20, 30, null, null, 5],
      15,
    )

    expect(miembrosValidos).toBe(4)
    expect(probabilidad).toBe(2 / 4)
  })

  it('no cuenta como superación el valor exactamente igual al umbral', () => {
    const { probabilidad, miembrosValidos } = contarProbabilidadSuperarUmbral([30, 31, null], 30)

    expect(miembrosValidos).toBe(2)
    expect(probabilidad).toBe(1 / 2)
  })

  it('con 0 miembros válidos devuelve probabilidad 0 y miembrosValidos 0 (sin dato)', () => {
    const { probabilidad, miembrosValidos } = contarProbabilidadSuperarUmbral([null, null], 10)

    expect(probabilidad).toBe(0)
    expect(miembrosValidos).toBe(0)
  })
})

describe('calcularDispersion', () => {
  it('devuelve 0 cuando todos los valores son iguales', () => {
    expect(calcularDispersion([10, 10, 10])).toBe(0)
  })

  it('calcula el desvío estándar poblacional de valores conocidos', () => {
    // media 10; varianza = ((0-10)² + 0² + (20-10)²) / 3 = 200/3
    expect(calcularDispersion([0, 10, 20])).toBeCloseTo(Math.sqrt(200 / 3), 10)
  })

  it('ignora los null y calcula sobre los válidos', () => {
    expect(calcularDispersion([0, 10, 20, null])).toBeCloseTo(Math.sqrt(200 / 3), 10)
  })

  it('devuelve 0 con 0 o 1 valores no-null', () => {
    expect(calcularDispersion([])).toBe(0)
    expect(calcularDispersion([5])).toBe(0)
    expect(calcularDispersion([null, null])).toBe(0)
    expect(calcularDispersion([7, null])).toBe(0)
  })
})

describe('obtenerProbabilidadesEnsemble', () => {
  it('procesa el fixture real de una celda y devuelve puntos con miembros válidos', async () => {
    const fetchImpl = fetchOk(fixtureJson)
    const geometryRef = '-27.5_-58.75'
    const { umbralP95PorCelda, umbralP99PorCelda } = mapasUmbral([geometryRef], 5, 20)

    const { puntos, erroresPorCelda } = await obtenerProbabilidadesEnsemble({
      geometryRefsConCoordenada: [{ geometryRef, lat: -27.5, lon: -58.75 }],
      corridaEn: CORRIDA_EN,
      acumuladoHoras: 24,
      umbralP95PorCelda,
      umbralP99PorCelda,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(erroresPorCelda).toEqual({})
    // 72 h de fixture -> 3 ventanas completas de 24 h.
    expect(puntos).toHaveLength(3)
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    for (const punto of puntos) {
      expect(punto.variable).toBe('precipitacion_24h')
      expect(punto.geometryRef).toBe(geometryRef)
      expect(punto.miembrosTotal).toBe(51)
      expect(punto.miembrosValidos).toBe(51)
      expect(punto.probabilidadP95).toBeGreaterThanOrEqual(0)
      expect(punto.probabilidadP95).toBeLessThanOrEqual(1)
      expect(punto.probabilidadP99).toBeGreaterThanOrEqual(0)
      expect(punto.probabilidadP99).toBeLessThanOrEqual(1)
      expect(punto.corridaEn).toBe(CORRIDA_EN)
      expect(punto.validoEn.endsWith('Z')).toBe(true)
      expect(punto.horizonteHoras).toBeGreaterThan(0)
    }
  })

  it('agrupa N celdas en exactamente ceil(N/TAMANO_LOTE_COORDENADAS_ENSEMBLE) llamadas', async () => {
    const fetchImpl = fetchJsonPorUrl((url) => payloadEnsembleParaLongitudes(longitudesDeUrl(url)))
    const celdas = celdasSinteticas(45)
    const { umbralP95PorCelda, umbralP99PorCelda } = mapasUmbral(
      celdas.map((c) => c.geometryRef),
      -1,
      -1,
    )

    const { puntos, erroresPorCelda } = await obtenerProbabilidadesEnsemble({
      geometryRefsConCoordenada: celdas,
      corridaEn: CORRIDA_EN,
      acumuladoHoras: 24,
      umbralP95PorCelda,
      umbralP99PorCelda,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(TAMANO_LOTE_COORDENADAS_ENSEMBLE).toBe(20)
    expect(fetchImpl).toHaveBeenCalledTimes(Math.ceil(45 / TAMANO_LOTE_COORDENADAS_ENSEMBLE))
    expect(erroresPorCelda).toEqual({})
    expect(puntos).toHaveLength(45)

    const porRef = new Map(puntos.map((punto) => [punto.geometryRef, punto]))
    expect(porRef.get('-27_0')?.probabilidadP95).toBe(1)
    expect(porRef.get('-27_44')?.probabilidadP95).toBe(1)
  })

  it('manda una celda sin climatología a erroresPorCelda sin romper las demás del lote', async () => {
    const fetchImpl = fetchJsonPorUrl((url) => payloadEnsembleParaLongitudes(longitudesDeUrl(url)))
    const celdas = celdasSinteticas(3)
    const { umbralP95PorCelda, umbralP99PorCelda } = mapasUmbral(['-27_0', '-27_2'], -1, -1)

    const { puntos, erroresPorCelda } = await obtenerProbabilidadesEnsemble({
      geometryRefsConCoordenada: celdas,
      corridaEn: CORRIDA_EN,
      acumuladoHoras: 24,
      umbralP95PorCelda,
      umbralP99PorCelda,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(erroresPorCelda).toEqual({ '-27_1': 'sin_climatologia' })
    expect(geometríasDe(puntos).sort()).toEqual(['-27_0', '-27_2'])
  })

  it('un lote caído no pierde los lotes exitosos', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const longitudes = longitudesDeUrl(url)
      // El primer lote (celdas 0..19) falla siempre con 500.
      if (longitudes[0] === 0) {
        return new Response('boom', { status: 500 })
      }
      return new Response(JSON.stringify(payloadEnsembleParaLongitudes(longitudes)), {
        status: 200,
      })
    })
    const celdas = celdasSinteticas(45)
    const { umbralP95PorCelda, umbralP99PorCelda } = mapasUmbral(
      celdas.map((c) => c.geometryRef),
      -1,
      -1,
    )

    const { puntos, erroresPorCelda } = await obtenerProbabilidadesEnsemble({
      geometryRefsConCoordenada: celdas,
      corridaEn: CORRIDA_EN,
      acumuladoHoras: 24,
      umbralP95PorCelda,
      umbralP99PorCelda,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    // El lote caído reintenta con backoff (3 intentos) y los otros dos lotes
    // hacen una llamada cada uno: al menos 3 invocaciones.
    expect(fetchImpl.mock.calls.length).toBeGreaterThanOrEqual(3)

    const refsConError = Object.keys(erroresPorCelda)
    expect(refsConError).toHaveLength(20)
    expect(refsConError.every((ref) => Number(ref.slice(4)) <= 19)).toBe(true)
    expect(Object.values(erroresPorCelda).every((detalle) => detalle.includes('http_error'))).toBe(
      true,
    )

    const refs = geometríasDe(puntos)
    expect(refs).toHaveLength(25)
    expect(refs).not.toContain('-27_0')
    expect(refs).not.toContain('-27_19')
    expect(refs).toContain('-27_20')
    expect(refs).toContain('-27_44')
  }, 15_000)
  it('un 429 corta los lotes restantes: no se consultan y quedan con rate_limited', async () => {
    const fetchImpl = vi.fn(async () => new Response('Minutely API request limit exceeded', { status: 429 }))
    const celdas = celdasSinteticas(45)
    const { umbralP95PorCelda, umbralP99PorCelda } = mapasUmbral(
      celdas.map((c) => c.geometryRef),
      -1,
      -1,
    )

    const { puntos, erroresPorCelda, llamadasRealizadas } = await obtenerProbabilidadesEnsemble({
      geometryRefsConCoordenada: celdas,
      corridaEn: CORRIDA_EN,
      acumuladoHoras: 24,
      umbralP95PorCelda,
      umbralP99PorCelda,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      controladorCupoFactory: () => ({
        reservar: async () => ({ ok: true, esperoMs: 0 }),
        registrar429: async () => {},
      }),
      esperar: async () => {},
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(llamadasRealizadas).toBe(1)
    expect(puntos).toEqual([])
    expect(Object.keys(erroresPorCelda)).toHaveLength(45)
    expect(Object.values(erroresPorCelda).every((detalle) => detalle.startsWith('rate_limited'))).toBe(true)
  })

  it('reserva cupo contando los 51 miembros como variables, igual que Open-Meteo', async () => {
    const fetchImpl = fetchJsonPorUrl((url) => payloadEnsembleParaLongitudes(longitudesDeUrl(url)))
    const celdas = celdasSinteticas(45)
    const { umbralP95PorCelda, umbralP99PorCelda } = mapasUmbral(
      celdas.map((c) => c.geometryRef),
      -1,
      -1,
    )
    const pesos: number[] = []

    await obtenerProbabilidadesEnsemble({
      geometryRefsConCoordenada: celdas,
      corridaEn: CORRIDA_EN,
      acumuladoHoras: 24,
      umbralP95PorCelda,
      umbralP99PorCelda,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      controladorCupoFactory: (peso) => {
        pesos.push(peso)
        return { reservar: async () => ({ ok: true, esperoMs: 0 }), registrar429: async () => {} }
      },
      esperar: async () => {},
    })

    // 20 ubicaciones × max(1, 51/10) × max(1, 3/14) = 102 por lote completo.
    expect(pesos).toEqual([
      pesoLoteEnsemble(20),
      pesoLoteEnsemble(20),
      pesoLoteEnsemble(5),
    ])
    expect(pesoLoteEnsemble(20)).toBeCloseTo(102, 10)
  })

  it('con guarda de cupo espacia los lotes para no superar el límite por minuto', async () => {
    const fetchImpl = fetchJsonPorUrl((url) => payloadEnsembleParaLongitudes(longitudesDeUrl(url)))
    const celdas = celdasSinteticas(45)
    const { umbralP95PorCelda, umbralP99PorCelda } = mapasUmbral(
      celdas.map((c) => c.geometryRef),
      -1,
      -1,
    )
    const esperar = vi.fn(async (_ms: number) => {})

    await obtenerProbabilidadesEnsemble({
      geometryRefsConCoordenada: celdas,
      corridaEn: CORRIDA_EN,
      acumuladoHoras: 24,
      umbralP95PorCelda,
      umbralP99PorCelda,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      controladorCupoFactory: () => ({
        reservar: async () => ({ ok: true, esperoMs: 0 }),
        registrar429: async () => {},
      }),
      esperar,
    })

    // Antes del 2do y del 3er lote: 102 / 480 por minuto = 12,75 s.
    expect(esperar.mock.calls.map(([ms]) => ms)).toEqual([12_750, 12_750])
    expect(esperaEntreLotesEnsembleMs(20, false)).toBe(12_750)
  })
})
