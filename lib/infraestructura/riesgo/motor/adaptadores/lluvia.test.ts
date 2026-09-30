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
import type { crearAdapterLluvia as CrearAdapterLluvia } from './lluvia'

const AS_OF = '2026-09-26T12:00:00.000Z'
const CELDA = 'geom-1'
const { granulosConsecutivos } = crearGeneradoresGranulos(CELDA)

usarDbTemporal('adapter-lluvia-')

beforeAll(async () => {
  const { getDb } = await import('@/lib/db')
  db = getDb()
  ;({ crearAdapterLluvia } = await import('./lluvia'))
})

let db: ReturnType<typeof GetDb>
let crearAdapterLluvia: typeof CrearAdapterLluvia

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
