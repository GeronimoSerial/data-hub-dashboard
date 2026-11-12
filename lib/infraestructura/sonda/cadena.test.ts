import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb, migrarDb } from '@/lib/db'
import { hidroLectura, infraRiskSnapshot } from '@/lib/db/schema'
import { cargarReferencias } from '@/lib/infraestructura/datasets/repositorio'
import { parsearAlturasPrefectura } from '@/lib/infraestructura/hidrometria/prefectura-parser'
import { limpiarDatosSituacion, insertarRunVigente } from '@/lib/infraestructura/riesgo/situacion/__fixtures__/persistencia'
import { ejecutarSonda } from './cadena'
import {
  ESCUELAS_TESTIGO_DEFAULT,
  ESTACIONES_TESTIGO_DEFAULT,
} from './testigos'

usarDbTemporal('sonda-cadena-')

const fixture = readFileSync(
  new URL('../hidrometria/__fixtures__/prefectura-index.html', import.meta.url),
  'utf8',
)

const HORA_MS = 60 * 60 * 1000
const CATALOGO = 'estaciones-prefectura-v2'

// Witness station and the published Corrientes row share one measurement time,
// so the Prefectura comparison can match them by medidaEn.
const filaCorrientes = parsearAlturasPrefectura(fixture).find(
  (f) => f.puerto === 'CORRIENTES' && f.medidaEn !== null && f.lecturaM !== null,
)
if (!filaCorrientes?.medidaEn || filaCorrientes.lecturaM === null) {
  throw new Error('la fixture de Prefectura debe traer CORRIENTES con medición')
}
const MEDIDA_PUBLICADA = filaCorrientes.medidaEn
const AHORA = new Date(Date.parse(MEDIDA_PUBLICADA) + HORA_MS)

