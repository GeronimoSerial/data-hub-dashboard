import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import type * as Ruta from './route'
import type * as Seed from '@/lib/db/seed'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb } from '@/lib/db'
import {
  hazardClimatology,
  hazardForecast,
  hazardObservation,
} from '@/lib/db/schema'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import {
  obtenerNivelCaudal,
  obtenerNivelesPeligro,
  type NivelCaudalPunto,
  type NivelPeligro,
  type NivelPeligroCelda,
} from '@/lib/infraestructura/riesgo/peligro/nivel'
import {
  mockAcceso,
  USER,
} from '@/lib/infraestructura/riesgo/__fixtures__/motor-api'
import { ensureSeeded } from '@/lib/db/seed'

// Factory puro (sin importOriginal) para no arrastrar @/lib/session -> @/lib/db
// antes de que el beforeAll fije DATA_DIR.
vi.mock('@/lib/infraestructura/acceso-lectura', () => ({
  verificarAccesoLectura: vi.fn(),
}))

vi.mock('@/lib/db/seed', async (importOriginal) => {
  const original = await importOriginal<typeof Seed>()
  return { ...original, ensureSeeded: vi.fn(original.ensureSeeded) }
})

// La capa de nivel se mockea: insertar ensemble/climatología de nivel en la DB
// real rompería los conteos de los tests existentes de pronostico/climatologia.
// Así se verifica que la ruta la invoque con los argumentos correctos.
vi.mock('@/lib/infraestructura/riesgo/peligro/nivel', () => ({
  obtenerNivelesPeligro: vi.fn(),
  obtenerNivelCaudal: vi.fn(),
}))

const CELDA = '-31.7_-60.5'
const OTRA_CELDA = '-32.0_-61.0'

usarDbTemporal('peligro-route-')

