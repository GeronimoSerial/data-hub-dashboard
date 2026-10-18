// Reglas v0.4 de la capa de peligro (T10): F5 acumulado por ventana, F6 caudal
// dentro de la ventana del horizonte, F8 ensemble filtrado por asOf y edad.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
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

async function horarias(geometryRef: string, desde: number, hasta: number, mm: number) {
  const filas = []
  for (let h = desde; h <= hasta; h++) filas.push(filaPronostico({ geometryRef, variable: 'precipitacion', corridaEn: CORRIDA, horizonteHoras: h, validoEn: hora(h), valor: mm }))
  await db.insert(hazardForecast).values(filas)
}

describe('F5 — precipitación determinística acumulada por ventana', () => {
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
