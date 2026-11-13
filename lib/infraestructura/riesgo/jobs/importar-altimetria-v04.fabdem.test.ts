import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { asc } from 'drizzle-orm'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb, migrarDb } from '@/lib/db'
import { infraAltimetriaEscolar } from '@/lib/db/schema'
import { __reiniciarRegionActivaParaPruebas } from '@/lib/infraestructura/region/activa'
import { importarAltimetriaV04 } from './importar-altimetria-v04'

usarDbTemporal('importar-altimetria-v04-fabdem-', { seed: false })

const MUESTRA = readFileSync(
  path.join(__dirname, '..', 'motor-v04', '__fixtures__', 'altimetria-muestra.csv'),
  'utf8',
)
const AHORA = new Date('2026-10-17T12:00:00.000Z')
const RUTA = '/datos/elevacion.csv'

const CONVERSION_COPERNICUS =
  'Copernicus GLO-30 EGM2008 convertido a SRVN16 (GEOIDE-Ar16) de forma aproximada; IGN MDE-Ar v2.1 en SRVN16'

const REGION_ORIGINAL = process.env.REGION

const importar = (texto: string) => importarAltimetriaV04({ ruta: RUTA, leerArchivo: async () => texto, ahora: AHORA })

async function conversionesImportadas(): Promise<string[]> {
  const filas = await getDb()
    .select({ conversion: infraAltimetriaEscolar.conversion })
    .from(infraAltimetriaEscolar)
    .orderBy(asc(infraAltimetriaEscolar.cueAnexo))
  return filas.map((f) => f.conversion)
}

function fijarRegion(id: string | undefined) {
  if (id === undefined) delete process.env.REGION
  else process.env.REGION = id
  __reiniciarRegionActivaParaPruebas()
}

beforeAll(async () => {
  await migrarDb()
})

beforeEach(async () => {
  await getDb().delete(infraAltimetriaEscolar)
})

afterAll(() => {
  fijarRegion(REGION_ORIGINAL)
})

describe('importarAltimetriaV04: texto de conversión según la fuente DEM de la región activa', () => {
  it('Manaos (fuenteDem fabdem) no estampa Copernicus y sí declara FABDEM en todas las filas', async () => {
    fijarRegion('manaos')
    const r = await importar(MUESTRA)
    expect(r.estado).toBe('completo')

    const conversiones = await conversionesImportadas()
    expect(conversiones).toHaveLength(10)
    for (const conversion of conversiones) {
      expect(conversion).toContain('FABDEM V1-2')
      expect(conversion).toContain('CC BY-NC-SA 4.0')
      expect(conversion).toContain('sem conversao para SRVN16')
      expect(conversion).not.toContain('Copernicus')
    }
  })

  it('Corrientes conserva el texto Copernicus literal de hoy', async () => {
    fijarRegion('corrientes')
    const r = await importar(MUESTRA)
    expect(r.estado).toBe('completo')

    const conversiones = await conversionesImportadas()
    expect(conversiones).toHaveLength(10)
    expect(new Set(conversiones)).toEqual(new Set([CONVERSION_COPERNICUS]))
  })

  it('sin REGION (por defecto Corrientes) conserva el texto Copernicus literal de hoy', async () => {
    fijarRegion(undefined)
    const r = await importar(MUESTRA)
    expect(r.estado).toBe('completo')

    const conversiones = await conversionesImportadas()
    expect(new Set(conversiones)).toEqual(new Set([CONVERSION_COPERNICUS]))
  })
})
