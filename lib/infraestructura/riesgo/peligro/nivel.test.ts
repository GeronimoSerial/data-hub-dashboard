import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  hazardClimatology,
  hazardEnsembleProb,
  hazardForecast,
  infraGeoProfile,
} from '@/lib/db/schema'
import type { getDb as GetDb } from '@/lib/db'
import type {
  agregarNivelPorDepartamento as AgregarNivelPorDepartamento,
  nivelDesdeDeterministico as NivelDesdeDeterministico,
  nivelDesdeEnsemble as NivelDesdeEnsemble,
  obtenerNivelCaudal as ObtenerNivelCaudal,
  obtenerNivelesPeligro as ObtenerNivelesPeligro,
} from './nivel'

let dir: string
let prevDataDir: string | undefined

let db: ReturnType<typeof GetDb>
let nivelDesdeEnsemble: typeof NivelDesdeEnsemble
let nivelDesdeDeterministico: typeof NivelDesdeDeterministico
let obtenerNivelesPeligro: typeof ObtenerNivelesPeligro
let obtenerNivelCaudal: typeof ObtenerNivelCaudal
let agregarNivelPorDepartamento: typeof AgregarNivelPorDepartamento

const CORRIDA_VIEJA = '2026-09-25T00:00:00.000Z'
const CORRIDA_NUEVA = '2026-09-26T00:00:00.000Z'

function filaEnsemble(params: {
  geometryRef: string
  corridaEn: string
  validoEn: string
  horizonteHoras: number
  probabilidadP95: number
  probabilidadP99: number
}): typeof hazardEnsembleProb.$inferInsert {
  return {
    id: randomUUID(),
    variable: 'precipitacion_24h',
    miembrosTotal: 51,
    miembrosValidos: 51,
    dispersion: 0,
    version: 'ensemble-v1',
    ingeridoEn: params.corridaEn,
    ...params,
  }
}

function filaPronostico(params: {
  geometryRef: string
  variable: 'precipitacion' | 'caudal'
  corridaEn: string
  validoEn: string
  horizonteHoras: number
  valor: number
}): typeof hazardForecast.$inferInsert {
  return {
    id: randomUUID(),
    provider: 'test',
    unidad: params.variable === 'caudal' ? 'm3/s' : 'mm',
    pasoHoras: 1,
    rawRef: null,
    ingeridoEn: params.corridaEn,
    ...params,
  }
}

function filaClimatologia(params: {
  geometryRef: string
  variable: 'precipitacion_diaria' | 'caudal_diario'
  percentil: 'p90' | 'p95' | 'p99'
  valor: number
}): typeof hazardClimatology.$inferInsert {
  return {
    id: randomUUID(),
    muestra: 'todos_los_dias',
    unidad: 'mm',
    periodoDesde: '1991-01-01',
    periodoHasta: '2020-12-31',
    version: 'climatologia-v1',
    calculadoEn: '2026-09-26T00:00:00.000Z',
    ...params,
  }
}

