import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import {
  hazardClimatology,
  hazardEnsembleProb,
  hazardForecast,
  infraGeoProfile,
} from '@/lib/db/schema'
import { nivelDesdeUmbralProvisorio } from './umbrales-provisorios'
import { filaClimatologia, filaEnsemble, filaPronostico, insertarClimatologia } from './__fixtures__/filas'
import type { getDb as GetDb } from '@/lib/db'
import type {
  agregarNivelPorDepartamento as AgregarNivelPorDepartamento,
  nivelDesdeDeterministico as NivelDesdeDeterministico,
  nivelDesdeEnsemble as NivelDesdeEnsemble,
  NivelPeligroCelda,
  obtenerNivelCaudal as ObtenerNivelCaudal,
  obtenerNivelesPeligro as ObtenerNivelesPeligro,
} from './nivel'

usarDbTemporal('nivel-peligro-')

beforeAll(async () => {
  const { getDb } = await import('@/lib/db')
  db = getDb()

  ;({
    nivelDesdeEnsemble,
    nivelDesdeDeterministico,
    obtenerNivelesPeligro,
    obtenerNivelCaudal,
    agregarNivelPorDepartamento,
  } = await import('./nivel'))
})

let db: ReturnType<typeof GetDb>
let nivelDesdeEnsemble: typeof NivelDesdeEnsemble
let nivelDesdeDeterministico: typeof NivelDesdeDeterministico
let obtenerNivelesPeligro: typeof ObtenerNivelesPeligro
let obtenerNivelCaudal: typeof ObtenerNivelCaudal
let agregarNivelPorDepartamento: typeof AgregarNivelPorDepartamento

const CORRIDA_NUEVA = '2026-09-26T00:00:00.000Z'
const CORRIDA_VIEJA = '2026-09-25T00:00:00.000Z'

function nivelEsperado(
  over: Partial<NivelPeligroCelda> &
    Pick<NivelPeligroCelda, 'geometryRef' | 'horizonteHoras' | 'nivel' | 'base' | 'metodo' | 'validoHasta'>,
): NivelPeligroCelda {
  const { geometryRef, horizonteHoras, nivel, base, metodo, validoHasta, ...overrides } = over
  return {
    geometryRef,
    horizonteHoras,
    nivel,
    base,
    metodo,
    probabilidadP95: null,
    probabilidadP99: null,
    precipitacionMm: null,
    percentilReferencia: null,
    emitidoEn: CORRIDA_NUEVA,
    validoHasta,
    versionRegla: 'peligro-v0.2',
    ...overrides,
  }
}

beforeEach(async () => {
  await db.delete(hazardEnsembleProb)
  await db.delete(hazardForecast)
  await db.delete(hazardClimatology)
  await db.delete(infraGeoProfile)
})

describe('nivelDesdeEnsemble', () => {
  it.each([
    ['P99 exactamente 0.5 ya es rojo (borde >=, la mayoría supera P99)', 0.9, 0.5, 'rojo'],
    ['P99 apenas por debajo de 0.5 con P95 >= 0.5 es naranja', 0.5, 0.499999, 'naranja'],
    ['P95 exactamente 0.5 con P99 bajo es naranja (borde >=)', 0.5, 0.1, 'naranja'],
    ['P95 apenas por debajo de 0.5 cae a amarillo', 0.499999, 0.499999, 'amarillo'],
    ['P95 exactamente 0.1 es verde (borde >, la probabilidad trivial no pinta)', 0.1, 0, 'verde'],
    ['P95 apenas por encima de 0.1 es amarillo', 0.100001, 0, 'amarillo'],
    ['sin superar ningún umbral es verde', 0, 0, 'verde'],
  ])('%s', (_titulo, p95, p99, esperado) => {
    expect(nivelDesdeEnsemble(p95, p99)).toBe(esperado)
  })
})

describe('nivelDesdeDeterministico', () => {
  const P90 = 10
  const P95 = 20
  const P99 = 30

  it.each([
    ['igual a p90 todavía es verde (umbral estricto)', 10, { nivel: 'verde', percentilReferencia: null }],
    ['apenas por encima de p90 es amarillo con percentil P90', 10.001, { nivel: 'amarillo', percentilReferencia: 'P90' }],
    ['igual a p95 todavía es amarillo, no naranja', 20, { nivel: 'amarillo', percentilReferencia: 'P90' }],
    ['apenas por encima de p95 es naranja con percentil P95', 20.001, { nivel: 'naranja', percentilReferencia: 'P95' }],
    ['igual a p99 todavía es naranja, no rojo', 30, { nivel: 'naranja', percentilReferencia: 'P95' }],
    ['apenas por encima de p99 es rojo con percentil P99', 30.001, { nivel: 'rojo', percentilReferencia: 'P99' }],
  ])('%s', (_titulo, valor, esperado) => {
    expect(nivelDesdeDeterministico(valor, P90, P95, P99)).toEqual(esperado)
  })
})

describe('nivelDesdeUmbralProvisorio', () => {
  const CASOS: Array<[string, Array<[number, 24 | 72 | 240, string]>]> = [
    ['24h: los umbrales exactos no se superan (borde estricto)', [[50, 24, 'verde'], [80, 24, 'amarillo'], [120, 24, 'naranja']]],
    ['24h: un mm más que cada umbral SÍ lo supera', [[50.001, 24, 'amarillo'], [80.001, 24, 'naranja'], [120.001, 24, 'rojo']]],
    ['72h: los umbrales exactos no se superan y un mm más sí', [[80, 72, 'verde'], [80.001, 72, 'amarillo'], [120, 72, 'amarillo'], [120.001, 72, 'naranja'], [180, 72, 'naranja'], [180.001, 72, 'rojo']]],
    ['240h: derivados de 72h ×1.5 (120/180/270), bordes estrictos', [[120, 240, 'verde'], [120.001, 240, 'amarillo'], [180, 240, 'amarillo'], [180.001, 240, 'naranja'], [270, 240, 'naranja'], [270.001, 240, 'rojo']]],
    ['por debajo del primer umbral es verde', [[0, 24, 'verde'], [49.999, 24, 'verde']]],
  ]

  it.each(CASOS)('%s', (_titulo, casos) => {
    for (const [valor, horizonte, esperado] of casos) {
      expect(nivelDesdeUmbralProvisorio(valor, horizonte)).toBe(esperado)
    }
  })
})

