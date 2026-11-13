import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb, migrarDb } from '@/lib/db'
import { hidroLectura } from '@/lib/db/schema'
import { guardarLecturasPrefectura, type LecturaResuelta } from './lecturas-repo'

// seed: false evita sembrar datos; las migraciones se aplican explícitamente abajo.
usarDbTemporal('hidro-lecturas-fuente-', { seed: false })

const CAPTURADA_EN = '2026-11-13T04:00:00.000Z'
const CATALOGO = 'estacoes-ana-test'

const lectura: LecturaResuelta = {
  estacionId: '14990000',
  lecturaM: 16.28,
  variacionM: null,
  periodoHoras: null,
  medidaEn: '2026-11-13T03:45:00.000Z',
  estadoPublicado: 'normal',
  lecturaAnteriorM: null,
  medidaAnteriorEn: null,
  alertaM: 27,
  evacuacionM: 29,
  inconsistente: false,
  motivosInconsistencia: [],
}

describe('guardarLecturasPrefectura y la columna fuente', () => {
  let db: ReturnType<typeof getDb>

  beforeAll(async () => {
    await migrarDb()
    db = getDb()
  })

  beforeEach(async () => {
    await db.delete(hidroLectura)
  })

  it('guarda con fuente ana cuando se pasa fuente ana', async () => {
    const resultado = await guardarLecturasPrefectura(db, [lectura], {
      capturadaEn: CAPTURADA_EN,
      catalogoVersion: CATALOGO,
      fuente: 'ana',
    })

    expect(resultado).toEqual({ insertadas: 1, duplicadas: 0, sinFecha: 0 })
    const [fila] = await db.select().from(hidroLectura).where(eq(hidroLectura.estacionId, '14990000'))
    expect(fila?.fuente).toBe('ana')
  })

  it('sin fuente guarda con el default prefectura, como antes', async () => {
    await guardarLecturasPrefectura(db, [lectura], {
      capturadaEn: CAPTURADA_EN,
      catalogoVersion: CATALOGO,
    })

    const [fila] = await db.select().from(hidroLectura).where(eq(hidroLectura.estacionId, '14990000'))
    expect(fila?.fuente).toBe('prefectura')
  })
})