async function insertarClimatologia(
  geometryRef: string,
  variable: 'precipitacion_diaria' | 'caudal_diario',
  valores: { p90: number; p95: number; p99: number },
): Promise<void> {
  await db.insert(hazardClimatology).values([
    filaClimatologia({ geometryRef, variable, percentil: 'p90', valor: valores.p90 }),
    filaClimatologia({ geometryRef, variable, percentil: 'p95', valor: valores.p95 }),
    filaClimatologia({ geometryRef, variable, percentil: 'p99', valor: valores.p99 }),
  ])
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'nivel-peligro-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()

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

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(async () => {
  await db.delete(hazardEnsembleProb)
  await db.delete(hazardForecast)
  await db.delete(hazardClimatology)
  await db.delete(infraGeoProfile)
})

describe('nivelDesdeEnsemble', () => {
  it('P99 exactamente 0.5 ya es rojo (borde >=, la mayoría supera P99)', () => {
    expect(nivelDesdeEnsemble(0.9, 0.5)).toBe('rojo')
  })

  it('P99 apenas por debajo de 0.5 con P95 >= 0.5 es naranja', () => {
    expect(nivelDesdeEnsemble(0.5, 0.499999)).toBe('naranja')
  })

  it('P95 exactamente 0.5 con P99 bajo es naranja (borde >=)', () => {
    expect(nivelDesdeEnsemble(0.5, 0.1)).toBe('naranja')
  })

  it('P95 apenas por debajo de 0.5 cae a amarillo', () => {
    expect(nivelDesdeEnsemble(0.499999, 0.499999)).toBe('amarillo')
  })

  it('P95 exactamente 0.1 es verde (borde >, la probabilidad trivial no pinta)', () => {
    expect(nivelDesdeEnsemble(0.1, 0)).toBe('verde')
  })

  it('P95 apenas por encima de 0.1 es amarillo', () => {
    expect(nivelDesdeEnsemble(0.100001, 0)).toBe('amarillo')
  })

  it('sin superar ningún umbral es verde', () => {
    expect(nivelDesdeEnsemble(0, 0)).toBe('verde')
  })
})

describe('nivelDesdeDeterministico', () => {
  const P90 = 10
  const P95 = 20
  const P99 = 30

  it('igual a p90 todavía es verde (umbral estricto)', () => {
    expect(nivelDesdeDeterministico(10, P90, P95, P99)).toEqual({
      nivel: 'verde',
      percentilReferencia: null,
    })
  })

  it('apenas por encima de p90 es amarillo con percentil P90', () => {
    expect(nivelDesdeDeterministico(10.001, P90, P95, P99)).toEqual({
      nivel: 'amarillo',
      percentilReferencia: 'P90',
    })
  })

  it('igual a p95 todavía es amarillo, no naranja', () => {
    expect(nivelDesdeDeterministico(20, P90, P95, P99)).toEqual({
      nivel: 'amarillo',
      percentilReferencia: 'P90',
    })
  })

  it('apenas por encima de p95 es naranja con percentil P95', () => {
    expect(nivelDesdeDeterministico(20.001, P90, P95, P99)).toEqual({
      nivel: 'naranja',
      percentilReferencia: 'P95',
    })
  })

  it('igual a p99 todavía es naranja, no rojo', () => {
    expect(nivelDesdeDeterministico(30, P90, P95, P99)).toEqual({
      nivel: 'naranja',
      percentilReferencia: 'P95',
    })
  })

  it('apenas por encima de p99 es rojo con percentil P99', () => {
    expect(nivelDesdeDeterministico(30.001, P90, P95, P99)).toEqual({
      nivel: 'rojo',
      percentilReferencia: 'P99',
    })
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
      {
        geometryRef: 'celda-a',
        horizonteHoras: 24,
        nivel: 'naranja',
        base: 'ensemble',
        probabilidadP95: 0.6,
        probabilidadP99: 0.1,
        precipitacionMm: null,
        percentilReferencia: 'P95',
        emitidoEn: CORRIDA_NUEVA,
        validoHasta: '2026-09-26T23:00:00.000Z',
        versionRegla: 'peligro-v0.1',
      },
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
    await insertarClimatologia('celda-b', 'precipitacion_diaria', { p90: 10, p95: 20, p99: 30 })

    const resultado = await obtenerNivelesPeligro({ geometryRefs: ['celda-b'], horizontes: [24] })

    expect(resultado).toEqual([
      {
        geometryRef: 'celda-b',
        horizonteHoras: 24,
        nivel: 'naranja',
        base: 'deterministico',
        probabilidadP95: null,
        probabilidadP99: null,
        precipitacionMm: 25,
        percentilReferencia: 'P95',
        emitidoEn: CORRIDA_NUEVA,
        validoHasta: '2026-09-27T00:00:00.000Z',
        versionRegla: 'peligro-v0.1',
      },
    ])
  })

  it('sin pronóstico ni climatología devuelve sin_dato, nunca verde', async () => {
    const ahora = new Date('2026-09-26T12:00:00.000Z')

    const resultado = await obtenerNivelesPeligro({
      geometryRefs: ['celda-vacia'],
      horizontes: [24],
      ahora,
    })

    expect(resultado).toEqual([
      {
        geometryRef: 'celda-vacia',
        horizonteHoras: 24,
        nivel: 'sin_dato',
        base: 'sin_dato',
        probabilidadP95: null,
        probabilidadP99: null,
        precipitacionMm: null,
        percentilReferencia: null,
        emitidoEn: '2026-09-26T12:00:00.000Z',
        validoHasta: '2026-09-26T12:00:00.000Z',
        versionRegla: 'peligro-v0.1',
      },
    ])
  })

  it('con climatología pero sin pronóstico también es sin_dato', async () => {
    await insertarClimatologia('celda-solo-clima', 'precipitacion_diaria', {
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
    await insertarClimatologia('celda-240', 'precipitacion_diaria', { p90: 10, p95: 20, p99: 30 })

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
    await insertarClimatologia('celda-240-sin-largo', 'precipitacion_diaria', {
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
    await insertarClimatologia('celda-b', 'precipitacion_diaria', { p90: 10, p95: 20, p99: 30 })

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
  const sinDato = (geometryRef: string, horizonteHoras: 24 | 72 | 240) => ({
    geometryRef,
    horizonteHoras,
    nivel: 'sin_dato',
    base: 'sin_dato',
    probabilidadP95: null,
    probabilidadP99: null,
    precipitacionMm: null,
    percentilReferencia: null,
    emitidoEn: ahoraIso,
    validoHasta: ahoraIso,
    versionRegla: 'peligro-v0.1',
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
    await insertarClimatologia('lote-deterministico', 'precipitacion_diaria', {
      p90: 10,
      p95: 20,
      p99: 30,
    })

    // Celda 3: climatología parcial (sin p99) => sin_dato pese al pronóstico.
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
      {
        geometryRef: 'lote-ensemble',
        horizonteHoras: 24,
        nivel: 'naranja',
        base: 'ensemble',
        probabilidadP95: 0.6,
        probabilidadP99: 0.1,
        precipitacionMm: null,
        percentilReferencia: 'P95',
        emitidoEn: CORRIDA_NUEVA,
        validoHasta: '2026-09-26T23:00:00.000Z',
        versionRegla: 'peligro-v0.1',
      },
      {
        geometryRef: 'lote-ensemble',
        horizonteHoras: 72,
        nivel: 'rojo',
        base: 'ensemble',
        probabilidadP95: 0.9,
        probabilidadP99: 0.9,
        precipitacionMm: null,
        percentilReferencia: 'P99',
        emitidoEn: CORRIDA_NUEVA,
        validoHasta: '2026-09-28T23:00:00.000Z',
        versionRegla: 'peligro-v0.1',
      },
      sinDato('lote-ensemble', 240),
      {
        geometryRef: 'lote-deterministico',
        horizonteHoras: 24,
        nivel: 'naranja',
        base: 'deterministico',
        probabilidadP95: null,
        probabilidadP99: null,
        precipitacionMm: 25,
        percentilReferencia: 'P95',
        emitidoEn: CORRIDA_NUEVA,
        validoHasta: '2026-09-27T00:00:00.000Z',
        versionRegla: 'peligro-v0.1',
      },
      {
        geometryRef: 'lote-deterministico',
        horizonteHoras: 72,
        nivel: 'rojo',
        base: 'deterministico',
        probabilidadP95: null,
        probabilidadP99: null,
        precipitacionMm: 40,
        percentilReferencia: 'P99',
        emitidoEn: CORRIDA_NUEVA,
        validoHasta: '2026-09-29T00:00:00.000Z',
        versionRegla: 'peligro-v0.1',
      },
      sinDato('lote-deterministico', 240),
      sinDato('lote-clima-parcial', 24),
      sinDato('lote-clima-parcial', 72),
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
})

describe('obtenerNivelCaudal', () => {
  it('usa el horizonte más chico de la corrida más reciente y calcula percentil/nivel', async () => {
    await insertarClimatologia('punto-1', 'caudal_diario', { p90: 50, p95: 100, p99: 140 })
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
    await insertarClimatologia('punto-rojo', 'caudal_diario', clim)
    await insertarClimatologia('punto-naranja', 'caudal_diario', clim)
    await insertarClimatologia('punto-amarillo', 'caudal_diario', clim)
    await insertarClimatologia('punto-verde', 'caudal_diario', clim)
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
    await insertarClimatologia('punto-sin-pronostico', 'caudal_diario', {
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
      versionRegla: 'peligro-v0.1',
    }
  }

  it('toma el PEOR nivel entre las celdas con escuelas del departamento', () => {
    const niveles = [
      nivelCelda('celda-1', 'verde'),
      nivelCelda('celda-2', 'naranja'),
      nivelCelda('celda-3', 'amarillo'),
    ]
    const resultado = agregarNivelPorDepartamento(
      niveles,
      { capital: ['celda-1', 'celda-2', 'celda-3'] },
      24,
    )
    expect(resultado).toEqual({ capital: 'naranja' })
  })

  it('ignora sin_dato si hay al menos una celda con nivel concreto', () => {
    const niveles = [nivelCelda('celda-1', 'sin_dato'), nivelCelda('celda-2', 'amarillo')]
    const resultado = agregarNivelPorDepartamento(
      niveles,
      { goya: ['celda-1', 'celda-2'] },
      24,
    )
    expect(resultado).toEqual({ goya: 'amarillo' })
  })

  it('devuelve sin_dato si TODAS las celdas del departamento están sin_dato (nunca verde por descarte)', () => {
    const niveles = [nivelCelda('celda-1', 'sin_dato'), nivelCelda('celda-2', 'sin_dato')]
    const resultado = agregarNivelPorDepartamento(
      niveles,
      { esquina: ['celda-1', 'celda-2'] },
      24,
    )
    expect(resultado).toEqual({ esquina: 'sin_dato' })
  })

  it('devuelve sin_dato si el departamento no tiene ninguna celda con nivel para ese horizonte', () => {
    const niveles = [nivelCelda('celda-1', 'rojo')]
    const resultado = agregarNivelPorDepartamento(
      niveles,
      { 'sin-datos': ['celda-inexistente'] },
      24,
    )
    expect(resultado).toEqual({ 'sin-datos': 'sin_dato' })
  })

  it('filtra por el horizonte pedido, no mezcla niveles de otro horizonte', () => {
    const niveles = [
      { ...nivelCelda('celda-1', 'rojo'), horizonteHoras: 72 as const },
      nivelCelda('celda-1', 'verde'),
    ]
    const resultado = agregarNivelPorDepartamento(niveles, { capital: ['celda-1'] }, 24)
    expect(resultado).toEqual({ capital: 'verde' })
  })
})