describe('obtenerNivelesPeligro', () => {
  it('usa el ensemble en 24 h: corrida más reciente y horizonte más cercano al pedido', async () => {
    await db.insert(hazardEnsembleProb).values([
      filaEnsemble({
        geometryRef: 'celda-a',
        corridaEn: CORRIDA_VIEJA,
        validoEn: '2026-09-26T00:00:00.000Z',
        horizonteHoras: 24,
        probabilidadP95: 0.05,
        probabilidadP99: 0.01,
      }),
      filaEnsemble({
        geometryRef: 'celda-a',
        corridaEn: CORRIDA_NUEVA,
        validoEn: '2026-09-26T23:00:00.000Z',
        horizonteHoras: 23,
        probabilidadP95: 0.6,
        probabilidadP99: 0.1,
      }),
      filaEnsemble({
        geometryRef: 'celda-a',
        corridaEn: CORRIDA_NUEVA,
        validoEn: '2026-09-27T06:00:00.000Z',
        horizonteHoras: 30,
        probabilidadP95: 0.9,
        probabilidadP99: 0.9,
      }),
    ])

    const resultado = await obtenerNivelesPeligro({ geometryRefs: ['celda-a'], horizontes: [24] })

    expect(resultado).toEqual([
      nivelEsperado({
        geometryRef: 'celda-a',
        horizonteHoras: 24,
        nivel: 'naranja',
        base: 'ensemble',
        metodo: 'percentiles',
        probabilidadP95: 0.6,
        probabilidadP99: 0.1,
        percentilReferencia: 'P95',
        validoHasta: '2026-09-26T23:00:00.000Z',
      }),
    ])
  })

  it('regresión (hallazgo de revisión A): ensemble con 0 miembros válidos NO es verde, cae a sin_dato/determinístico', async () => {
    await db.insert(hazardEnsembleProb).values({
      ...filaEnsemble({
        geometryRef: 'celda-0-miembros',
        corridaEn: CORRIDA_NUEVA,
        validoEn: '2026-09-26T23:00:00.000Z',
        horizonteHoras: 24,
        probabilidadP95: 0,
        probabilidadP99: 0,
      }),
      miembrosValidos: 0,
    })

    const resultado = await obtenerNivelesPeligro({
      geometryRefs: ['celda-0-miembros'],
      horizontes: [24],
    })

    expect(resultado[0].base).not.toBe('ensemble')
    expect(resultado[0].nivel).toBe('sin_dato')
  })

  it('cae al determinístico cuando la celda no tiene ensemble', async () => {
    await db.insert(hazardForecast).values(
      filaPronostico({
        geometryRef: 'celda-b',
        variable: 'precipitacion',
        corridaEn: CORRIDA_NUEVA,
        validoEn: '2026-09-27T00:00:00.000Z',
        horizonteHoras: 24,
        valor: 25,
      }),
    )
    await insertarClimatologia(db, 'celda-b', 'precipitacion_diaria', { p90: 10, p95: 20, p99: 30 })

    const resultado = await obtenerNivelesPeligro({ geometryRefs: ['celda-b'], horizontes: [24] })

    expect(resultado).toEqual([
      nivelEsperado({
        geometryRef: 'celda-b',
        horizonteHoras: 24,
        nivel: 'naranja',
        base: 'deterministico',
        metodo: 'percentiles',
        precipitacionMm: 25,
        percentilReferencia: 'P95',
        validoHasta: '2026-09-27T00:00:00.000Z',
      }),
    ])
  })

  it('sin climatología pero con pronóstico usa el umbral provisorio (base determinístico)', async () => {
    await db.insert(hazardForecast).values(
      filaPronostico({
        geometryRef: 'celda-provisoria',
        variable: 'precipitacion',
        corridaEn: CORRIDA_NUEVA,
        validoEn: '2026-09-27T00:00:00.000Z',
        horizonteHoras: 24,
        valor: 90,
      }),
    )

    const resultado = await obtenerNivelesPeligro({
      geometryRefs: ['celda-provisoria'],
      horizontes: [24],
    })

    expect(resultado).toEqual([
      nivelEsperado({
        geometryRef: 'celda-provisoria',
        horizonteHoras: 24,
        nivel: 'naranja',
        base: 'deterministico',
        metodo: 'umbral_provisorio',
        precipitacionMm: 90,
        percentilReferencia: null,
        validoHasta: '2026-09-27T00:00:00.000Z',
      }),
    ])
  })

  it('con climatología NO mezcla: el valor cruzaría el umbral provisorio pero manda percentiles', async () => {
    await db.insert(hazardForecast).values(
      filaPronostico({
        geometryRef: 'celda-mixta',
        variable: 'precipitacion',
        corridaEn: CORRIDA_NUEVA,
        validoEn: '2026-09-27T00:00:00.000Z',
        horizonteHoras: 24,
        valor: 60,
      }),
    )
    // 60 mm supera el umbral provisorio de 24h (>50 => amarillo), pero contra
    // esta climatología supera P99 => rojo. Debe ganar el percentil.
    await insertarClimatologia(db, 'celda-mixta', 'precipitacion_diaria', {
      p90: 10,
      p95: 20,
      p99: 30,
    })

    const resultado = await obtenerNivelesPeligro({
      geometryRefs: ['celda-mixta'],
      horizontes: [24],
    })

    expect(resultado[0]).toMatchObject({
      nivel: 'rojo',
      base: 'deterministico',
      metodo: 'percentiles',
      percentilReferencia: 'P99',
    })
  })

  // filaClimatologia fija version ERA5 y periodoHasta 2020; estas filas IMERG
  // los sobrescriben vía spread (el helper compartido no expone esos campos).
  const CLIMATOLOGIA_IMERG_2025 = { version: 'climatologia-imerg-v1', periodoHasta: '2025-12-31' }

  it('con IMERG completa y ERA5 presente usa los umbrales IMERG, nunca los ERA5', async () => {
    await db.insert(hazardForecast).values(
      filaPronostico({
        geometryRef: 'celda-imerg-completa',
        variable: 'precipitacion',
        corridaEn: CORRIDA_NUEVA,
        validoEn: '2026-09-27T00:00:00.000Z',
        horizonteHoras: 24,
        valor: 45,
      }),
    )
    await db.insert(hazardClimatology).values([
      filaClimatologia({
        geometryRef: 'celda-imerg-completa',
        variable: 'precipitacion_diaria',
        percentil: 'p90',
        valor: 10,
      }),
      filaClimatologia({
        geometryRef: 'celda-imerg-completa',
        variable: 'precipitacion_diaria',
        percentil: 'p95',
        valor: 20,
      }),
      filaClimatologia({
        geometryRef: 'celda-imerg-completa',
        variable: 'precipitacion_diaria',
        percentil: 'p99',
        valor: 30,
      }),
      filaClimatologia({
        geometryRef: 'celda-imerg-completa',
        variable: 'precipitacion_diaria',
        percentil: 'p90',
        valor: 40,
        ...CLIMATOLOGIA_IMERG_2025,
      }),
      filaClimatologia({
        geometryRef: 'celda-imerg-completa',
        variable: 'precipitacion_diaria',
        percentil: 'p95',
        valor: 50,
        ...CLIMATOLOGIA_IMERG_2025,
      }),
      filaClimatologia({
        geometryRef: 'celda-imerg-completa',
        variable: 'precipitacion_diaria',
        percentil: 'p99',
        valor: 60,
        ...CLIMATOLOGIA_IMERG_2025,
      }),
    ])

    const resultado = await obtenerNivelesPeligro({
      geometryRefs: ['celda-imerg-completa'],
      horizontes: [24],
    })

    // Con umbrales IMERG (40/50/60) 45 mm queda entre P90 y P95; con ERA5
    // (10/20/30) quedaría por encima de P99.
    expect(resultado[0]).toMatchObject({
      base: 'deterministico',
      metodo: 'percentiles',
      percentilReferencia: 'P90',
    })
  })

  it('con IMERG parcial (sólo p90/p95) usa la climatología ERA5 completa, sin mezclar', async () => {
    await db.insert(hazardForecast).values(
      filaPronostico({
        geometryRef: 'celda-imerg-parcial',
        variable: 'precipitacion',
        corridaEn: CORRIDA_NUEVA,
        validoEn: '2026-09-27T00:00:00.000Z',
        horizonteHoras: 24,
        valor: 22,
      }),
    )
    await db.insert(hazardClimatology).values([
      filaClimatologia({
        geometryRef: 'celda-imerg-parcial',
        variable: 'precipitacion_diaria',
        percentil: 'p90',
        valor: 10,
      }),
      filaClimatologia({
        geometryRef: 'celda-imerg-parcial',
        variable: 'precipitacion_diaria',
        percentil: 'p95',
        valor: 20,
      }),
      filaClimatologia({
        geometryRef: 'celda-imerg-parcial',
        variable: 'precipitacion_diaria',
        percentil: 'p99',
        valor: 30,
      }),
      filaClimatologia({
        geometryRef: 'celda-imerg-parcial',
        variable: 'precipitacion_diaria',
        percentil: 'p90',
        valor: 15,
        ...CLIMATOLOGIA_IMERG_2025,
      }),
      filaClimatologia({
        geometryRef: 'celda-imerg-parcial',
        variable: 'precipitacion_diaria',
        percentil: 'p95',
        valor: 25,
        ...CLIMATOLOGIA_IMERG_2025,
      }),
    ])

    const resultado = await obtenerNivelesPeligro({
      geometryRefs: ['celda-imerg-parcial'],
      horizontes: [24],
    })

    // ERA5 completa (10/20/30): 22 mm supera P95. Mezclar P90 IMERG (15) con
    // P95 IMERG (25) daría P90.
    expect(resultado[0]).toMatchObject({
      base: 'deterministico',
      metodo: 'percentiles',
      percentilReferencia: 'P95',
    })
  })

  it('sin pronóstico ni climatología devuelve sin_dato, nunca verde', async () => {
    const ahora = new Date('2026-09-26T12:00:00.000Z')

    const resultado = await obtenerNivelesPeligro({
      geometryRefs: ['celda-vacia'],
      horizontes: [24],
      ahora,
    })

    expect(resultado).toEqual([
      nivelEsperado({
        geometryRef: 'celda-vacia',
        horizonteHoras: 24,
        nivel: 'sin_dato',
        base: 'sin_dato',
        metodo: 'sin_dato',
        emitidoEn: '2026-09-26T12:00:00.000Z',
        validoHasta: '2026-09-26T12:00:00.000Z',
      }),
    ])
  })

  it('con climatología pero sin pronóstico también es sin_dato', async () => {
    await insertarClimatologia(db, 'celda-solo-clima', 'precipitacion_diaria', {
      p90: 10,
      p95: 20,
      p99: 30,
    })

    const resultado = await obtenerNivelesPeligro({
      geometryRefs: ['celda-solo-clima'],
      horizontes: [24],
    })

    expect(resultado[0]).toMatchObject({ base: 'sin_dato', nivel: 'sin_dato' })
  })

  it('en 240 h ignora el ensemble: sólo con ensemble disponible es sin_dato', async () => {
    await db.insert(hazardEnsembleProb).values(
      filaEnsemble({
        geometryRef: 'celda-240',
        corridaEn: CORRIDA_NUEVA,
        validoEn: '2026-10-06T00:00:00.000Z',
        horizonteHoras: 240,
        probabilidadP95: 0.99,
        probabilidadP99: 0.99,
      }),
    )

    const resultado = await obtenerNivelesPeligro({ geometryRefs: ['celda-240'], horizontes: [240] })

    expect(resultado[0]).toMatchObject({
      base: 'sin_dato',
      nivel: 'sin_dato',
      probabilidadP95: null,
      probabilidadP99: null,
    })
  })

  it('en 240 h usa el determinístico cuando existe pronóstico de ese horizonte', async () => {
    await db.insert(hazardForecast).values(
      filaPronostico({
        geometryRef: 'celda-240',
        variable: 'precipitacion',
        corridaEn: CORRIDA_NUEVA,
        validoEn: '2026-10-06T00:00:00.000Z',
        horizonteHoras: 240,
        valor: 40,
      }),
    )
    await insertarClimatologia(db, 'celda-240', 'precipitacion_diaria', { p90: 10, p95: 20, p99: 30 })

    const resultado = await obtenerNivelesPeligro({ geometryRefs: ['celda-240'], horizontes: [240] })

    expect(resultado[0]).toMatchObject({
      base: 'deterministico',
      nivel: 'rojo',
      precipitacionMm: 40,
      percentilReferencia: 'P99',
    })
  })

  it('en 240 h no extrapola el pronóstico de 72 h: sin fila cercana a 240 es sin_dato', async () => {
    await db.insert(hazardForecast).values(
      filaPronostico({
        geometryRef: 'celda-240-sin-largo',
        variable: 'precipitacion',
        corridaEn: CORRIDA_NUEVA,
        validoEn: '2026-09-29T00:00:00.000Z',
        horizonteHoras: 72,
        valor: 40,
      }),
    )
    await insertarClimatologia(db, 'celda-240-sin-largo', 'precipitacion_diaria', {
      p90: 10,
      p95: 20,
      p99: 30,
    })

    const resultado = await obtenerNivelesPeligro({
      geometryRefs: ['celda-240-sin-largo'],
      horizontes: [240],
    })

    expect(resultado[0]).toMatchObject({ base: 'sin_dato', nivel: 'sin_dato' })
  })

  it('agrega varios geometryRefs/horizontes y resuelve los refs distintos no nulos de infraGeoProfile', async () => {
    await db.insert(infraGeoProfile).values([
      {
        cueAnexo: '1800001-00',
        geometryRef: 'celda-a',
        perfilVersion: 'geo-perfil-v1',
        calculadoEn: '2026-09-26T00:00:00.000Z',
      },
      {
        cueAnexo: '1800002-00',
        geometryRef: 'celda-a',
        perfilVersion: 'geo-perfil-v1',
        calculadoEn: '2026-09-26T00:00:00.000Z',
      },
      {
        cueAnexo: '1800003-00',
        geometryRef: null,
        perfilVersion: 'geo-perfil-v1',
        calculadoEn: '2026-09-26T00:00:00.000Z',
      },
      {
        cueAnexo: '1800004-00',
        geometryRef: 'celda-c',
        perfilVersion: 'geo-perfil-v1',
        calculadoEn: '2026-09-26T00:00:00.000Z',
      },
      {
        cueAnexo: '1800005-00',
        geometryRef: 'celda-b',
        perfilVersion: 'geo-perfil-v1',
        calculadoEn: '2026-09-26T00:00:00.000Z',
      },
    ])

    await db.insert(hazardEnsembleProb).values([
      filaEnsemble({
        geometryRef: 'celda-a',
        corridaEn: CORRIDA_NUEVA,
        validoEn: '2026-09-26T23:00:00.000Z',
        horizonteHoras: 23,
        probabilidadP95: 0.05,
        probabilidadP99: 0,
      }),
      filaEnsemble({
        geometryRef: 'celda-a',
        corridaEn: CORRIDA_NUEVA,
        validoEn: '2026-09-28T23:00:00.000Z',
        horizonteHoras: 71,
        probabilidadP95: 0.6,
        probabilidadP99: 0.1,
      }),
    ])
    await db.insert(hazardForecast).values(
      filaPronostico({
        geometryRef: 'celda-b',
        variable: 'precipitacion',
        corridaEn: CORRIDA_NUEVA,
        validoEn: '2026-09-29T00:00:00.000Z',
        horizonteHoras: 72,
        valor: 40,
      }),
    )
    await insertarClimatologia(db, 'celda-b', 'precipitacion_diaria', { p90: 10, p95: 20, p99: 30 })

    const resultado = await obtenerNivelesPeligro({ horizontes: [24, 72] })

    expect(
      resultado.map((fila) => [fila.geometryRef, fila.horizonteHoras, fila.base, fila.nivel]),
    ).toEqual([
      ['celda-a', 24, 'ensemble', 'verde'],
      ['celda-a', 72, 'ensemble', 'naranja'],
      ['celda-b', 24, 'deterministico', 'rojo'],
      ['celda-b', 72, 'deterministico', 'rojo'],
      ['celda-c', 24, 'sin_dato', 'sin_dato'],
      ['celda-c', 72, 'sin_dato', 'sin_dato'],
    ])
  })
})

