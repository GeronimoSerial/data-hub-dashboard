import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb } from '@/lib/db'
import { hazardObservation } from '@/lib/db/schema'
import { RETENCION_IMERG_DIAS, purgarImergAntiguo } from './retencion-imerg'

usarDbTemporal('retencion-imerg-')

const AHORA = new Date('2027-01-08T12:00:00.000Z')
// Corte exacto: AHORA - 90 días.
const CORTE = '2026-10-10T12:00:00.000Z'

function fila(id: string, observadoEn: string, provider = 'nasa-imerg', variable = 'precipitacion_observada_satelital') {
  return {
    id,
    provider,
    variable,
    geometryRef: `g-${id}`,
    valor: 1,
    unidad: 'mm/h',
    observadoEn,
    validoDesde: observadoEn,
    validoHasta: observadoEn,
    ingeridoEn: observadoEn,
  }
}

async function ids(): Promise<string[]> {
  const filas = await getDb().select({ id: hazardObservation.id }).from(hazardObservation)
  return filas.map((f) => f.id).sort()
}

beforeEach(async () => {
  await getDb().delete(hazardObservation)
})

describe('purgarImergAntiguo', () => {
  it('la retención por defecto es de 90 días', () => {
    expect(RETENCION_IMERG_DIAS).toBe(90)
  })

  it('borra lo anterior al corte y conserva lo posterior', async () => {
    await getDb().insert(hazardObservation).values([
      fila('vieja', '2026-10-10T11:59:59.999Z'),
      fila('muy-vieja', '2026-09-01T00:00:00.000Z'),
      fila('reciente', '2026-10-10T12:00:00.001Z'),
      fila('hoy', '2027-01-08T11:30:00.000Z'),
    ])

    const r = await purgarImergAntiguo(getDb(), { ahora: AHORA })

    expect(await ids()).toEqual(['hoy', 'reciente'])
    expect(r).toMatchObject({ borradas: 2, corte: CORTE })
  })

  it('el límite exacto de 90 días se conserva (borra sólo observado_en < corte)', async () => {
    await getDb().insert(hazardObservation).values([fila('justo', CORTE)])
    await purgarImergAntiguo(getDb(), { ahora: AHORA })
    expect(await ids()).toEqual(['justo'])
  })

  it('no toca otros proveedores ni otras tablas aunque sean viejos', async () => {
    await getDb().insert(hazardObservation).values([
      fila('imerg-viejo', '2026-01-01T00:00:00.000Z'),
      fila('otro-viejo', '2026-01-01T00:00:00.000Z', 'otro-proveedor'),
    ])
    await purgarImergAntiguo(getDb(), { ahora: AHORA })
    expect(await ids()).toEqual(['otro-viejo'])
  })

  it('cubre todas las variables de IMERG', async () => {
    await getDb().insert(hazardObservation).values([
      fila('v1', '2026-01-01T00:00:00.000Z', 'nasa-imerg', 'otra_variable_imerg'),
      fila('v2', '2026-01-01T00:00:00.000Z'),
    ])
    await purgarImergAntiguo(getDb(), { ahora: AHORA })
    expect(await ids()).toEqual([])
  })

  it('borra por lotes: más filas que el tamaño de lote', async () => {
    const viejas = Array.from({ length: 25 }, (_, i) =>
      fila(`v-${String(i).padStart(2, '0')}`, `2026-09-${String((i % 28) + 1).padStart(2, '0')}T00:00:00.000Z`),
    )
    await getDb().insert(hazardObservation).values([...viejas, fila('nueva', '2027-01-08T00:00:00.000Z')])

    const r = await purgarImergAntiguo(getDb(), { ahora: AHORA, tamanoLote: 10 })

    expect(r.borradas).toBe(25)
    expect(r.lotes).toBe(3)
    expect(await ids()).toEqual(['nueva'])
  })

  it('maxLotes acota el trabajo de una corrida; el resto cae en la siguiente', async () => {
    await getDb().insert(hazardObservation).values(
      Array.from({ length: 12 }, (_, i) => fila(`m-${i}`, '2026-09-01T00:00:00.000Z')),
    )
    const r = await purgarImergAntiguo(getDb(), { ahora: AHORA, tamanoLote: 5, maxLotes: 2 })
    expect(r).toMatchObject({ borradas: 10, lotes: 2 })
    expect((await ids()).length).toBe(2)
  })

  it('rechaza una retención menor al piso y parámetros inválidos', async () => {
    await expect(purgarImergAntiguo(getDb(), { ahora: AHORA, dias: 3 })).rejects.toThrow()
    await expect(purgarImergAntiguo(getDb(), { ahora: AHORA, tamanoLote: 0 })).rejects.toThrow()
  })

  it('el filtro usa provider, no una variable fija (control de que no borra por id)', async () => {
    await getDb().insert(hazardObservation).values([fila('x', '2026-01-01T00:00:00.000Z')])
    await purgarImergAntiguo(getDb(), { ahora: AHORA })
    const quedan = await getDb().select().from(hazardObservation).where(eq(hazardObservation.id, 'x'))
    expect(quedan).toHaveLength(0)
  })
})
