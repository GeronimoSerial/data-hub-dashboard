import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb, migrarDb } from '@/lib/db'
import { hazardSourceHealth, hidroInaCorrida, hidroInaPronostico, hidroLoteCrudo } from '@/lib/db/schema'
import corrida499 from '../__fixtures__/ina/corrida-499.json'
import corrida289 from '../__fixtures__/ina/corrida-289.json'
import { crearClienteA5 } from './cliente-a5'
import { sincronizarPronosticoIna } from './sync-ina-pronostico'

usarDbTemporal('ina-sync-pronostico-', { seed: false })

beforeAll(async () => {
  await migrarDb()
})

beforeEach(async () => {
  const db = getDb()
  await db.delete(hidroInaPronostico)
  await db.delete(hidroInaCorrida)
  await db.delete(hidroLoteCrudo)
  await db.delete(hazardSourceHealth)
})

const AHORA = new Date('2026-10-18T00:01:00.000Z')

// 289 responde la fixture real; 499 cuelga hasta el timeout.
function cliente(fallar499: boolean) {
  return crearClienteA5({
    timeoutMs: 5,
    maxIntentos: 1,
    fetchImpl: async (url) => {
      if (String(url).includes('/calibrados/499/')) {
        if (fallar499) return new Promise<Response>(() => {})
        return new Response(JSON.stringify(corrida499))
      }
      return new Response(JSON.stringify(corrida289))
    },
  })
}

describe('sincronizarPronosticoIna', () => {
  it('guarda el producto que responde aunque el otro falle', async () => {
    const r = await sincronizarPronosticoIna({ cliente: cliente(true), ahora: AHORA })
    expect(r).toMatchObject({ ejecutado: true, estado: 'parcial', solicitudes: 2 })
    expect(r.porCalibrado['289']).toMatchObject({ estado: 'nueva', corId: 1232811, forecastDate: '2026-10-16T03:00:00.000Z', insertadas: 18 })
    expect(r.porCalibrado['499']).toMatchObject({ estado: 'fallido' })
    expect(r.porCalibrado['499'].error!.length).toBeLessThanOrEqual(200)
    expect(await getDb().select().from(hidroInaCorrida)).toHaveLength(1)
    const [salud] = await getDb().select().from(hazardSourceHealth).where(eq(hazardSourceHealth.provider, 'ina-a5-pronostico'))
    expect(salud).toMatchObject({ estado: 'degradado' })
  })

  it('deduplica por corrida y guarda las series sin estación propia', async () => {
    await sincronizarPronosticoIna({ cliente: cliente(false), ahora: AHORA })
    const r = await sincronizarPronosticoIna({ cliente: cliente(false), ahora: new Date('2026-10-18T06:00:00.000Z') })
    expect(r.estado).toBe('completo')
    expect(r.porCalibrado['499']).toMatchObject({ estado: 'existente', insertadas: 0 })
    expect(r.porCalibrado['289']).toMatchObject({ estado: 'existente', insertadas: 0 })
    expect(await getDb().select().from(hidroInaPronostico)).toHaveLength(24 + 18)
    expect(await getDb().select().from(hidroLoteCrudo)).toHaveLength(2)
    const sinResolver = await getDb().select().from(hidroInaPronostico).where(eq(hidroInaPronostico.seriesId, 34881))
    expect(sinResolver).toHaveLength(6)
    expect(sinResolver[0]).toMatchObject({ estacionId: null, unidad: null, soporte: 'desconocido' })
  })
})