describe('obtenerNivelesPeligro por lote (equivalencia celda a celda)', () => {
  const ahora = new Date('2026-09-26T12:00:00.000Z')
  const horizontes: Array<24 | 72 | 240> = [24, 72, 240]
  const refs = [
    'lote-ensemble',
    'lote-deterministico',
    'lote-clima-parcial',
    'lote-sin-datos',
  ]
  const ahoraIso = ahora.toISOString()
  const sinDato = (geometryRef: string, horizonteHoras: 24 | 72 | 240) =>
    nivelEsperado({
      geometryRef,
      horizonteHoras,
      nivel: 'sin_dato',
      base: 'sin_dato',
      metodo: 'sin_dato',
      emitidoEn: ahoraIso,
      validoHasta: ahoraIso,
    })

  beforeEach(async () => {
    // Celda 1: ensemble reciente en 24 y 72; para 240 no hay nada -> sin_dato.
    await db.insert(hazardEnsembleProb).values([
      filaEnsemble({
        geometryRef: 'lote-ensemble',
        corridaEn: CORRIDA_NUEVA,
        validoEn: '2026-09-26T23:00:00.000Z',
        horizonteHoras: 24,
        probabilidadP95: 0.6,
        probabilidadP99: 0.1,
      }),
      filaEnsemble({
        geometryRef: 'lote-ensemble',
        corridaEn: CORRIDA_NUEVA,
        validoEn: '2026-09-28T23:00:00.000Z',
        horizonteHoras: 72,
        probabilidadP95: 0.9,
        probabilidadP99: 0.9,
      }),
    ])

    // Celda 2: sin ensemble, sólo pronóstico en 24/72 + climatología completa.
    await db.insert(hazardForecast).values([
      filaPronostico({
        geometryRef: 'lote-deterministico',
        variable: 'precipitacion',
        corridaEn: CORRIDA_NUEVA,
        validoEn: '2026-09-27T00:00:00.000Z',
        horizonteHoras: 24,
        valor: 25,
      }),
      filaPronostico({
        geometryRef: 'lote-deterministico',
        variable: 'precipitacion',
        corridaEn: CORRIDA_NUEVA,
        validoEn: '2026-09-29T00:00:00.000Z',
        horizonteHoras: 72,
        valor: 40,
      }),
    ])
    await insertarClimatologia(db, 'lote-deterministico', 'precipitacion_diaria', {
      p90: 10,
      p95: 20,
      p99: 30,
    })

    // Celda 3: climatología parcial (sin p99) con pronóstico => umbral
    // provisorio (no hay climatología completa, pero sí pronóstico).
    await db.insert(hazardForecast).values(
      filaPronostico({
        geometryRef: 'lote-clima-parcial',
        variable: 'precipitacion',
        corridaEn: CORRIDA_NUEVA,
        validoEn: '2026-09-27T00:00:00.000Z',
        horizonteHoras: 24,
        valor: 100,
      }),
    )
    await db.insert(hazardClimatology).values([
      filaClimatologia({
        geometryRef: 'lote-clima-parcial',
        variable: 'precipitacion_diaria',
        percentil: 'p90',
        valor: 10,
      }),
      filaClimatologia({
        geometryRef: 'lote-clima-parcial',
        variable: 'precipitacion_diaria',
        percentil: 'p95',
        valor: 20,
      }),
    ])

    // Celda 4: sin ningún dato.
  })

  it('produce 4*3 filas con los niveles/bases esperados del fixture determinista', async () => {
    const resultado = await obtenerNivelesPeligro({ geometryRefs: refs, horizontes, ahora })

    expect(resultado).toHaveLength(12)
    expect(resultado.map((fila) => [fila.geometryRef, fila.horizonteHoras])).toEqual([
      ['lote-ensemble', 24],
      ['lote-ensemble', 72],
      ['lote-ensemble', 240],
      ['lote-deterministico', 24],
      ['lote-deterministico', 72],
      ['lote-deterministico', 240],
      ['lote-clima-parcial', 24],
      ['lote-clima-parcial', 72],
      ['lote-clima-parcial', 240],
      ['lote-sin-datos', 24],
      ['lote-sin-datos', 72],
      ['lote-sin-datos', 240],
    ])
    expect(resultado).toEqual([
      nivelEsperado({
        geometryRef: 'lote-ensemble',
        horizonteHoras: 24,
        nivel: 'naranja',
        base: 'ensemble',
        metodo: 'percentiles',
        probabilidadP95: 0.6,
        probabilidadP99: 0.1,
        percentilReferencia: 'P95',
        validoHasta: '2026-09-26T23:00:00.000Z',
      }),
      nivelEsperado({
        geometryRef: 'lote-ensemble',
        horizonteHoras: 72,
        nivel: 'rojo',
        base: 'ensemble',
        metodo: 'percentiles',
        probabilidadP95: 0.9,
        probabilidadP99: 0.9,
        percentilReferencia: 'P99',
        validoHasta: '2026-09-28T23:00:00.000Z',
      }),
      sinDato('lote-ensemble', 240),
      nivelEsperado({
        geometryRef: 'lote-deterministico',
        horizonteHoras: 24,
        nivel: 'naranja',
        base: 'deterministico',
        metodo: 'percentiles',
        precipitacionMm: 25,
        percentilReferencia: 'P95',
        validoHasta: '2026-09-27T00:00:00.000Z',
      }),
      nivelEsperado({
        geometryRef: 'lote-deterministico',
        horizonteHoras: 72,
        nivel: 'rojo',
        base: 'deterministico',
        metodo: 'percentiles',
        precipitacionMm: 40,
        percentilReferencia: 'P99',
        validoHasta: '2026-09-29T00:00:00.000Z',
      }),
      sinDato('lote-deterministico', 240),
      nivelEsperado({
        geometryRef: 'lote-clima-parcial',
        horizonteHoras: 24,
        nivel: 'naranja',
        base: 'deterministico',
        metodo: 'umbral_provisorio',
        precipitacionMm: 100,
        validoHasta: '2026-09-27T00:00:00.000Z',
      }),
      // 72h: sin fixture propio de 72h, así que el pronóstico de 24h (100mm)
      // es el más cercano disponible (mismo criterio de matching ya existente
      // para cualquier horizonte que no sea 240); sin climatología completa,
      // resuelve con el umbral provisorio de 72h (amarillo > 80, no supera
      // naranja > 120).
      nivelEsperado({
        geometryRef: 'lote-clima-parcial',
        horizonteHoras: 72,
        nivel: 'amarillo',
        base: 'deterministico',
        metodo: 'umbral_provisorio',
        precipitacionMm: 100,
        validoHasta: '2026-09-27T00:00:00.000Z',
      }),
      // 240h: la tolerancia de horizonte (24h) rechaza el fixture de 24h como
      // candidato de 240h, así que no hay pronóstico dentro de tolerancia ->
      // sigue sin_dato (no cambia con este batch).
      sinDato('lote-clima-parcial', 240),
      sinDato('lote-sin-datos', 24),
      sinDato('lote-sin-datos', 72),
      sinDato('lote-sin-datos', 240),
    ])
  })

  it('la llamada agrupada equivale a invocar una celda a la vez', async () => {
    const agrupado = await obtenerNivelesPeligro({ geometryRefs: refs, horizontes, ahora })

    const porCeldaSuelta = []
    for (const geometryRef of refs) {
      const filas = await obtenerNivelesPeligro({ geometryRefs: [geometryRef], horizontes, ahora })
      porCeldaSuelta.push(...filas)
    }

    expect(agrupado).toEqual(porCeldaSuelta)
  })

  it('con geometryRefs vacío no consulta y devuelve lista vacía', async () => {
    expect(await obtenerNivelesPeligro({ geometryRefs: [], horizontes, ahora })).toEqual([])
  })

  // Regresión M2: en el radar (mapa de infraestructura), 72 h y 7-10 días
  // aparecían en gris ("sin dato") mientras 24 h mostraba un nivel real.
  // Diagnóstico (DB de demo): el pronóstico determinístico cubre las 228 horas
  // (0..227) de la corrida, pero `hazard_climatology` estaba VACÍA para todas
  // las celdas. Antes del batch P1 (umbrales provisorios), sin climatología el
  // resultado era 'sin_dato' para cualquier horizonte que no tomara el camino
  // del ensemble — y el ensemble tampoco tenía filas en la demo, así que 72h y
  // 240h caían siempre a sin_dato mientras 24h podía colarse por otro camino.
  // P1 ya solucionó la causa de fondo (agrega el fallback 'umbral_provisorio'
  // cuando hay pronóstico pero no climatología, ver umbrales-provisorios.ts) y
  // este test la fija como regresión: con pronóstico horario completo y CERO
  // climatología/ensemble, los tres horizontes tienen que resolver a un nivel
  // concreto, nunca a 'sin_dato' mudo.
  it('regresión: sin climatología ni ensemble pero con pronóstico horario completo, 24/72/240 nunca son sin_dato', async () => {
    const geometryRef = 'celda-demo-m2'
    const corridaEn = '2026-09-27T12:00:00.000Z'
    // Pronóstico horario 0..227h (mismo rango que la corrida real de la demo),
    // todas las lecturas bajas (0mm) salvo un pico a las 48h — no importa el
    // valor exacto para esta regresión, sólo que exista una fila por hora.
    const filas = []
    for (let h = 0; h <= 227; h += 1) {
      filas.push(
        filaPronostico({
          geometryRef,
          variable: 'precipitacion',
          corridaEn,
          validoEn: new Date(Date.parse(corridaEn) + h * 60 * 60 * 1000).toISOString(),
          horizonteHoras: h,
          valor: h === 48 ? 2.8 : 0,
        }),
      )
    }
    await db.insert(hazardForecast).values(filas)

    const resultado = await obtenerNivelesPeligro({
      geometryRefs: [geometryRef],
      horizontes: [24, 72, 240],
      ahora: new Date(corridaEn),
    })

    expect(resultado).toHaveLength(3)
    for (const fila of resultado) {
      expect(fila.nivel).not.toBe('sin_dato')
      expect(fila.metodo).toBe('umbral_provisorio')
    }
  })
})