beforeAll(async () => {
  await getDb()
    .insert(hazardForecast)
    .values([
      {
        id: 'f1',
        provider: 'open-meteo',
        variable: 'precipitacion',
        geometryRef: CELDA,
        corridaEn: '2026-01-01T00:00:00Z',
        validoEn: '2026-01-01T06:00:00Z',
        horizonteHoras: 6,
        valor: 12.5,
        unidad: 'mm',
        pasoHoras: 6,
        rawRef: null,
        ingeridoEn: '2026-01-01T00:10:00Z',
      },
      {
        id: 'f2',
        provider: 'open-meteo',
        variable: 'precipitacion',
        geometryRef: CELDA,
        corridaEn: '2026-01-01T00:00:00Z',
        validoEn: '2026-01-01T12:00:00Z',
        horizonteHoras: 12,
        valor: 3.1,
        unidad: 'mm',
        pasoHoras: 6,
        rawRef: null,
        ingeridoEn: '2026-01-01T00:10:00Z',
      },
      {
        id: 'f3',
        provider: 'inameh',
        variable: 'precipitacion',
        geometryRef: OTRA_CELDA,
        corridaEn: '2026-01-01T00:00:00Z',
        validoEn: '2026-01-01T06:00:00Z',
        horizonteHoras: 6,
        valor: 9.9,
        unidad: 'mm',
        pasoHoras: 6,
        rawRef: null,
        ingeridoEn: '2026-01-01T00:10:00Z',
      },
    ])

  await getDb()
    .insert(hazardClimatology)
    .values([
      {
        id: 'c1-p90',
        geometryRef: CELDA,
        variable: 'precipitacion',
        percentil: 'p90',
        muestra: 'dias_humedos',
        valor: 35,
        unidad: 'mm',
        periodoDesde: '1991-01-01',
        periodoHasta: '2020-12-31',
        version: 'v1',
        calculadoEn: '2026-01-01T00:00:00Z',
      },
      {
        id: 'c1',
        geometryRef: CELDA,
        variable: 'precipitacion',
        percentil: 'p95',
        muestra: 'dias_humedos',
        valor: 40,
        unidad: 'mm',
        periodoDesde: '1991-01-01',
        periodoHasta: '2020-12-31',
        version: 'v1',
        calculadoEn: '2026-01-01T00:00:00Z',
      },
      {
        id: 'c1-p99',
        geometryRef: CELDA,
        variable: 'precipitacion',
        percentil: 'p99',
        muestra: 'dias_humedos',
        valor: 50,
        unidad: 'mm',
        periodoDesde: '1991-01-01',
        periodoHasta: '2020-12-31',
        version: 'v1',
        calculadoEn: '2026-01-01T00:00:00Z',
      },
      {
        id: 'c2-p90',
        geometryRef: OTRA_CELDA,
        variable: 'precipitacion',
        percentil: 'p90',
        muestra: 'dias_humedos',
        valor: 25,
        unidad: 'mm',
        periodoDesde: '1991-01-01',
        periodoHasta: '2020-12-31',
        version: 'v1',
        calculadoEn: '2026-01-01T00:00:00Z',
      },
      {
        id: 'c2',
        geometryRef: OTRA_CELDA,
        variable: 'precipitacion',
        percentil: 'p95',
        muestra: 'dias_humedos',
        valor: 30,
        unidad: 'mm',
        periodoDesde: '1991-01-01',
        periodoHasta: '2020-12-31',
        version: 'v1',
        calculadoEn: '2026-01-01T00:00:00Z',
      },
      {
        id: 'c2-p99',
        geometryRef: OTRA_CELDA,
        variable: 'precipitacion',
        percentil: 'p99',
        muestra: 'dias_humedos',
        valor: 40,
        unidad: 'mm',
        periodoDesde: '1991-01-01',
        periodoHasta: '2020-12-31',
        version: 'v1',
        calculadoEn: '2026-01-01T00:00:00Z',
      },
    ])

  await getDb()
    .insert(hazardObservation)
    .values([
      obs('o1', CELDA, 1.1, '2026-01-01T01:00:00Z'),
      obs('o2', CELDA, 2.2, '2026-01-01T02:00:00Z'),
      obs('o3', CELDA, 3.3, '2026-01-01T03:00:00Z'),
      obs('o4', CELDA, 4.4, '2026-01-01T04:00:00Z'),
      obs('o5', CELDA, 5.5, '2026-01-01T05:00:00Z'),
      obs('o6', CELDA, 6.6, '2026-01-01T06:00:00Z'),
      obs('o7', OTRA_CELDA, 9.9, '2026-01-01T07:00:00Z'),
    ])
  GET = (await import('./route')).GET
})

function obs(id: string, geometryRef: string, valor: number, observadoEn: string) {
  return {
    id,
    provider: 'nasa-gpm',
    variable: 'precipitacion',
    geometryRef,
    valor,
    unidad: 'mm',
    observadoEn,
    validoDesde: observadoEn,
    validoHasta: observadoEn,
    calidad: null,
    rawRef: null,
    ingeridoEn: '2026-01-01T08:00:00Z',
  }
}

beforeEach(() => {
  vi.mocked(verificarAccesoLectura).mockReset()
  vi.mocked(obtenerNivelesPeligro).mockReset()
  vi.mocked(obtenerNivelCaudal).mockReset()
  vi.mocked(ensureSeeded).mockReset()
  vi.mocked(obtenerNivelesPeligro).mockResolvedValue([])
  vi.mocked(obtenerNivelCaudal).mockResolvedValue(null)
})

function req(qs = '') {
  return new Request(`http://localhost/api/infraestructura/peligro${qs}`)
}

