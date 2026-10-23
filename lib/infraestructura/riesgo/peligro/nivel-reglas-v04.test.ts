// Reglas v0.4 de la capa de peligro (T10): F5 acumulado por ventana, F6 caudal
// dentro de la ventana del horizonte, F8 ensemble filtrado por asOf y edad.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { hazardClimatology, hazardEnsembleProb, hazardForecast } from '@/lib/db/schema'
import { filaClimatologia, filaEnsemble, filaPronostico, insertarClimatologia } from './__fixtures__/filas'
import type { getDb as GetDb } from '@/lib/db'
import type { obtenerNivelCaudal as ObtenerNivelCaudal, obtenerNivelesPeligro as ObtenerNivelesPeligro } from './nivel'

usarDbTemporal('nivel-peligro-v04-')

let db: ReturnType<typeof GetDb>
let obtenerNivelesPeligro: typeof ObtenerNivelesPeligro
let obtenerNivelCaudal: typeof ObtenerNivelCaudal

beforeAll(async () => {
  const { getDb } = await import('@/lib/db')
  db = getDb()
  ;({ obtenerNivelesPeligro, obtenerNivelCaudal } = await import('./nivel'))
})

beforeEach(async () => {
  await db.delete(hazardEnsembleProb)
  await db.delete(hazardForecast)
  await db.delete(hazardClimatology)
})

const CORRIDA = '2026-10-18T00:00:00.000Z'
const AHORA = new Date('2026-10-18T02:15:00.000Z')
const hora = (h: number) => new Date(Date.parse(CORRIDA) + h * 3_600_000).toISOString()

function registrarSqlSelects(conexion: ReturnType<typeof GetDb>) {
  type ConsultaSql = {
    toSQL(): { sql: string; params: unknown[] }
    then(resolver: (value: unknown) => unknown, rechazar: (error: unknown) => unknown): unknown
    [propiedad: string]: unknown
  }
  const consultas: Array<{ sql: string; params: unknown[]; rowCount: number | null }> = []
  const envolver = (query: unknown): unknown =>
    new Proxy(query as object, {
      get(objetivo, propiedad) {
        const consulta = objetivo as ConsultaSql
        if (propiedad === 'then') {
          return (resolver: (value: unknown) => unknown, rechazar: (error: unknown) => unknown) => {
            const registro = { ...consulta.toSQL(), rowCount: null as number | null }
            consultas.push(registro)
            return consulta.then(
              (resultado) => {
                registro.rowCount = Array.isArray(resultado) ? resultado.length : null
                return resolver(resultado)
              },
              rechazar,
            )
          }
        }
        const miembro = Reflect.get(consulta, propiedad, consulta)
        if (typeof miembro !== 'function') return miembro
        return (...args: unknown[]) => envolver(Reflect.apply(miembro, consulta, args))
      },
    } as ProxyHandler<object>)
  const dbSondeada = new Proxy(conexion, {
    get(objetivo, propiedad) {
      const miembro = Reflect.get(objetivo, propiedad, objetivo)
      if (propiedad !== 'select' && propiedad !== 'selectDistinctOn') {
        return typeof miembro === 'function' ? miembro.bind(objetivo) : miembro
      }
      return (...args: unknown[]) => envolver(Reflect.apply(miembro, objetivo, args))
    },
  })
  return { dbSondeada, consultas }
}

async function horarias(geometryRef: string, desde: number, hasta: number, mm: number) {
  const filas = []
  for (let h = desde; h <= hasta; h++) filas.push(filaPronostico({ geometryRef, variable: 'precipitacion', corridaEn: CORRIDA, horizonteHoras: h, validoEn: hora(h), valor: mm }))
  await db.insert(hazardForecast).values(filas)
}