describe('obtenerNivelCaudal', () => {
  it('usa el horizonte más chico de la corrida más reciente y calcula percentil/nivel', async () => {
    await insertarClimatologia(db, 'punto-1', 'caudal_diario', { p90: 50, p95: 100, p99: 140 })
    await db.insert(hazardForecast).values([
      filaPronostico({
        geometryRef: 'punto-1',
        variable: 'caudal',
        corridaEn: CORRIDA_VIEJA,
        validoEn: '2026-09-25T01:00:00.000Z',
        horizonteHoras: 1,
        valor: 10,
      }),
      filaPronostico({
        geometryRef: 'punto-1',
        variable: 'caudal',
        corridaEn: CORRIDA_NUEVA,
        validoEn: '2026-09-27T00:00:00.000Z',
        horizonteHoras: 24,
        valor: 10,
      }),
      filaPronostico({
        geometryRef: 'punto-1',
        variable: 'caudal',
        corridaEn: CORRIDA_NUEVA,
        validoEn: '2026-09-26T06:00:00.000Z',
        horizonteHoras: 6,
        valor: 150,
      }),
    ])

    const resultado = await obtenerNivelCaudal('punto-1')

    expect(resultado).toEqual({
      puntoId: 'punto-1',
      percentilActual: 99,
      nivel: 'rojo',
      emitidoEn: CORRIDA_NUEVA,
      validoHasta: '2026-09-26T06:00:00.000Z',
    })
  })

  it('aproxima el percentil y el nivel en cada banda de umbral', async () => {
    const clim = { p90: 50, p95: 100, p99: 140 }
    await insertarClimatologia(db, 'punto-rojo', 'caudal_diario', clim)
    await insertarClimatologia(db, 'punto-naranja', 'caudal_diario', clim)
    await insertarClimatologia(db, 'punto-amarillo', 'caudal_diario', clim)
    await insertarClimatologia(db, 'punto-verde', 'caudal_diario', clim)
    await db.insert(hazardForecast).values([
      filaPronostico({
        geometryRef: 'punto-rojo',
        variable: 'caudal',
        corridaEn: CORRIDA_NUEVA,
        validoEn: '2026-09-26T06:00:00.000Z',
        horizonteHoras: 6,
        valor: 150,
      }),
      filaPronostico({
        geometryRef: 'punto-naranja',
        variable: 'caudal',
        corridaEn: CORRIDA_NUEVA,
        validoEn: '2026-09-26T06:00:00.000Z',
        horizonteHoras: 6,
        valor: 120,
      }),
      filaPronostico({
        geometryRef: 'punto-amarillo',
        variable: 'caudal',
        corridaEn: CORRIDA_NUEVA,
        validoEn: '2026-09-26T06:00:00.000Z',
        horizonteHoras: 6,
        valor: 75,
      }),
      filaPronostico({
        geometryRef: 'punto-verde',
        variable: 'caudal',
        corridaEn: CORRIDA_NUEVA,
        validoEn: '2026-09-26T06:00:00.000Z',
        horizonteHoras: 6,
        valor: 10,
      }),
    ])

    expect(await obtenerNivelCaudal('punto-rojo')).toMatchObject({ percentilActual: 99, nivel: 'rojo' })
    expect(await obtenerNivelCaudal('punto-naranja')).toMatchObject({
      percentilActual: 95,
      nivel: 'naranja',
    })
    expect(await obtenerNivelCaudal('punto-amarillo')).toMatchObject({
      percentilActual: 90,
      nivel: 'amarillo',
    })
    expect(await obtenerNivelCaudal('punto-verde')).toMatchObject({
      percentilActual: 0,
      nivel: 'verde',
    })
  })

  it('sin climatología devuelve null (la ausencia es el objeto entero, no sin_dato)', async () => {
    await db.insert(hazardForecast).values(
      filaPronostico({
        geometryRef: 'punto-sin-clima',
        variable: 'caudal',
        corridaEn: CORRIDA_NUEVA,
        validoEn: '2026-09-26T06:00:00.000Z',
        horizonteHoras: 6,
        valor: 150,
      }),
    )

    expect(await obtenerNivelCaudal('punto-sin-clima')).toBeNull()
  })

  it('sin pronóstico devuelve null', async () => {
    await insertarClimatologia(db, 'punto-sin-pronostico', 'caudal_diario', {
      p90: 50,
      p95: 100,
      p99: 140,
    })

    expect(await obtenerNivelCaudal('punto-sin-pronostico')).toBeNull()
  })

  it('punto inexistente devuelve null', async () => {
    expect(await obtenerNivelCaudal('punto-inexistente')).toBeNull()
  })
})

