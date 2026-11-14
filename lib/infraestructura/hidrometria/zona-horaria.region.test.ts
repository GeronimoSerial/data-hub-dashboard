import { beforeAll, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb, migrarDb } from '@/lib/db'
import { consultarHistoriaEstacion } from './lecturas-repo'

usarDbTemporal('hidro-zona-horaria-', { seed: false })

describe('consultarHistoriaEstacion informa la zona horaria de la región', () => {
  beforeAll(async () => {
    await migrarDb()
  }, 60_000)

  it('devuelve zonaHorariaReferencia de Corrientes', async () => {
    const respuesta = await consultarHistoriaEstacion(getDb(), {
      estacionId: 'pna-corrientes',
      desde: '2026-10-01T00:00:00.000Z',
      hasta: '2026-10-05T00:00:00.000Z',
    })
    expect(respuesta.fuente.zonaHorariaReferencia).toBe('America/Argentina/Buenos_Aires')
  })
})