function nivelCelda(
  geometryRef: string,
  horizonteHoras: 24 | 72 | 240,
  nivel: NivelPeligro,
): NivelPeligroCelda {
  return {
    geometryRef,
    horizonteHoras,
    nivel,
    base: 'ensemble',
    probabilidadP95: null,
    probabilidadP99: null,
    precipitacionMm: null,
    percentilReferencia: null,
    emitidoEn: '2026-01-01T00:00:00Z',
    validoHasta: '2026-01-02T00:00:00Z',
    versionRegla: 'peligro-v0.1',
  }
}

let GET: typeof Ruta.GET

describe('GET /api/infraestructura/peligro', () => {
  it.each([
    ['rechaza sin sesión con 401', 401],
    ['rechaza con sesión pero sin acceso al recurso con 403', 403],
  ] as const)('%s', async (_titulo, status) => {
    mockAcceso({ ok: false, status })
    const res = await GET(req())
    expect(res.status).toBe(status)
    expect(ensureSeeded).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body.pronostico).toBeUndefined()
  })

  it('sin geometryRef devuelve todas las celdas con pronostico ordenado por validoEn', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')

    const body = await res.json()
    expect(body.pronostico).toHaveLength(3)
    expect(body.climatologia).toHaveLength(6)
    expect(new Set(body.pronostico.map((row: { geometryRef: string }) => row.geometryRef))).toEqual(
      new Set([CELDA, OTRA_CELDA]),
    )
    expect(new Set(body.climatologia.map((row: { geometryRef: string }) => row.geometryRef))).toEqual(
      new Set([CELDA, OTRA_CELDA]),
    )

    const validos = body.pronostico.map((p: { validoEn: string }) => p.validoEn)
    expect(validos).toEqual([...validos].sort())

    const fila = body.pronostico.find((p: { validoEn: string }) => p.validoEn === '2026-01-01T06:00:00Z')
    expect(fila.geometryRef).toBeTypeOf('string')
    expect(fila.provider).toBeTypeOf('string')
    expect(fila.valor).toBeTypeOf('number')
    expect(fila.pasoHoras).toBeTypeOf('number')
    // La forma pública no expone columnas internas como rawRef/ingeridoEn.
    expect(fila.rawRef).toBeUndefined()
  })

  it('filtra pronostico y climatologia por geometryRef', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(req(`?geometryRef=${encodeURIComponent(CELDA)}`))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.pronostico).toHaveLength(2)
    expect(body.climatologia).toHaveLength(3)
    expect(
      body.pronostico.every((p: { geometryRef: string }) => p.geometryRef === CELDA),
    ).toBe(true)
  })

  it('con geometryRef devuelve los 3 horizontes de nivel de peligro', async () => {
    mockAcceso({ ok: true, user: USER })
    vi.mocked(obtenerNivelesPeligro).mockResolvedValue([
      nivelCelda(CELDA, 24, 'verde'),
      nivelCelda(CELDA, 72, 'amarillo'),
      nivelCelda(CELDA, 240, 'sin_dato'),
    ])
    const res = await GET(req(`?geometryRef=${encodeURIComponent(CELDA)}`))
    expect(res.status).toBe(200)

    expect(obtenerNivelesPeligro).toHaveBeenCalledWith({ geometryRefs: [CELDA] })
    const body = await res.json()
    expect(body.niveles).toHaveLength(3)
    expect(
      body.niveles.map((n: NivelPeligroCelda) => n.horizonteHoras),
    ).toEqual([24, 72, 240])
    expect(body.niveles[0]).toMatchObject({
      geometryRef: CELDA,
      horizonteHoras: 24,
      nivel: 'verde',
      base: 'ensemble',
      versionRegla: 'peligro-v0.1',
    })
  })

  it('sin geometryRef no calcula niveles (arreglo vacío, no consulta el padrón)', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.niveles).toEqual([])
    expect(obtenerNivelesPeligro).not.toHaveBeenCalled()
  })

  it('con puntoRioId devuelve el nivel de caudal del punto', async () => {
    mockAcceso({ ok: true, user: USER })
    const caudal: NivelCaudalPunto = {
      puntoId: 'rio-1',
      percentilActual: 95,
      nivel: 'naranja',
      emitidoEn: '2026-01-01T00:00:00Z',
      validoHasta: '2026-01-02T00:00:00Z',
    }
    vi.mocked(obtenerNivelCaudal).mockResolvedValue(caudal)
    const res = await GET(req('?puntoRioId=rio-1'))
    expect(res.status).toBe(200)

    expect(obtenerNivelCaudal).toHaveBeenCalledWith('rio-1')
    const body = await res.json()
    expect(body.caudal).toEqual(caudal)
  })

  it('sin puntoRioId devuelve caudal null', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.caudal).toBeNull()
    expect(obtenerNivelCaudal).not.toHaveBeenCalled()
  })

  it('con geometryRef devuelve como máximo 5 observaciones, más recientes primero', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(req(`?geometryRef=${encodeURIComponent(CELDA)}`))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.observado).toHaveLength(5)
    expect(
      body.observado.every(
        (o: { geometryRef: string }) => o.geometryRef === CELDA,
      ),
    ).toBe(true)
    expect(body.observado[0]).toMatchObject({
      geometryRef: CELDA,
      provider: 'nasa-gpm',
      variable: 'precipitacion',
      valor: 6.6,
      unidad: 'mm',
      observadoEn: '2026-01-01T06:00:00Z',
    })
    const instantes = body.observado.map(
      (o: { observadoEn: string }) => o.observadoEn,
    )
    expect(instantes).toEqual([...instantes].sort().reverse())
  })

  it('sin geometryRef no consulta observaciones (arreglo vacío)', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.observado).toEqual([])
  })

  it('sin geometryRef tampoco calcula acumulados observados (arreglo vacío)', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.observadoAcumulado).toEqual([])
  })

  it('con geometryRef expone observadoAcumulado (24h/72h) con cobertura explícita, campo additivo', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(req(`?geometryRef=${encodeURIComponent(CELDA)}`))
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.observadoAcumulado).toHaveLength(2)
    const horizontes = body.observadoAcumulado.map(
      (a: { horizonteHoras: number }) => a.horizonteHoras,
    )
    expect(horizontes).toEqual([24, 72])
    // Los fixtures de este archivo son `provider: 'nasa-gpm'`/`variable:
    // 'precipitacion'` (observación puntual "cruda" de otro test), no
    // `nasa-imerg`/`precipitacion_observada_satelital`: sin gránulos que
    // matcheen, el acumulado es explícitamente sin dato, nunca 0 inventado.
    for (const acumulado of body.observadoAcumulado) {
      expect(acumulado.acumuladoMm).toBeNull()
      expect(acumulado.granulosEncontrados).toBe(0)
      expect(acumulado.cobertura).toBe(0)
    }
    // El resto de la respuesta sigue intacta (contrato additivo).
    expect(body.observado).toHaveLength(5)
    expect(body.pronostico).toHaveLength(2)
  })

  it('rechaza puntoRioId inválido con 400', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(req('?puntoRioId='))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('puntoRioId inválido')
  })

  it('rechaza geometryRef inválido con 400', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await GET(req('?geometryRef='))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('geometryRef inválido')
    expect(body.pronostico).toBeUndefined()
  })

  it('excluye corridas históricas en SQL y conserva todos los pasos de la última corrida', async () => {
    mockAcceso({ ok: true, user: USER })
    const geometryRef = '-33.1_-62.4'
    const historico = Array.from({ length: 40 }, (_, indice) => {
      const corridaEn = new Date(Date.UTC(2026, 0, 1 + indice)).toISOString()
      return [6, 12].map((horizonteHoras) => ({
        id: `historical-${indice}-${horizonteHoras}`,
        provider: 'open-meteo',
        variable: 'precipitacion',
        geometryRef,
        corridaEn,
        validoEn: new Date(Date.parse(corridaEn) + horizonteHoras * 3_600_000).toISOString(),
        horizonteHoras,
        valor: indice,
        unidad: 'mm',
        pasoHoras: 6,
        rawRef: null,
        ingeridoEn: corridaEn,
      }))
    }).flat()
    const corridaActual = '2026-09-01T00:00:00.000Z'
    await getDb().insert(hazardForecast).values([
      ...historico,
      ...[6, 12, 24].map((horizonteHoras) => ({
        id: `current-${horizonteHoras}`,
        provider: 'open-meteo',
        variable: 'precipitacion',
        geometryRef,
        corridaEn: corridaActual,
        validoEn: new Date(Date.parse(corridaActual) + horizonteHoras * 3_600_000).toISOString(),
        horizonteHoras,
        valor: horizonteHoras,
        unidad: 'mm',
        pasoHoras: 6,
        rawRef: null,
        ingeridoEn: corridaActual,
      })),
    ])

    try {
      const res = await GET(req(`?geometryRef=${encodeURIComponent(geometryRef)}`))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.pronostico).toHaveLength(3)
      expect(body.pronostico.map((row: { horizonteHoras: number }) => row.horizonteHoras)).toEqual([6, 12, 24])
      expect(body.pronostico.every((row: { corridaEn: string }) => row.corridaEn === corridaActual)).toBe(true)
    } finally {
      await getDb().delete(hazardForecast).where(eq(hazardForecast.geometryRef, geometryRef))
    }
  })

  it('devuelve sólo la última climatología completa por celda y variable', async () => {
    mockAcceso({ ok: true, user: USER })
    const geometryRef = '-33.2_-62.5'
    const makeClimatology = (
      prefix: string,
      version: string,
      periodoHasta: string,
      calculadoEn: string,
      values: number[],
      percentiles = ['p90', 'p95', 'p99'],
      muestra = 'dias_humedos',
    ) => percentiles.map((percentil) => ({
      id: `${prefix}-${percentil}`,
      geometryRef,
      variable: 'precipitacion',
      percentil,
      muestra,
      valor: values[['p90', 'p95', 'p99'].indexOf(percentil)],
      unidad: 'mm',
      periodoDesde: '1991-01-01',
      periodoHasta,
      version,
      calculadoEn,
    }))

    await getDb().insert(hazardClimatology).values([
      ...makeClimatology('clim-old', 'v1', '2010-12-31', '2020-01-01T00:00:00Z', [10, 20, 30]),
      ...makeClimatology(
        'clim-current',
        'climatologia-imerg-v2',
        '2020-12-31',
        '2026-09-01T00:00:00Z',
        [70, 80, 90],
      ),
      ...makeClimatology(
        'clim-current-all-days',
        'climatologia-imerg-v2',
        '2020-12-31',
        '2026-09-01T00:00:00Z',
        [7, 8, 9],
        ['p99', 'p95', 'p90'],
        'todos_los_dias',
      ),
      ...makeClimatology(
        'clim-incomplete',
        'climatologia-imerg-v3',
        '2021-12-31',
        '2026-10-01T00:00:00Z',
        [100, 110],
        ['p90', 'p95'],
      ),
    ])

    try {
      const res = await GET(req(`?geometryRef=${encodeURIComponent(geometryRef)}`))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.climatologia).toHaveLength(6)
      expect(body.climatologia.map((row: { muestra: string; percentil: string; valor: number }) =>
        `${row.muestra}:${row.percentil}:${row.valor}`,
      )).toEqual([
        'todos_los_dias:p90:7',
        'todos_los_dias:p95:8',
        'todos_los_dias:p99:9',
        'dias_humedos:p90:70',
        'dias_humedos:p95:80',
        'dias_humedos:p99:90',
      ])
    } finally {
      await getDb().delete(hazardClimatology).where(eq(hazardClimatology.geometryRef, geometryRef))
    }
  })
})