function htmlOk(cuerpo: string): Response {
  return new Response(cuerpo, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

function horasAntes(horas: number): string {
  return new Date(AHORA.getTime() - horas * HORA_MS).toISOString()
}

describe('ejecutarSonda', () => {
  let db: ReturnType<typeof getDb>

  beforeAll(async () => {
    await migrarDb()
    await cargarReferencias()
    db = getDb()
  })

  beforeEach(async () => {
    await limpiarDatosSituacion(db)
    await db.delete(hidroLectura)
  })

  async function sembrarCorridaVigente(publicadoEn: string, cues: readonly string[]) {
    const runId = await insertarRunVigente(db, null, publicadoEn)
    for (const cueAnexo of cues) {
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
        calculadoEn: publicadoEn,
        validoHasta: publicadoEn,
      })
    }
  }

  async function sembrarLectura(estacionId: string, medidaEn: string, lecturaM: number) {
    await db.insert(hidroLectura).values({
      id: randomUUID(),
      estacionId,
      fuente: 'prefectura',
      lecturaM,
      variacionM: null,
      periodoHoras: null,
      medidaEn,
      estadoPublicado: 'normal',
      lecturaAnteriorM: null,
      medidaAnteriorEn: null,
      alertaM: null,
      evacuacionM: null,
      inconsistente: false,
      motivosInconsistencia: [],
      hashOriginal: randomUUID(),
      catalogoVersion: CATALOGO,
      capturadaEn: medidaEn,
    })
  }

  async function sembrarTodoSano() {
    await sembrarCorridaVigente(horasAntes(1), ESCUELAS_TESTIGO_DEFAULT)
    for (const estacionId of ESTACIONES_TESTIGO_DEFAULT) {
      await sembrarLectura(estacionId, horasAntes(1), 2.5)
    }
  }

  it('(a) datos sanos: sin fallas y con los contadores de 3 escuelas y 2 estaciones', async () => {
    expect(ESCUELAS_TESTIGO_DEFAULT).toHaveLength(3)
    expect(ESTACIONES_TESTIGO_DEFAULT).toHaveLength(2)
    await sembrarTodoSano()

    const resultado = await ejecutarSonda({ ahora: AHORA, consultarPrefectura: false })

    expect(resultado).toEqual({
      escuelasVerificadas: 3,
      escuelasFallidas: [],
      estacionesVerificadas: 2,
      estacionesFallidas: [],
      discrepancias: [],
      prefecturaConsultada: false,
    })
  })

  it('(b) escuela inexistente: queda en escuelasFallidas sin corrida vigente que la contenga', async () => {
    await sembrarTodoSano()

    const resultado = await ejecutarSonda({
      ahora: AHORA,
      consultarPrefectura: false,
      escuelas: ['1800643-00', '0000000-00'],
    })

    expect(resultado.escuelasVerificadas).toBe(2)
    expect(resultado.escuelasFallidas).toEqual(['0000000-00'])
  })

  it('(c) corrida vigente con más de 12 h: todas las escuelas de esa corrida fallan', async () => {
    await sembrarCorridaVigente(horasAntes(13), ESCUELAS_TESTIGO_DEFAULT)
    for (const estacionId of ESTACIONES_TESTIGO_DEFAULT) {
      await sembrarLectura(estacionId, horasAntes(1), 2.5)
    }

    const resultado = await ejecutarSonda({ ahora: AHORA, consultarPrefectura: false })

    expect(resultado.escuelasFallidas).toEqual([...ESCUELAS_TESTIGO_DEFAULT])
    expect(resultado.estacionesFallidas).toEqual([])
  })

  it('(d) lectura de estación con más de 18 h: la estación falla', async () => {
    await sembrarCorridaVigente(horasAntes(1), ESCUELAS_TESTIGO_DEFAULT)
    await sembrarLectura('pna-corrientes', horasAntes(1), 2.5)
    await sembrarLectura('pna-paso-de-los-libres', horasAntes(19), 2.5)

    const resultado = await ejecutarSonda({ ahora: AHORA, consultarPrefectura: false })

    expect(resultado.escuelasFallidas).toEqual([])
    expect(resultado.estacionesVerificadas).toBe(2)
    expect(resultado.estacionesFallidas).toEqual(['pna-paso-de-los-libres'])
  })

  it('(e) lectura guardada distinta de la publicada con la misma medidaEn: la estación es discrepancia', async () => {
    await sembrarCorridaVigente(horasAntes(1), ESCUELAS_TESTIGO_DEFAULT)
    await sembrarLectura('pna-corrientes', MEDIDA_PUBLICADA, filaCorrientes.lecturaM! + 0.5)
    await sembrarLectura('pna-paso-de-los-libres', horasAntes(1), 2.5)
    const fetchImpl = vi.fn(async () => htmlOk(fixture))

    const resultado = await ejecutarSonda({ ahora: AHORA, consultarPrefectura: true, fetchImpl })

    expect(resultado.prefecturaConsultada).toBe(true)
    expect(resultado.discrepancias).toEqual(['pna-corrientes'])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('(f) consultarPrefectura=false: Prefectura no se llama nunca', async () => {
    await sembrarTodoSano()
    const fetchImpl = vi.fn(async () => htmlOk(fixture))

    const resultado = await ejecutarSonda({ ahora: AHORA, consultarPrefectura: false, fetchImpl })

    expect(fetchImpl).toHaveBeenCalledTimes(0)
    expect(resultado.prefecturaConsultada).toBe(false)
    expect(resultado.discrepancias).toEqual([])
  })

  describe('(g) listas testigo desde el entorno', () => {
    const previas = {
      escuelas: process.env.SONDA_ESCUELAS_TESTIGO,
      estaciones: process.env.SONDA_ESTACIONES_TESTIGO,
    }

    afterEach(() => {
      if (previas.escuelas === undefined) delete process.env.SONDA_ESCUELAS_TESTIGO
      else process.env.SONDA_ESCUELAS_TESTIGO = previas.escuelas
      if (previas.estaciones === undefined) delete process.env.SONDA_ESTACIONES_TESTIGO
      else process.env.SONDA_ESTACIONES_TESTIGO = previas.estaciones
    })

    it('SONDA_ESCUELAS_TESTIGO y SONDA_ESTACIONES_TESTIGO reemplazan los defaults', async () => {
      await sembrarTodoSano()
      process.env.SONDA_ESCUELAS_TESTIGO = ' 1800643-00 , '
      process.env.SONDA_ESTACIONES_TESTIGO = 'pna-corrientes'

      const resultado = await ejecutarSonda({ ahora: AHORA, consultarPrefectura: false })

      expect(resultado).toMatchObject({
        escuelasVerificadas: 1,
        escuelasFallidas: [],
        estacionesVerificadas: 1,
        estacionesFallidas: [],
      })
    })
  })
})