describe('F5 — precipitación determinística acumulada por ventana', () => {
  it('limita filas históricas en SQL sin perder la ingesta previa elegible para cobertura', async () => {
    const ultima = '2026-10-18T00:00:00.000Z'
    const previa = '2026-10-17T18:00:00.000Z'
    const AHORA_RESPALDO = new Date('2026-10-18T02:15:00.000Z')
    const filas = (corridaEn: string, desde: number, hasta: number, valor: number) =>
      Array.from({ length: hasta - desde + 1 }, (_, indice) => {
        const horizonteHoras = desde + indice
        return filaPronostico({
          geometryRef: 'celda-sql-respaldo',
          variable: 'precipitacion',
          corridaEn,
          horizonteHoras,
          validoEn: new Date(Date.parse(corridaEn) + horizonteHoras * 3_600_000).toISOString(),
          valor,
        })
      })
    await db.insert(hazardForecast).values([
      ...filas(ultima, 221, 233, 9),
      ...filas(previa, 217, 240, 1),
      ...filas(ultima, 241, 241, 99),
      ...filas('2026-10-15T00:00:00.000Z', 217, 240, 30),
    ])
    await insertarClimatologia(db, 'celda-sql-respaldo', 'precipitacion_diaria', { p90: 10, p95: 20, p99: 30 })
    const { dbSondeada, consultas } = registrarSqlSelects(db)
    const moduloDb = await import('@/lib/db')
    const getDbSpy = vi.spyOn(moduloDb, 'getDb').mockReturnValue(dbSondeada)
    try {
      const niveles = await obtenerNivelesPeligro({
        geometryRefs: ['celda-sql-respaldo'],
        horizontes: [240],
        ahora: AHORA_RESPALDO,
        reglas: 'v0.4',
      })
      expect(niveles[0]).toMatchObject({ emitidoEn: previa, respaldoIngestaPrevia: true, precipitacionMm: 24 })
    } finally {
      getDbSpy.mockRestore()
    }
    const consultaPronostico = consultas.find(
      (consulta) => consulta.sql.includes('hazard_forecast') && !consulta.sql.includes('select distinct on'),
    )
    expect(consultaPronostico?.sql).toContain('"hazard_forecast"."corrida_en" <=')
    expect(consultaPronostico?.sql).toContain('"hazard_forecast"."corrida_en" >=')
    expect(consultaPronostico?.sql).toContain('"hazard_forecast"."corrida_en" =')
    expect(consultaPronostico?.sql).toContain('"hazard_forecast"."horizonte_horas" >')
    expect(consultaPronostico?.sql).toContain('"hazard_forecast"."horizonte_horas" <=')
    expect(consultaPronostico?.rowCount).toBe(37)
    expect(consultaPronostico?.params).not.toContain('2026-10-15T00:00:00.000Z')
  })

  it('conserva identidad de la corrida más reciente si no tiene horizontes útiles', async () => {
    const corridaReciente = '2026-10-18T00:00:00.000Z'
    const respaldoElegible = '2026-10-17T18:00:00.000Z'
    const respaldoVencido = '2026-10-17T00:00:00.000Z'
    const filas = (geometryRef: string, corridaEn: string, desde: number, hasta: number) =>
      Array.from({ length: hasta - desde + 1 }, (_, indice) => {
        const horizonteHoras = desde + indice
        return filaPronostico({
          geometryRef,
          variable: 'precipitacion',
          corridaEn,
          horizonteHoras,
          validoEn: new Date(Date.parse(corridaEn) + horizonteHoras * 3_600_000).toISOString(),
          valor: 1,
        })
      })
    await db.insert(hazardForecast).values([
      ...filas('celda-respaldo-identidad', corridaReciente, 241, 241),
      ...filas('celda-respaldo-identidad', respaldoElegible, 217, 240),
      ...filas('celda-respaldo-vencido', corridaReciente, 241, 241),
      ...filas('celda-respaldo-vencido', respaldoVencido, 217, 240),
    ])
    await insertarClimatologia(db, 'celda-respaldo-identidad', 'precipitacion_diaria', { p90: 10, p95: 20, p99: 30 })
    await insertarClimatologia(db, 'celda-respaldo-vencido', 'precipitacion_diaria', { p90: 10, p95: 20, p99: 30 })
    const { dbSondeada, consultas } = registrarSqlSelects(db)
    const moduloDb = await import('@/lib/db')
    const getDbSpy = vi.spyOn(moduloDb, 'getDb').mockReturnValue(dbSondeada)
    try {
      const niveles = await obtenerNivelesPeligro({
        geometryRefs: ['celda-respaldo-identidad', 'celda-respaldo-vencido'],
        horizontes: [240],
        ahora: AHORA,
        reglas: 'v0.4',
      })
      expect(niveles[0]).toMatchObject({ emitidoEn: respaldoElegible, respaldoIngestaPrevia: true, precipitacionMm: 24 })
      expect(niveles[1]).toMatchObject({ nivel: 'sin_dato' })
      expect(niveles[1].respaldoIngestaPrevia).toBeUndefined()
    } finally {
      getDbSpy.mockRestore()
    }
    const consultaPronostico = consultas.find(
      (consulta) => consulta.sql.includes('hazard_forecast') && !consulta.sql.includes('select distinct on'),
    )
    expect(consultaPronostico?.rowCount).toBe(24)
    expect(consultaPronostico?.params).not.toContain(respaldoVencido)
  })

  it('materializa sólo la fila más cercana al horizonte v0.3 solicitado', async () => {
    await db.insert(hazardForecast).values([
      filaPronostico({ geometryRef: 'celda-horizonte-sql', variable: 'precipitacion', corridaEn: CORRIDA, horizonteHoras: 23, validoEn: hora(23), valor: 5 }),
      filaPronostico({ geometryRef: 'celda-horizonte-sql', variable: 'precipitacion', corridaEn: CORRIDA, horizonteHoras: 25, validoEn: hora(25), valor: 9 }),
      filaPronostico({ geometryRef: 'celda-horizonte-sql', variable: 'precipitacion', corridaEn: CORRIDA, horizonteHoras: 300, validoEn: hora(300), valor: 99 }),
    ])
    const { dbSondeada, consultas } = registrarSqlSelects(db)
    const moduloDb = await import('@/lib/db')
    const getDbSpy = vi.spyOn(moduloDb, 'getDb').mockReturnValue(dbSondeada)
    try {
      const niveles = await obtenerNivelesPeligro({
        geometryRefs: ['celda-horizonte-sql'],
        horizontes: [24],
        ahora: AHORA,
      })
      expect(niveles[0]).toMatchObject({ emitidoEn: CORRIDA, precipitacionMm: 5 })
    } finally {
      getDbSpy.mockRestore()
    }
    const filasPronostico = consultas.filter(
      (consulta) => consulta.sql.includes('select distinct on') && consulta.sql.includes('hazard_forecast') && consulta.sql.includes('abs('),
    )
    expect(filasPronostico).toHaveLength(1)
    expect(filasPronostico[0].rowCount).toBe(1)
  })

  it('24 h: suma (0, 24] contra percentiles diarios; v0.3 compara un valor horario', async () => {
    await horarias('celda-f5', 0, 239, 3)
    await insertarClimatologia(db, 'celda-f5', 'precipitacion_diaria', { p90: 30, p95: 50, p99: 80 })
    const [v03] = await obtenerNivelesPeligro({ geometryRefs: ['celda-f5'], horizontes: [24], ahora: AHORA })
    expect(v03).toMatchObject({ nivel: 'verde', precipitacionMm: 3 })
    const v04 = await obtenerNivelesPeligro({ geometryRefs: ['celda-f5'], horizontes: [24, 72, 240], ahora: AHORA, reglas: 'v0.4' })
    expect(v04.map((n) => [n.horizonteHoras, n.nivel, n.precipitacionMm])).toEqual([
      [24, 'naranja', 72],
      [72, 'naranja', 72],
      // (216, 240] con la corrida hasta 239 h: 23 h cubiertas.
      [240, 'naranja', 69],
    ])
    expect(v04[0]).toMatchObject({ base: 'deterministico', metodo: 'percentiles', validoHasta: hora(24) })
  })

  it('ventana con menos de 18 h cubiertas no es pronóstico: sin dato', async () => {
    await horarias('celda-corta', 0, 228, 3)
    await insertarClimatologia(db, 'celda-corta', 'precipitacion_diaria', { p90: 30, p95: 50, p99: 80 })
    const [n240] = await obtenerNivelesPeligro({ geometryRefs: ['celda-corta'], horizontes: [240], ahora: AHORA, reglas: 'v0.4' })
    expect(n240.nivel).toBe('sin_dato')
  })

  it('sin climatología el umbral provisorio recibe lo acumulado en (0, h]', async () => {
    await horarias('celda-prov', 0, 239, 1)
    const r = await obtenerNivelesPeligro({ geometryRefs: ['celda-prov'], horizontes: [24, 72, 240], ahora: AHORA, reglas: 'v0.4' })
    // 24 mm (24 h) verde (< 50); 72 mm (72 h) verde (< 80); 239 mm (240 h) naranja (> 180, < 270).
    expect(r.map((n) => [n.nivel, n.precipitacionMm, n.metodo])).toEqual([
      ['verde', 24, 'umbral_provisorio'],
      ['verde', 72, 'umbral_provisorio'],
      ['naranja', 239, 'umbral_provisorio'],
    ])
  })
})

