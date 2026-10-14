import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb, migrarDb } from '@/lib/db'
import { hidroLectura } from '@/lib/db/schema'
import type { LecturaResuelta } from './lecturas-repo'
import { guardarLecturasPrefectura, ultimaLecturaEstacion } from './lecturas-repo'

// seed: false evita sembrar datos; las migraciones se aplican explícitamente abajo.
usarDbTemporal('hidro-lecturas-repo-', { seed: false })

const CAPTURADA_EN = '2026-10-13T12:00:00.000Z'
const CATALOGO = 'estaciones-prefectura-v1'

function lectura(sobrescribir: Partial<LecturaResuelta> = {}): LecturaResuelta {
  return {
    estacionId: 'corrientes-ciudad',
    lecturaM: 3.45,
    variacionM: 0.02,
    periodoHoras: 1,
    medidaEn: '2026-10-13T15:00:00.000Z',
    estadoPublicado: 'CRECE',
    lecturaAnteriorM: 3.43,
    medidaAnteriorEn: '2026-10-13T14:00:00.000Z',
    alertaM: 5,
    evacuacionM: 6,
    inconsistente: false,
    motivosInconsistencia: [],
    ...sobrescribir,
  }
}

describe('guardarLecturasPrefectura', () => {
  let db: ReturnType<typeof getDb>

  beforeAll(async () => {
    await migrarDb()
    db = getDb()
  })

  beforeEach(async () => {
    await db.delete(hidroLectura)
  })

  it('inserta las lecturas nuevas y las cuenta como insertadas', async () => {
    const resultado = await guardarLecturasPrefectura(
      db,
      [lectura(), lectura({ estacionId: 'goya', medidaEn: '2026-10-13T15:00:00.000Z' })],
      { capturadaEn: CAPTURADA_EN, catalogoVersion: CATALOGO },
    )

    expect(resultado).toEqual({ insertadas: 2, duplicadas: 0, sinFecha: 0 })
    const filas = await db.select().from(hidroLectura)
    expect(filas).toHaveLength(2)
    const corrientes = filas.find((f) => f.estacionId === 'corrientes-ciudad')
    expect(corrientes).toMatchObject({
      fuente: 'prefectura',
      lecturaM: 3.45,
      medidaEn: '2026-10-13T15:00:00.000Z',
      estadoPublicado: 'CRECE',
      inconsistente: false,
      catalogoVersion: CATALOGO,
      capturadaEn: CAPTURADA_EN,
    })
    expect(corrientes?.hashOriginal).toMatch(/^[0-9a-f]{64}$/)
  })

  it('omite una lectura ya guardada y no la sobrescribe', async () => {
    await guardarLecturasPrefectura(db, [lectura()], {
      capturadaEn: CAPTURADA_EN,
      catalogoVersion: CATALOGO,
    })

    const resultado = await guardarLecturasPrefectura(
      db,
      [lectura({ lecturaM: 9.99, estadoPublicado: 'BAJA' })],
      { capturadaEn: '2026-10-13T13:00:00.000Z', catalogoVersion: 'estaciones-prefectura-v2' },
    )

    expect(resultado).toEqual({ insertadas: 0, duplicadas: 1, sinFecha: 0 })
    const filas = await db
      .select()
      .from(hidroLectura)
      .where(eq(hidroLectura.estacionId, 'corrientes-ciudad'))
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({ lecturaM: 3.45, estadoPublicado: 'CRECE', catalogoVersion: CATALOGO })
  })

  it('no inserta lecturas sin fecha y las cuenta como sinFecha', async () => {
    const resultado = await guardarLecturasPrefectura(
      db,
      [lectura({ medidaEn: null, motivosInconsistencia: ['fecha_no_interpretable:medidaEn'], inconsistente: true })],
      { capturadaEn: CAPTURADA_EN, catalogoVersion: CATALOGO },
    )

    expect(resultado).toEqual({ insertadas: 0, duplicadas: 0, sinFecha: 1 })
    expect(await db.select().from(hidroLectura)).toHaveLength(0)
  })

  it('persiste el flag de inconsistencia y sus motivos', async () => {
    await guardarLecturasPrefectura(
      db,
      [
        lectura({
          lecturaM: 0,
          estadoPublicado: 'CRECE',
          inconsistente: true,
          motivosInconsistencia: ['lectura_cero_con_crece'],
        }),
      ],
      { capturadaEn: CAPTURADA_EN, catalogoVersion: CATALOGO },
    )

    const [fila] = await db.select().from(hidroLectura)
    expect(fila).toMatchObject({
      inconsistente: true,
      motivosInconsistencia: ['lectura_cero_con_crece'],
      lecturaM: 0,
    })
  })

  it('calcula un hash determinista que cambia con el contenido de la fila', async () => {
    await guardarLecturasPrefectura(
      db,
      [lectura(), lectura({ estacionId: 'goya', lecturaM: 3.46 })],
      { capturadaEn: CAPTURADA_EN, catalogoVersion: CATALOGO },
    )

    const filas = await db.select().from(hidroLectura)
    const hashPorEstacion = new Map(filas.map((f) => [f.estacionId, f.hashOriginal]))
    expect(hashPorEstacion.get('corrientes-ciudad')).not.toBe(hashPorEstacion.get('goya'))

    await db.delete(hidroLectura)
    await guardarLecturasPrefectura(db, [lectura()], {
      capturadaEn: CAPTURADA_EN,
      catalogoVersion: CATALOGO,
    })
    const [repetida] = await db.select().from(hidroLectura)
    expect(repetida?.hashOriginal).toBe(hashPorEstacion.get('corrientes-ciudad'))
  })
})

describe('ultimaLecturaEstacion', () => {
  let db: ReturnType<typeof getDb>

  beforeAll(async () => {
    await migrarDb()
    db = getDb()
  })

  beforeEach(async () => {
    await db.delete(hidroLectura)
  })

  it('devuelve null cuando la estación no tiene lecturas', async () => {
    expect(await ultimaLecturaEstacion(db, 'corrientes-ciudad')).toBeNull()
  })

  it('devuelve la lectura con medidaEn más reciente de la estación', async () => {
    await guardarLecturasPrefectura(
      db,
      [
        lectura({ medidaEn: '2026-10-13T12:00:00.000Z', lecturaM: 3.1 }),
        lectura({ medidaEn: '2026-10-13T15:00:00.000Z', lecturaM: 3.45 }),
        lectura({ medidaEn: '2026-10-13T13:00:00.000Z', lecturaM: 3.2 }),
        lectura({ estacionId: 'goya', medidaEn: '2026-10-14T00:00:00.000Z', lecturaM: 1.0 }),
      ],
      { capturadaEn: CAPTURADA_EN, catalogoVersion: CATALOGO },
    )

    const ultima = await ultimaLecturaEstacion(db, 'corrientes-ciudad')
    expect(ultima).toMatchObject({
      estacionId: 'corrientes-ciudad',
      medidaEn: '2026-10-13T15:00:00.000Z',
      lecturaM: 3.45,
    })
  })
})
