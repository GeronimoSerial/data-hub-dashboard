import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb, migrarDb } from '@/lib/db'
import { hazardSourceHealth, infraExposicionRioDem, infraJobRun } from '@/lib/db/schema'
import { importarExposicionRioDem } from './importar-exposicion-rio-dem'

// seed: false; migrations are applied explicitly in beforeAll.
usarDbTemporal('importar-exposicion-rio-dem-fabdem-', { seed: false })

const NOMBRE = 'exposicion_rio_dem-v1-2026-10-14.csv'
const CABECERA = 'cue_anexo,version_job,suelo_m,nivel_rio_dem_m,distancia_rio_m,fuente,fecha_corrida'
const FUENTE_FABDEM = 'fabdem-v1-2+gsw-occurrence'
const FUENTE_COPERNICUS = 'copernicus-glo30+gsw-occurrence'
const LICENCIA_COPERNICUS =
  'Copernicus DEM GLO-30 (© DLR/Airbus, licencia Copernicus) + JRC Global Surface Water (CC BY 4.0)'
const PARTES_LICENCIA_FABDEM = [
  'FABDEM V1-2',
  'Universidade de Bristol / Fathom',
  'CC BY-NC-SA 4.0',
  'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  'Copernicus WorldDEM-30 © DLR e.V. 2010-2014 e © Airbus Defence and Space GmbH 2014-2018, fornecido sob COPERNICUS pela União Europeia e ESA; todos os direitos reservados',
  'percentil 10 por escola',
  'JRC Global Surface Water (CC BY 4.0)',
]

const AHORA = new Date('2026-10-13T12:30:00.000Z')

function csvCon(fuentes: string[]): string {
  const filas = fuentes.map((fuente, i) => `180160${i}-04,1,69.32,52.5,230.13,${fuente},2026-10-14`)
  return [CABECERA, ...filas].join('\n')
}

function opcionesCon(csv: string) {
  return {
    ahora: AHORA,
    directorio: '/virtual/output',
    listarArchivos: async () => [NOMBRE],
    leerArchivo: async () => csv,
  }
}

describe('importarExposicionRioDem con fuente FABDEM', () => {
  let db: ReturnType<typeof getDb>

  beforeAll(async () => {
    await migrarDb()
    db = getDb()
  })

  beforeEach(async () => {
    await db.delete(infraExposicionRioDem)
    await db.delete(infraJobRun)
    await db.delete(hazardSourceHealth)
  })

  it('registra la licencia FABDEM con la atribución completa', async () => {
    const resultado = await importarExposicionRioDem(opcionesCon(csvCon([FUENTE_FABDEM, FUENTE_FABDEM])))

    expect(resultado).toMatchObject({ ejecutado: true, estado: 'completo' })
    const [salud] = await db.select().from(hazardSourceHealth)
    for (const parte of PARTES_LICENCIA_FABDEM) {
      expect(salud!.licencia).toContain(parte)
    }
    expect(salud!.licencia).not.toBe(LICENCIA_COPERNICUS)
  })

  it('mantiene la licencia Copernicus idéntica para un archivo Copernicus', async () => {
    await importarExposicionRioDem(opcionesCon(csvCon([FUENTE_COPERNICUS, FUENTE_COPERNICUS])))

    const [salud] = await db.select().from(hazardSourceHealth)
    expect(salud!.licencia).toBe(LICENCIA_COPERNICUS)
  })

  it('mantiene la licencia Copernicus para una fuente desconocida', async () => {
    await importarExposicionRioDem(opcionesCon(csvCon(['otra-fuente+gsw-occurrence'])))

    const [salud] = await db.select().from(hazardSourceHealth)
    expect(salud!.licencia).toBe(LICENCIA_COPERNICUS)
  })

  it('rechaza un archivo que mezcla FABDEM con otra fuente', async () => {
    const resultado = await importarExposicionRioDem(
      opcionesCon(csvCon([FUENTE_FABDEM, FUENTE_COPERNICUS])),
    )

    expect(resultado).toMatchObject({
      ejecutado: false,
      estado: 'fallido',
      mensaje: 'formato inválido en exposicion_rio_dem',
    })
    const filas = await db.select().from(infraExposicionRioDem)
    expect(filas).toHaveLength(0)
  })
})