describe('F8 — ensemble filtrado por asOf y edad', () => {
  it('excluye corridas históricas en SQL y mantiene el as-of en el límite de consulta', async () => {
    await db.insert(hazardEnsembleProb).values([
      filaEnsemble({ geometryRef: 'celda-sql', corridaEn: '2026-10-17T00:00:00.000Z', horizonteHoras: 24, validoEn: '2026-10-18T00:00:00.000Z', probabilidadP95: 0, probabilidadP99: 0 }),
      filaEnsemble({ geometryRef: 'celda-sql', corridaEn: '2026-10-18T00:00:00.000Z', horizonteHoras: 24, validoEn: '2026-10-19T00:00:00.000Z', probabilidadP95: 0.9, probabilidadP99: 0.9 }),
      filaEnsemble({ geometryRef: 'celda-sql', corridaEn: '2026-10-18T00:00:00.000Z', horizonteHoras: 72, validoEn: '2026-10-21T00:00:00.000Z', probabilidadP95: 0, probabilidadP99: 0 }),
      filaEnsemble({ geometryRef: 'celda-sql', corridaEn: '2026-10-18T00:00:00.000Z', horizonteHoras: 300, validoEn: '2026-10-30T12:00:00.000Z', probabilidadP95: 0, probabilidadP99: 0 }),
    ])
    const { dbSondeada, consultas } = registrarSqlSelects(db)
    const moduloDb = await import('@/lib/db')
    const getDbSpy = vi.spyOn(moduloDb, 'getDb').mockReturnValue(dbSondeada)
    try {
      const niveles = await obtenerNivelesPeligro({
        geometryRefs: ['celda-sql'],
        horizontes: [24, 72],
        ahora: AHORA,
        reglas: 'v0.4',
      })
      expect(niveles.map(({ horizonteHoras, emitidoEn }) => [horizonteHoras, emitidoEn])).toEqual([
        [24, '2026-10-18T00:00:00.000Z'],
        [72, '2026-10-18T00:00:00.000Z'],
      ])
    } finally {
      getDbSpy.mockRestore()
    }

    const consultasEnsemble = consultas.filter((consulta) => consulta.sql.includes('hazard_ensemble_prob'))
    expect(consultasEnsemble).toHaveLength(3)
    expect(consultasEnsemble[0].sql).toContain('"hazard_ensemble_prob"."corrida_en" <=')
    expect(consultasEnsemble[0].sql).toContain('"hazard_ensemble_prob"."corrida_en" >=')
    const filasEnsemble = consultasEnsemble.filter(
      (consulta) => consulta.sql.includes('select distinct on') && consulta.sql.includes('"hazard_ensemble_prob"."corrida_en" ='),
    )
    expect(filasEnsemble).toHaveLength(2)
    expect(filasEnsemble.every((consulta) =>
      consulta.sql.includes('abs("hazard_ensemble_prob"."horizonte_horas" - $') && consulta.rowCount === 1,
    )).toBe(true)
  })

  it('una corrida posterior a asOf no se usa (ambas reglas)', async () => {
    await db.insert(hazardEnsembleProb).values([
      filaEnsemble({ geometryRef: 'celda-ens', corridaEn: '2026-10-17T18:00:00.000Z', horizonteHoras: 24, validoEn: '2026-10-18T18:00:00.000Z', probabilidadP95: 0, probabilidadP99: 0 }),
      filaEnsemble({ geometryRef: 'celda-ens', corridaEn: '2026-10-18T06:00:00.000Z', horizonteHoras: 24, validoEn: '2026-10-19T06:00:00.000Z', probabilidadP95: 0.9, probabilidadP99: 0.9 }),
    ])
    for (const reglas of ['v0.3', 'v0.4'] as const) {
      const [n] = await obtenerNivelesPeligro({ geometryRefs: ['celda-ens'], horizontes: [24], ahora: AHORA, reglas })
      expect(n).toMatchObject({ base: 'ensemble', nivel: 'verde', emitidoEn: '2026-10-17T18:00:00.000Z' })
    }
  })

  it('v0.4: una corrida de más de 36 h cae al determinístico', async () => {
    await db.insert(hazardEnsembleProb).values(
      filaEnsemble({ geometryRef: 'celda-vieja', corridaEn: '2026-10-16T00:00:00.000Z', horizonteHoras: 24, validoEn: '2026-10-17T00:00:00.000Z', probabilidadP95: 0.9, probabilidadP99: 0.9 }),
    )
    await horarias('celda-vieja', 0, 239, 0)
    await insertarClimatologia(db, 'celda-vieja', 'precipitacion_diaria', { p90: 30, p95: 50, p99: 80 })
    const [v03] = await obtenerNivelesPeligro({ geometryRefs: ['celda-vieja'], horizontes: [24], ahora: AHORA })
    expect(v03).toMatchObject({ base: 'ensemble', nivel: 'rojo' })
    const [v04] = await obtenerNivelesPeligro({ geometryRefs: ['celda-vieja'], horizontes: [24], ahora: AHORA, reglas: 'v0.4' })
    expect(v04).toMatchObject({ base: 'deterministico', nivel: 'verde' })
  })
})