describe('consultas de pronóstico as-of (ahora)', () => {
  const CORRIDA_A = '2026-09-25T00:00:00.000Z'
  const CORRIDA_B = '2026-09-26T00:00:00.000Z'
  const AHORA_ENTRE = new Date('2026-09-25T12:00:00.000Z')

  it('obtenerNivelCaudal con ahora usa la corrida vigente en ese momento, no una posterior', async () => {
    // Climatología calculada antes de AHORA_ENTRE: con `ahora` debe seguir vigente.
    await db.insert(hazardClimatology).values(
      (['p90', 'p95', 'p99'] as const).map((percentil, indice) =>
        filaClimatologia({
          geometryRef: 'punto-asof',
          variable: 'caudal_diario',
          percentil,
          valor: [50, 100, 140][indice],
          calculadoEn: '2026-09-01T00:00:00.000Z',
        }),
      ),
    )
    await db.insert(hazardForecast).values([
      filaPronostico({
        geometryRef: 'punto-asof',
        variable: 'caudal',
        corridaEn: CORRIDA_A,
        validoEn: '2026-09-25T06:00:00.000Z',
        horizonteHoras: 6,
        valor: 150,
      }),
      filaPronostico({
        geometryRef: 'punto-asof',
        variable: 'caudal',
        corridaEn: CORRIDA_B,
        validoEn: '2026-09-26T06:00:00.000Z',
        horizonteHoras: 6,
        valor: 10,
      }),
    ])

    expect(await obtenerNivelCaudal('punto-asof', { ahora: AHORA_ENTRE })).toMatchObject({
      nivel: 'rojo',
      emitidoEn: CORRIDA_A,
    })
    expect(await obtenerNivelCaudal('punto-asof')).toMatchObject({
      nivel: 'verde',
      emitidoEn: CORRIDA_B,
    })
  })

  it('obtenerNivelesPeligro (lote) con ahora usa la corrida vigente en ese momento', async () => {
    await db.insert(hazardForecast).values([
      filaPronostico({
        geometryRef: 'celda-asof',
        variable: 'precipitacion',
        corridaEn: CORRIDA_A,
        validoEn: '2026-09-26T00:00:00.000Z',
        horizonteHoras: 24,
        valor: 10,
      }),
      filaPronostico({
        geometryRef: 'celda-asof',
        variable: 'precipitacion',
        corridaEn: CORRIDA_B,
        validoEn: '2026-09-27T00:00:00.000Z',
        horizonteHoras: 24,
        valor: 200,
      }),
    ])

    const conAhora = await obtenerNivelesPeligro({
      geometryRefs: ['celda-asof'],
      horizontes: [24],
      ahora: AHORA_ENTRE,
    })
    expect(conAhora[0]).toMatchObject({ geometryRef: 'celda-asof', emitidoEn: CORRIDA_A })

    const sinAhora = await obtenerNivelesPeligro({ geometryRefs: ['celda-asof'], horizontes: [24] })
    expect(sinAhora[0]).toMatchObject({ geometryRef: 'celda-asof', emitidoEn: CORRIDA_B })
  })

  describe('umbrales de climatología as-of (ahora)', () => {
    const CALCULO_VIEJO = '2026-09-20T00:00:00.000Z'
    const CALCULO_NUEVO = '2026-09-28T00:00:00.000Z'

    // Dos versiones de climatología para la misma celda/variable/periodo: la
    // vieja (v1) fue calculada antes de AHORA_ENTRE y la nueva (v2) después.
    async function insertarVersionesClimatologia(
      geometryRef: string,
      variable: 'precipitacion_diaria' | 'caudal_diario',
    ): Promise<void> {
      const percentiles = ['p90', 'p95', 'p99'] as const
      const umbralesViejos = { p90: 50, p95: 100, p99: 140 }
      const umbralesNuevos = { p90: 10, p95: 20, p99: 30 }
      const filas = [
        ...percentiles.map((percentil) => ({
          ...filaClimatologia({
            geometryRef,
            variable,
            percentil,
            valor: umbralesViejos[percentil],
            calculadoEn: CALCULO_VIEJO,
          }),
          version: 'climatologia-v1',
        })),
        ...percentiles.map((percentil) => ({
          ...filaClimatologia({
            geometryRef,
            variable,
            percentil,
            valor: umbralesNuevos[percentil],
            calculadoEn: CALCULO_NUEVO,
          }),
          version: 'climatologia-v2',
        })),
      ]
      await db.insert(hazardClimatology).values(filas)
    }

    it('obtenerNivelCaudal con ahora usa los umbrales calculados hasta ese momento', async () => {
      await insertarVersionesClimatologia('punto-clim-asof', 'caudal_diario')
      await db.insert(hazardForecast).values([
        filaPronostico({
          geometryRef: 'punto-clim-asof',
          variable: 'caudal',
          corridaEn: CORRIDA_A,
          validoEn: '2026-09-25T06:00:00.000Z',
          horizonteHoras: 6,
          valor: 25,
        }),
      ])

      expect(await obtenerNivelCaudal('punto-clim-asof', { ahora: AHORA_ENTRE })).toMatchObject({
        nivel: 'verde',
      })
      expect(await obtenerNivelCaudal('punto-clim-asof')).toMatchObject({ nivel: 'naranja' })
    })

    it('obtenerNivelesPeligro (lote) con ahora usa los umbrales calculados hasta ese momento', async () => {
      await insertarVersionesClimatologia('celda-clim-asof', 'precipitacion_diaria')
      await db.insert(hazardForecast).values([
        filaPronostico({
          geometryRef: 'celda-clim-asof',
          variable: 'precipitacion',
          corridaEn: CORRIDA_A,
          validoEn: '2026-09-26T00:00:00.000Z',
          horizonteHoras: 24,
          valor: 25,
        }),
      ])

      const conAhora = await obtenerNivelesPeligro({
        geometryRefs: ['celda-clim-asof'],
        horizontes: [24],
        ahora: AHORA_ENTRE,
      })
      expect(conAhora[0]).toMatchObject({ geometryRef: 'celda-clim-asof', nivel: 'verde' })

      const sinAhora = await obtenerNivelesPeligro({
        geometryRefs: ['celda-clim-asof'],
        horizontes: [24],
      })
      expect(sinAhora[0]).toMatchObject({ geometryRef: 'celda-clim-asof', nivel: 'naranja' })
    })

    it('con igual periodoHasta y versión (progresiva) gana la fila calculada más recientemente', async () => {
      const versionProgresiva = 'climatologia-v2-progresiva'
      const filasPorPeriodo = (
        geometryRef: string,
        variable: 'precipitacion_diaria' | 'caudal_diario',
        periodoDesde: string,
        calculadoEn: string,
        umbrales: { p90: number; p95: number; p99: number },
      ) =>
        (['p90', 'p95', 'p99'] as const).map((percentil) => ({
          ...filaClimatologia({ geometryRef, variable, percentil, valor: umbrales[percentil], calculadoEn }),
          periodoDesde,
          version: versionProgresiva,
        }))
      // La fila vieja se inserta primero: sin desempate por calculadoEn gana por orden de inserción.
      for (const variable of ['precipitacion_diaria', 'caudal_diario'] as const) {
        const geometryRef = variable === 'caudal_diario' ? 'punto-progresivo' : 'celda-progresiva'
        await db.insert(hazardClimatology).values([
          ...filasPorPeriodo(geometryRef, variable, '1991-01-01', '2026-09-20T00:00:00.000Z', {
            p90: 50,
            p95: 100,
            p99: 140,
          }),
          ...filasPorPeriodo(geometryRef, variable, '1995-01-01', '2026-09-28T00:00:00.000Z', {
            p90: 10,
            p95: 20,
            p99: 30,
          }),
        ])
      }
      await db.insert(hazardForecast).values([
        filaPronostico({
          geometryRef: 'celda-progresiva',
          variable: 'precipitacion',
          corridaEn: CORRIDA_A,
          validoEn: '2026-09-26T00:00:00.000Z',
          horizonteHoras: 24,
          valor: 25,
        }),
        filaPronostico({
          geometryRef: 'punto-progresivo',
          variable: 'caudal',
          corridaEn: CORRIDA_A,
          validoEn: '2026-09-25T06:00:00.000Z',
          horizonteHoras: 6,
          valor: 25,
        }),
      ])

      const [lote] = await obtenerNivelesPeligro({ geometryRefs: ['celda-progresiva'], horizontes: [24] })
      expect(lote).toMatchObject({ geometryRef: 'celda-progresiva', nivel: 'naranja' })
      expect(await obtenerNivelCaudal('punto-progresivo')).toMatchObject({ nivel: 'naranja' })
    })
  })
})

