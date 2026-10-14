// Tests del adapter real de PuertoLluviaObservada. Delega en
// peligro/observado.ts (E3a), que lee `hazard_observation`. Se sigue el mismo
// patrón de DB en memoria que observado.test.ts: DATA_DIR temporal +
// ensureSeeded y borrado de la tabla entre tests. Nunca se golpea la red (no
// hay ningún fetch a IMERG/Earthdata acá).
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { hazardObservation } from '@/lib/db/schema'
import { crearGeneradoresGranulos } from '../../__fixtures__/granulos'
import type { getDb as GetDb } from '@/lib/db'
import type { LluviaObservadaCelda } from '../puertos'
import type {
  crearAdapterLluvia as CrearAdapterLluvia,
  reducirClimatologiaObservada as ReducirClimatologiaObservada,
} from './lluvia'

const AS_OF = '2026-09-26T12:00:00.000Z'
const CELDA = 'geom-1'
const { granulosConsecutivos } = crearGeneradoresGranulos(CELDA)

usarDbTemporal('adapter-lluvia-')

beforeAll(async () => {
  const { getDb } = await import('@/lib/db')
  db = getDb()
  ;({ crearAdapterLluvia, reducirClimatologiaObservada } = await import('./lluvia'))
})

let db: ReturnType<typeof GetDb>
let crearAdapterLluvia: typeof CrearAdapterLluvia
let reducirClimatologiaObservada: typeof ReducirClimatologiaObservada

beforeEach(async () => {
  await db.delete(hazardObservation)
})

describe('crearAdapterLluvia.obtenerAcumulado', () => {
  it('con datos observados arma el shape con acumulados 24h/72h y observadoEn', async () => {
    await db.insert(hazardObservation).values(granulosConsecutivos(AS_OF, 144, 1))

    const celda = await crearAdapterLluvia().obtenerAcumulado({ geometryRef: CELDA, asOf: AS_OF })

    const esperada: LluviaObservadaCelda = {
      geometryRef: CELDA,
      acumuladoMm24h: 48,
      acumuladoMm72h: 144,
      observadoEn: AS_OF,
      fuente24h: 'nasa-imerg',
      fuente72h: 'nasa-imerg',
      climatologia24h: null,
      climatologia72h: null,
    }
    expect(celda).toEqual(esperada)
  })

  it('sin filas en el rango devuelve null explícito (no 0, no error)', async () => {
    const celda = await crearAdapterLluvia().obtenerAcumulado({ geometryRef: CELDA, asOf: AS_OF })

    expect(celda).toEqual({
      geometryRef: CELDA,
      acumuladoMm24h: null,
      acumuladoMm72h: null,
      observadoEn: null,
      climatologia24h: null,
      climatologia72h: null,
    })
  })

  it('con cobertura insuficiente los acumulados son null (nunca un valor subestimado)', async () => {
    // 30 de 48 gránulos esperados en 24 h (cobertura < 0.8).
    await db.insert(hazardObservation).values(granulosConsecutivos(AS_OF, 30, 1))

    const celda = await crearAdapterLluvia().obtenerAcumulado({ geometryRef: CELDA, asOf: AS_OF })

    expect(celda.acumuladoMm24h).toBeNull()
    expect(celda.acumuladoMm72h).toBeNull()
    expect(celda.observadoEn).toBe(AS_OF)
  })
})

describe('crearAdapterLluvia — preferencia por estación SYNOP', () => {
  // Celda de Corrientes Capital (~3 km de Corrientes Aero 87166).
  const CELDA_CAPITAL = '-27.5_-58.8'
  const AS_OF_SYNOP = '2026-10-14T01:30:00.000Z'
  const p = (observadoEn: string, mm: number) => ({
    estacionWmo: '87166',
    observadoEn,
    periodoHoras: 6,
    precipitacionMm: mm,
    traza: false,
    seccion: 1 as const,
  })
  const registros = [
    p('2026-10-13T06:00:00.000Z', 0.6),
    p('2026-10-13T12:00:00.000Z', 3),
    p('2026-10-13T18:00:00.000Z', 0.2),
    p('2026-10-14T00:00:00.000Z', 1),
  ]

  it('usa la medición de la estación (24 h) y registra la fuente', async () => {
    await db.insert(hazardObservation).values(granulosConsecutivos(AS_OF, 144, 1))
    const adapter = crearAdapterLluvia({ cargarSynop: async () => registros })
    const celda = await adapter.obtenerAcumulado({ geometryRef: CELDA_CAPITAL, asOf: AS_OF_SYNOP })
    expect(celda.acumuladoMm24h).toBe(4.8)
    expect(celda.fuente24h).toMatch(/^synop:87166/)
    // 72 h sin cobertura SYNOP suficiente: no se inventa; queda IMERG (aquí sin datos => null).
    expect(celda.fuente72h ?? '').not.toMatch(/^synop/)
  })

  it('celda lejos de toda estación: sólo IMERG, sin consultar SYNOP', async () => {
    let llamadas = 0
    const adapter = crearAdapterLluvia({
      cargarSynop: async () => {
        llamadas += 1
        return registros
      },
    })
    const celda = await adapter.obtenerAcumulado({ geometryRef: '-28.6_-57.0', asOf: AS_OF_SYNOP })
    expect(llamadas).toBe(0)
    expect(celda.fuente24h).toBeUndefined()
  })

  it('carga cada estación una sola vez por asOf', async () => {
    let llamadas = 0
    const adapter = crearAdapterLluvia({
      cargarSynop: async () => {
        llamadas += 1
        return registros
      },
    })
    await adapter.obtenerAcumulado({ geometryRef: CELDA_CAPITAL, asOf: AS_OF_SYNOP })
    await adapter.obtenerAcumulado({ geometryRef: '-27.4_-58.8', asOf: AS_OF_SYNOP })
    expect(llamadas).toBe(1)
  })
})

