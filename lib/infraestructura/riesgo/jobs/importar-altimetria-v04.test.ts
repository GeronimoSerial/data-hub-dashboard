import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { asc, eq } from 'drizzle-orm'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb, migrarDb } from '@/lib/db'
import { infraAltimetriaEscolar } from '@/lib/db/schema'
import { crearAdapterAltimetriaV04 } from '../motor-v04/altimetria-adaptador'
import { importarAltimetriaV04 } from './importar-altimetria-v04'

usarDbTemporal('importar-altimetria-v04-', { seed: false })

const MUESTRA = readFileSync(
  path.join(__dirname, '..', 'motor-v04', '__fixtures__', 'altimetria-muestra.csv'),
  'utf8',
)
const AHORA = new Date('2026-10-17T12:00:00.000Z')
const RUTA = '/datos/elevacion.csv'

const importar = (texto: string, ahora = AHORA) =>
  importarAltimetriaV04({ ruta: RUTA, leerArchivo: async () => texto, ahora })

beforeAll(async () => {
  await migrarDb()
})

beforeEach(async () => {
  await getDb().delete(infraAltimetriaEscolar)
})

describe('importarAltimetriaV04', () => {
  it('importa candidatas y pendientes en una versión con sha256 y reporta contadores', async () => {
    const r = await importar(MUESTRA)
    if (r.estado !== 'completo') throw new Error(`se esperaba completo: ${JSON.stringify(r)}`)
    expect(r.contadores).toEqual({
      filas: 10,
      candidatas: 5,
      pendientes: 5,
      'pendiente:revisar_georreferencia': 2,
      'pendiente:sin_coordenadas': 2,
      'pendiente:sin_fuente_valida': 1,
      'fuente:copernicus': 2,
      'fuente:ign': 3,
    })
    const filas = await getDb().select().from(infraAltimetriaEscolar).orderBy(asc(infraAltimetriaEscolar.cueAnexo))
    expect(filas).toHaveLength(10)
    expect(new Set(filas.map((f) => f.version))).toEqual(new Set([r.version]))
    expect(filas[0].origenSha256).toMatch(/^[0-9a-f]{64}$/)

    const ign = filas.find((f) => f.cueAnexo === '1800912-00')
    expect(ign).toMatchObject({
      estado: 'candidata',
      cotaPrincipalM: 63.02098120591326,
      cotaConservadoraM: 62.038108825683594,
      fuenteConservadora: 'ign',
      fuentesValidas: 2,
    })
    const unica = filas.find((f) => f.cueAnexo === '1899901-00')
    expect(unica).toMatchObject({ cotaPrincipalM: null, cotaConservadoraM: 55.5, fuentesValidas: 1 })
    const sinCoord = filas.find((f) => f.cueAnexo === '1801176-01')
    expect(sinCoord).toMatchObject({ estado: 'pendiente', motivo: 'sin_coordenadas', cotaConservadoraM: null })
  })

  it('es idempotente por hash de archivo y conserva versiones anteriores', async () => {
    const primera = await importar(MUESTRA)
    const repetida = await importar(MUESTRA, new Date('2026-10-18T00:00:00.000Z'))
    expect(repetida).toMatchObject({ estado: 'ya_importado', version: primera.estado === 'completo' ? primera.version : '' })
    expect(await getDb().select().from(infraAltimetriaEscolar)).toHaveLength(10)

    const otra = MUESTRA.replace('55.5,,55.5', '55.25,,55.25')
    const segunda = await importar(otra, new Date('2026-10-19T00:00:00.000Z'))
    expect(segunda.estado).toBe('completo')
    expect(await getDb().select().from(infraAltimetriaEscolar)).toHaveLength(20)

    // El adaptador lee la última versión; la anterior sigue disponible.
    const ultima = await crearAdapterAltimetriaV04().obtener(['1899901-00', '1801176-01', '9999999-00'])
    expect(ultima?.version).toBe(segunda.estado === 'completo' ? segunda.version : '')
    expect(ultima?.porCue.get('1899901-00')).toMatchObject({ estado: 'candidata', cotaConservadoraM: 55.25 })
    expect(ultima?.porCue.get('1801176-01')).toEqual({ estado: 'pendiente', motivo: 'sin_coordenadas' })
    expect(ultima?.porCue.get('9999999-00')).toBeNull()
  })

  it('rechaza una cabecera distinta sin escribir filas', async () => {
    const r = await importar(MUESTRA.replace('fuente_menor_cota', 'fuente'))
    expect(r).toMatchObject({ estado: 'fallido' })
    expect(await getDb().select().from(infraAltimetriaEscolar)).toHaveLength(0)
  })

  it('rechaza el archivo completo si la cota o la fuente no coinciden con la regla recalculada', async () => {
    const alterada = MUESTRA.replace(
      '62.038108825683594,IGN_MDE_Ar_v2.1_30m',
      '62.038208825683594,IGN_MDE_Ar_v2.1_30m',
    )
    const r = await importar(alterada)
    expect(r).toEqual({ ejecutado: false, estado: 'fallido', mensaje: 'discrepancia con la regla', cuesDiscrepantes: ['1800912-00'] })

    const fuente = MUESTRA.replace(
      '60.52121002423245,Copernicus_GLO_30_SRVN16_aproximado',
      '60.52121002423245,IGN_MDE_Ar_v2.1_30m',
    )
    expect(await importar(fuente)).toMatchObject({ cuesDiscrepantes: ['1800643-00'] })
    expect(await getDb().select().from(infraAltimetriaEscolar).where(eq(infraAltimetriaEscolar.estado, 'candidata'))).toHaveLength(0)
  })

  it('sin archivo configurado falla sin lanzar', async () => {
    const r = await importarAltimetriaV04({ ruta: undefined, leerArchivo: async () => MUESTRA })
    expect(r).toMatchObject({ estado: 'fallido', mensaje: 'sin archivo de altimetría' })
  })
})