describe('agregarNivelPorDepartamento', () => {
  function nivelCelda(geometryRef: string, nivel: 'verde' | 'amarillo' | 'naranja' | 'rojo' | 'sin_dato') {
    return {
      geometryRef,
      horizonteHoras: 24 as const,
      nivel,
      base: nivel === 'sin_dato' ? ('sin_dato' as const) : ('deterministico' as const),
      probabilidadP95: null,
      probabilidadP99: null,
      precipitacionMm: null,
      percentilReferencia: null,
      emitidoEn: CORRIDA_NUEVA,
      validoHasta: CORRIDA_NUEVA,
      versionRegla: 'peligro-v0.2',
    }
  }

  type NivelCeldaTest = Omit<ReturnType<typeof nivelCelda>, 'horizonteHoras'> & {
    horizonteHoras: 24 | 72
  }

  const CASOS: Array<[
    string,
    NivelCeldaTest[],
    Record<string, string[]>,
    24 | 72,
    Record<string, string>,
  ]> = [
    [
      'toma el PEOR nivel entre las celdas con escuelas del departamento',
      [nivelCelda('celda-1', 'verde'), nivelCelda('celda-2', 'naranja'), nivelCelda('celda-3', 'amarillo')],
      { capital: ['celda-1', 'celda-2', 'celda-3'] },
      24,
      { capital: 'naranja' },
    ],
    [
      'ignora sin_dato si hay al menos una celda con nivel concreto',
      [nivelCelda('celda-1', 'sin_dato'), nivelCelda('celda-2', 'amarillo')],
      { goya: ['celda-1', 'celda-2'] },
      24,
      { goya: 'amarillo' },
    ],
    [
      'devuelve sin_dato si TODAS las celdas del departamento están sin_dato (nunca verde por descarte)',
      [nivelCelda('celda-1', 'sin_dato'), nivelCelda('celda-2', 'sin_dato')],
      { esquina: ['celda-1', 'celda-2'] },
      24,
      { esquina: 'sin_dato' },
    ],
    [
      'devuelve sin_dato si el departamento no tiene ninguna celda con nivel para ese horizonte',
      [nivelCelda('celda-1', 'rojo')],
      { 'sin-datos': ['celda-inexistente'] },
      24,
      { 'sin-datos': 'sin_dato' },
    ],
    [
      'filtra por el horizonte pedido, no mezcla niveles de otro horizonte',
      [{ ...nivelCelda('celda-1', 'rojo'), horizonteHoras: 72 as const }, nivelCelda('celda-1', 'verde')],
      { capital: ['celda-1'] },
      24,
      { capital: 'verde' },
    ],
  ]

  it.each(CASOS)('%s', (_titulo, niveles, escuelas, horizonte, esperado) => {
    expect(agregarNivelPorDepartamento(niveles, escuelas, horizonte)).toEqual(esperado)
  })
})