describe('crearAdapterLluvia — climatología observada de la celda', () => {
  it('adjunta la climatología por ventana cuando existe y null cuando no', async () => {
    const adapter = crearAdapterLluvia({
      cargarSynop: async () => [],
      cargarClimatologia: async () =>
        new Map([
          ['geom-con-clima', { 72: { p90: 20, p95: 30, p99: 50, version: 'imerg-clim-v1' } }],
        ]),
    })
    const con = await adapter.obtenerAcumulado({ geometryRef: 'geom-con-clima', asOf: AS_OF })
    const sin = await adapter.obtenerAcumulado({ geometryRef: 'geom-sin-clima', asOf: AS_OF })
    expect(con.climatologia72h).toEqual({ p90: 20, p95: 30, p99: 50, version: 'imerg-clim-v1' })
    expect(con.climatologia24h).toBeNull()
    expect(sin.climatologia72h).toBeNull()
  })

  it('si la carga de climatología falla, sigue con null (umbral absoluto), nunca lanza', async () => {
    const adapter = crearAdapterLluvia({
      cargarSynop: async () => [],
      cargarClimatologia: async () => {
        throw new Error('db caída')
      },
    })
    const celda = await adapter.obtenerAcumulado({ geometryRef: 'geom-x', asOf: AS_OF })
    expect(celda.climatologia24h).toBeNull()
  })
})

describe('reducirClimatologiaObservada — contrato con climatologia-imerg', () => {
  const fila = (o: Partial<Parameters<typeof ReducirClimatologiaObservada>[0][number]>) => ({
    geometryRef: 'c1',
    variable: 'precipitacion_diaria',
    percentil: 'p90',
    muestra: 'todos_los_dias',
    valor: 10,
    version: 'climatologia-imerg-v1',
    calculadoEn: '2026-10-14T00:00:00.000Z',
    ...o,
  })

  it('usa la climatología diaria IMERG (p90/p95/p99) para la ventana de 24 h', () => {
    const m = reducirClimatologiaObservada([
      fila({ percentil: 'p90', valor: 18 }),
      fila({ percentil: 'p95', valor: 30 }),
      fila({ percentil: 'p99', valor: 60 }),
    ])
    expect(m.get('c1')).toEqual({ 24: { p90: 18, p95: 30, p99: 60, version: 'climatologia-imerg-v1' } })
  })

  it('ignora climatología diaria no IMERG (ERA5), días húmedos e incompleta', () => {
    const m = reducirClimatologiaObservada([
      fila({ version: 'climatologia-v2-progresiva', percentil: 'p90' }),
      fila({ version: 'climatologia-v2-progresiva', percentil: 'p95' }),
      fila({ version: 'climatologia-v2-progresiva', percentil: 'p99' }),
      fila({ geometryRef: 'c2', muestra: 'dias_humedos', percentil: 'p90' }),
      fila({ geometryRef: 'c2', muestra: 'dias_humedos', percentil: 'p95' }),
      fila({ geometryRef: 'c2', muestra: 'dias_humedos', percentil: 'p99' }),
      fila({ geometryRef: 'c3', percentil: 'p90' }),
    ])
    expect(m.size).toBe(0)
  })

  it('acepta una climatología de 72 h explícita (precipitacion_observada_72h, P90 en mayúscula)', () => {
    const m = reducirClimatologiaObservada([
      fila({ variable: 'precipitacion_observada_72h', percentil: 'P90', valor: 40 }),
      fila({ variable: 'precipitacion_observada_72h', percentil: 'P95', valor: 60 }),
      fila({ variable: 'precipitacion_observada_72h', percentil: 'P99', valor: 90 }),
    ])
    expect(m.get('c1')?.[72]).toMatchObject({ p90: 40, p95: 60, p99: 90 })
  })
})
