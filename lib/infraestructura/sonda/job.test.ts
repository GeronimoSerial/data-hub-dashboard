import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb, migrarDb } from '@/lib/db'
import { hidroLectura, infraJobRun, infraRiskSnapshot } from '@/lib/db/schema'
import { cargarReferencias } from '@/lib/infraestructura/datasets/repositorio'
import { limpiarDatosSituacion, insertarRunVigente } from '@/lib/infraestructura/riesgo/situacion/__fixtures__/persistencia'
import { buscarEstacionPrefectura } from '@/lib/infraestructura/hidrometria/estaciones-prefectura'
import { parsearAlturasPrefectura } from '@/lib/infraestructura/hidrometria/prefectura-parser'
import { correrSondaCadenaDatos } from './job'
import { ESCUELAS_TESTIGO_DEFAULT, ESTACIONES_TESTIGO_DEFAULT } from './testigos'

usarDbTemporal('sonda-job-')

const fixture = readFileSync(
  new URL('../hidrometria/__fixtures__/prefectura-index.html', import.meta.url),
  'utf8',
)

const AHORA = new Date('2026-10-13T12:30:00.000Z')
const HACE_UNA_HORA = new Date(AHORA.getTime() - 60 * 60 * 1000).toISOString()

function htmlOk(cuerpo: string): Response {
  return new Response(cuerpo, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

describe('correrSondaCadenaDatos', () => {
  let db: ReturnType<typeof getDb>
  const previas = {
    rol: process.env.RIESGO_DATOS_ROL,
    escuelas: process.env.SONDA_ESCUELAS_TESTIGO,
  }

  beforeAll(async () => {
    await migrarDb()
    await cargarReferencias()
    db = getDb()
  })

  beforeEach(async () => {
    process.env.RIESGO_DATOS_ROL = 'consumidor'
    delete process.env.SONDA_ESCUELAS_TESTIGO
    await limpiarDatosSituacion(db)
    await db.delete(hidroLectura)
    await db.delete(infraJobRun)

    const runId = await insertarRunVigente(db, null, HACE_UNA_HORA)
    for (const cueAnexo of ESCUELAS_TESTIGO_DEFAULT) {
      await db.insert(infraRiskSnapshot).values({
        id: randomUUID(),
        runId,
        cueAnexo,
        horizonteHoras: 72,
        evidenciaValida: true,
        scoreRiesgo: 0.5,
        nivelRiesgo: 'moderado',
        scoreAmenaza: null,
        scoreVulnerabilidad: null,
        confianza: 'media',
        exposicionMatricula: null,
        exposicionSecciones: null,
        calculadoEn: HACE_UNA_HORA,
        validoHasta: HACE_UNA_HORA,
      })
    }
    for (const estacionId of ESTACIONES_TESTIGO_DEFAULT) {
      await db.insert(hidroLectura).values({
        id: randomUUID(),
        estacionId,
        fuente: 'prefectura',
        lecturaM: 2.5,
        variacionM: null,
        periodoHoras: null,
        medidaEn: HACE_UNA_HORA,
        estadoPublicado: 'normal',
        lecturaAnteriorM: null,
        medidaAnteriorEn: null,
        alertaM: null,
        evacuacionM: null,
        inconsistente: false,
        motivosInconsistencia: [],
        hashOriginal: randomUUID(),
        catalogoVersion: 'estaciones-prefectura-v2',
        capturadaEn: HACE_UNA_HORA,
      })
    }
  })

  afterEach(() => {
    if (previas.rol === undefined) delete process.env.RIESGO_DATOS_ROL
    else process.env.RIESGO_DATOS_ROL = previas.rol
    if (previas.escuelas === undefined) delete process.env.SONDA_ESCUELAS_TESTIGO
    else process.env.SONDA_ESCUELAS_TESTIGO = previas.escuelas
  })

  it('rol consumidor sano: publica completado con contadores numéricos y sin llamar a Prefectura', async () => {
    const fetchImpl = vi.fn(async () => htmlOk(fixture))

    const resultado = await correrSondaCadenaDatos({ ahora: AHORA, fetchImpl })

    expect(resultado).toEqual({
      ejecutado: true,
      estado: 'completo',
      contadores: {
        escuelasVerificadas: 3,
        escuelasFallidas: 0,
        estacionesVerificadas: 2,
        estacionesFallidas: 0,
        discrepancias: 0,
        prefecturaConsultada: 0,
      },
    })
    expect(fetchImpl).toHaveBeenCalledTimes(0)

    const [job] = await db.select().from(infraJobRun)
    expect(job).toMatchObject({
      tipo: 'sonda-cadena-datos',
      claveIdempotente: '2026-10-13T12',
      estado: 'completado',
    })
  })

  it('(b) escuela testigo inexistente: publica fallido con el CUE en errorSaneado', async () => {
    process.env.SONDA_ESCUELAS_TESTIGO = '1800643-00,0000000-00'

    const resultado = await correrSondaCadenaDatos({ ahora: AHORA })

    const mensaje = 'Escuela testigo sin corrida vigente: 0000000-00'
    expect(resultado).toEqual({ ejecutado: false, estado: 'fallido', mensaje })

    const [job] = await db.select().from(infraJobRun)
    expect(job).toMatchObject({ estado: 'fallido', errorSaneado: mensaje })
  })

  it('rol productor: consulta Prefectura una vez y lo registra en prefecturaConsultada', async () => {
    process.env.RIESGO_DATOS_ROL = 'productor'
    const fetchImpl = vi.fn(async () => htmlOk(fixture))
    // Stored readings mirror the published rows, so the comparison finds no drift.
    await db.delete(hidroLectura)
    for (const estacionId of ESTACIONES_TESTIGO_DEFAULT) {
      const publicada = parsearAlturasPrefectura(fixture).find(
        (fila) => buscarEstacionPrefectura(fila)?.estacionId === estacionId && fila.medidaEn && fila.lecturaM !== null,
      )
      if (!publicada?.medidaEn || publicada.lecturaM === null) throw new Error(`sin fila publicada para ${estacionId}`)
      await db.insert(hidroLectura).values({
        id: randomUUID(),
        estacionId,
        fuente: 'prefectura',
        lecturaM: publicada.lecturaM,
        variacionM: null,
        periodoHoras: null,
        medidaEn: publicada.medidaEn,
        estadoPublicado: 'normal',
        lecturaAnteriorM: null,
        medidaAnteriorEn: null,
        alertaM: null,
        evacuacionM: null,
        inconsistente: false,
        motivosInconsistencia: [],
        hashOriginal: randomUUID(),
        catalogoVersion: 'estaciones-prefectura-v2',
        capturadaEn: publicada.medidaEn,
      })
    }

    const resultado = await correrSondaCadenaDatos({ ahora: AHORA, fetchImpl })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(resultado).toMatchObject({
      ejecutado: true,
      estado: 'completo',
      contadores: expect.objectContaining({ prefecturaConsultada: 1 }),
    })
  })
})