describe('F6 — caudal dentro de la ventana del horizonte', () => {
  async function caudal() {
    await db.insert(hazardClimatology).values(
      (['p90', 'p95', 'p99'] as const).map((percentil, i) =>
        filaClimatologia({ geometryRef: 'punto-f6', variable: 'caudal_diario', percentil, valor: [100, 120, 140][i], calculadoEn: '2026-10-01T00:00:00.000Z' }),
      ),
    )
    await db.insert(hazardForecast).values(
      [[6, 50], [60, 150], [200, 90]].map(([h, valor]) => filaPronostico({ geometryRef: 'punto-f6', variable: 'caudal', corridaEn: CORRIDA, horizonteHoras: h, validoEn: hora(h), valor })),
    )
  }

  it('v0.3 usa el horizonte más chico; v0.4 el máximo de (0, h]', async () => {
    await caudal()
    expect(await obtenerNivelCaudal('punto-f6', { ahora: AHORA })).toMatchObject({ nivel: 'verde' })
    expect(await obtenerNivelCaudal('punto-f6', { ahora: AHORA, reglas: 'v0.4', horizonteHoras: 24 })).toMatchObject({ nivel: 'verde' })
    expect(await obtenerNivelCaudal('punto-f6', { ahora: AHORA, reglas: 'v0.4', horizonteHoras: 72 })).toMatchObject({ nivel: 'rojo', validoHasta: hora(60) })
    expect(await obtenerNivelCaudal('punto-f6', { ahora: AHORA, reglas: 'v0.4', horizonteHoras: 240 })).toMatchObject({ nivel: 'rojo' })
  })

  it('sin climatología sigue siendo null (sin dato)', async () => {
    await db.insert(hazardForecast).values(filaPronostico({ geometryRef: 'punto-sin', variable: 'caudal', corridaEn: CORRIDA, horizonteHoras: 6, validoEn: hora(6), valor: 50 }))
    expect(await obtenerNivelCaudal('punto-sin', { ahora: AHORA, reglas: 'v0.4', horizonteHoras: 72 })).toBeNull()
  })
})
