import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb, migrarDb } from '@/lib/db'
import { hazardSourceHealth, infraExposicionRioDem, infraJobRun } from '@/lib/db/schema'
import { importarExposicionRioDem } from './importar-exposicion-rio-dem'

// seed: false; migrations are applied explicitly in beforeAll.
usarDbTemporal('importar-exposicion-rio-dem-', { seed: false })

const NOMBRE = 'exposicion_rio_dem-v1-2026-10-14.csv'
const CABECERA = 'cue_anexo,version_job,suelo_m,nivel_rio_dem_m,distancia_rio_m,fuente,fecha_corrida'
const CSV_OK = [
  CABECERA,
  '1801605-04,1,69.32,52.5,230.13,copernicus-glo30+gsw-occurrence,2026-10-14',
  '1800643-00,1,60.79,43.0,1929.84,copernicus-glo30+gsw-occurrence,2026-10-14',
  '1800001-00,1,,,,copernicus-glo30+gsw-occurrence,2026-10-14',
].join('\n')

const AHORA = new Date('2026-10-13T12:30:00.000Z')

function opcionesCon(csv: string | null, nombres: string[] = csv === null ? [] : [NOMBRE]) {
  return {
    ahora: AHORA,
    directorio: '/virtual/output',
    listarArchivos: async () => nombres,
    leerArchivo: async () => csv ?? '',
  }
}

describe('importarExposicionRioDem', () => {
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

  it('importa las filas del archivo y publica completado', async () => {
    const resultado = await importarExposicionRioDem(opcionesCon(CSV_OK))

    expect(resultado).toMatchObject({
      ejecutado: true,
      estado: 'completo',
      contadores: { filas: 3, guardadas: 3, omitidas: 0 },
    })
    const filas = await db.select().from(infraExposicionRioDem)
    expect(filas).toHaveLength(3)
    const salud = await db.select().from(hazardSourceHealth)
    expect(salud).toHaveLength(1)
  })

  it('una segunda corrida con el mismo archivo omite el upsert', async () => {
    await importarExposicionRioDem(opcionesCon(CSV_OK))
    const segunda = await importarExposicionRioDem(opcionesCon(CSV_OK))

    // La segunda invocación es del mismo día UTC: el lease ya la deja omitida.
    expect(segunda).toMatchObject({ estado: 'omitido' })
    const filas = await db.select().from(infraExposicionRioDem)
    expect(filas).toHaveLength(3)
  })

  it('con filas ya importadas en otro día el archivo se omite por conteo', async () => {
    await importarExposicionRioDem(opcionesCon(CSV_OK))
    const otroDia = new Date('2026-10-14T12:30:00.000Z')
    const resultado = await importarExposicionRioDem({ ...opcionesCon(CSV_OK), ahora: otroDia })

    expect(resultado).toMatchObject({
      ejecutado: true,
      estado: 'completo',
      contadores: { filas: 3, guardadas: 0, omitidas: 3 },
    })
  })

  it('sin archivo publica fallido con mensaje y salud con error', async () => {
    const resultado = await importarExposicionRioDem(opcionesCon(null))

    expect(resultado).toEqual({
      ejecutado: false,
      estado: 'fallido',
      mensaje: 'sin archivo de exposicion_rio_dem',
    })
    const [job] = await db.select().from(infraJobRun)
    expect(job).toMatchObject({ estado: 'fallido' })
    const [salud] = await db.select().from(hazardSourceHealth)
    expect(salud).toMatchObject({ provider: 'exposicion-rio-dem', estado: 'no_disponible' })
  })

  it('cabecera distinta publica fallido y no escribe filas', async () => {
    const csvMalo = CSV_OK.replace('suelo_m', 'suelo')
    const resultado = await importarExposicionRioDem(opcionesCon(csvMalo))

    expect(resultado).toMatchObject({ ejecutado: false, estado: 'fallido' })
    expect(await db.select().from(infraExposicionRioDem)).toHaveLength(0)
  })

  it('valores numéricos vacíos se guardan como null', async () => {
    await importarExposicionRioDem(opcionesCon(CSV_OK))

    const filas = await db.select().from(infraExposicionRioDem)
    const vacia = filas.find((f) => f.cueAnexo === '1800001-00')
    expect(vacia).toMatchObject({ sueloM: null, nivelRioDemM: null, distanciaRioM: null })
    const llena = filas.find((f) => f.cueAnexo === '1801605-04')
    expect(llena).toMatchObject({ sueloM: 69.32, nivelRioDemM: 52.5, distanciaRioM: 230.13 })
  })
})
