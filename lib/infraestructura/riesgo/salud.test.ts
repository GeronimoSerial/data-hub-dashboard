import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb } from '@/lib/db'
import { infraJobRun } from '@/lib/db/schema'
import { JOBS_ESPERADOS } from './jobs-esperados'
import type { EstadoJobRun, obtenerEstadoOperativo as ObtenerEstadoOperativoFn, evaluarJobsEsperados as EvaluarJobsEsperadosFn, resumirCoberturaClimatologia as ResumirCoberturaFn } from './salud'

usarDbTemporal('salud-')

beforeAll(async () => {
  ;({ obtenerEstadoOperativo, evaluarJobsEsperados, resumirCoberturaClimatologia } = await import('./salud'))
})

let obtenerEstadoOperativo: typeof ObtenerEstadoOperativoFn
let evaluarJobsEsperados: typeof EvaluarJobsEsperadosFn
let resumirCoberturaClimatologia: typeof ResumirCoberturaFn

// getDb() memoiza la conexión a nivel de módulo, así que DATA_DIR debe
// setearse ANTES del primer getDb(); mismo patrón que job-run.test.ts.
type FilaJobRun = typeof infraJobRun.$inferInsert

function fila(over: Partial<FilaJobRun> & Pick<FilaJobRun, 'id' | 'tipo' | 'estado' | 'actualizadaEn'>): FilaJobRun {
  return {
    claveIdempotente: over.id,
    iniciadoEn: over.actualizadaEn,
    version: 'v1',
    creadaEn: over.actualizadaEn,
    ...over,
  }
}

async function buscarJob(tipo: string): Promise<EstadoJobRun | undefined> {
  const estado = await obtenerEstadoOperativo()
  return estado.jobs.find((job) => job.tipo === tipo)
}

describe('resumirCoberturaClimatologia', () => {
  it('sin celdas devuelve ceros', () => {
    expect(resumirCoberturaClimatologia(new Map(), 0)).toEqual({
      celdasTotal: 0,
      celdasUsables: 0,
      aniosMin: 0,
      aniosMediana: 0,
      aniosMax: 0,
      aniosObjetivo: 30,
      minimoUsable: 10,
    })
  })

  it('resume mínimo, mediana, máximo y celdas usables de una mezcla', () => {
    const aniosPorCelda = new Map([
      ['a', 5],
      ['b', 10],
      ['c', 30],
      ['d', 12],
    ])
    expect(resumirCoberturaClimatologia(aniosPorCelda, 4)).toEqual({
      celdasTotal: 4,
      celdasUsables: 3,
      aniosMin: 5,
      aniosMediana: 11,
      aniosMax: 30,
      aniosObjetivo: 30,
      minimoUsable: 10,
    })
  })

  it('celdas ausentes del mapa cuentan como 0 años', () => {
    expect(resumirCoberturaClimatologia(new Map([['a', 12]]), 3)).toEqual({
      celdasTotal: 3,
      celdasUsables: 1,
      aniosMin: 0,
      aniosMediana: 0,
      aniosMax: 12,
      aniosObjetivo: 30,
      minimoUsable: 10,
    })
  })
})

describe('obtenerEstadoOperativo — flags.enosJobsEnabled', () => {
  const previo = process.env.ENOS_JOBS_ENABLED

  afterAll(() => {
    if (previo === undefined) delete process.env.ENOS_JOBS_ENABLED
    else process.env.ENOS_JOBS_ENABLED = previo
  })

  it('expone el flag maestro de jobs (default true) junto a los flags de UI', async () => {
    delete process.env.ENOS_JOBS_ENABLED
    const estado = await obtenerEstadoOperativo()
    expect(estado.flags.enosJobsEnabled).toBe(true)
  })

  it('refleja ENOS_JOBS_ENABLED=false', async () => {
    process.env.ENOS_JOBS_ENABLED = 'false'
    const estado = await obtenerEstadoOperativo()
    expect(estado.flags.enosJobsEnabled).toBe(false)
  })
})

describe('obtenerEstadoOperativo — ultimaCompletadaEn', () => {
  it('apunta a la última fila completada aunque la más reciente haya fallado', async () => {
    const db = getDb()
    const completadoViejo = '2026-01-01T00:00:00.000Z'
    const fallidoReciente = '2026-01-02T00:00:00.000Z'
    await db.insert(infraJobRun).values([
      fila({ id: 'geo-completado', tipo: 'geo-perfiles', estado: 'completado', actualizadaEn: completadoViejo }),
      fila({ id: 'geo-fallido', tipo: 'geo-perfiles', estado: 'fallido', actualizadaEn: fallidoReciente }),
    ])

    const job = await buscarJob('geo-perfiles')
    expect(job).toBeDefined()
    expect(job?.estado).toBe('fallido')
    expect(job?.actualizadaEn).toBe(fallidoReciente)
    expect(job?.ultimaCompletadaEn).toBe(completadoViejo)
  })

  it('es null cuando el tipo nunca completó ninguna fila', async () => {
    const db = getDb()
    await db.insert(infraJobRun).values([
      fila({ id: 'clima-fallido', tipo: 'climatologia-caudal', estado: 'fallido', actualizadaEn: '2026-01-01T00:00:00.000Z' }),
      fila({ id: 'clima-en-progreso', tipo: 'climatologia-caudal', estado: 'en_progreso', actualizadaEn: '2026-01-02T00:00:00.000Z' }),
    ])

    const job = await buscarJob('climatologia-caudal')
    expect(job).toBeDefined()
    expect(job?.ultimaCompletadaEn).toBeNull()
  })
})

describe('evaluarJobsEsperados — jobs declarados vs. corridas registradas', () => {
  const ahora = new Date('2026-10-13T12:00:00.000Z')
  const hace = (minutos: number) => new Date(ahora.getTime() - minutos * 60_000).toISOString()
  const esperado = {
    nombre: 'sync-imerg',
    tipo: 'sync-hazard-imerg',
    intervaloMinutos: 60,
    habilitado: true,
  }

  it('marca como sin_corridas un job esperado que nunca registró una corrida', () => {
    const [job] = evaluarJobsEsperados({ filas: [], ahora, esperados: [esperado] })
    expect(job?.estado).toBe('sin_corridas')
    expect(job?.ultimaCorridaEn).toBeNull()
  })

  it('marca como atrasado un job cuya última corrida es mayor que 2× el intervalo', () => {
    const filas = [{ tipo: 'sync-hazard-imerg', actualizadaEn: hace(2 * 60 + 1) }]
    const [job] = evaluarJobsEsperados({ filas, ahora, esperados: [esperado] })
    expect(job?.estado).toBe('atrasado')
    expect(job?.ultimaCorridaEn).toBe(filas[0]?.actualizadaEn)
  })

  it('marca como ok un job con corrida dentro de 2× el intervalo', () => {
    const filas = [{ tipo: 'sync-hazard-imerg', actualizadaEn: hace(2 * 60 - 1) }]
    const [job] = evaluarJobsEsperados({ filas, ahora, esperados: [esperado] })
    expect(job?.estado).toBe('ok')
  })

  it('usa la fila más reciente del tipo aunque haya fallado', () => {
    const filas = [
      { tipo: 'sync-hazard-imerg', actualizadaEn: hace(5 * 60) },
      { tipo: 'sync-hazard-imerg', actualizadaEn: hace(10) },
    ]
    const [job] = evaluarJobsEsperados({ filas, ahora, esperados: [esperado] })
    expect(job?.estado).toBe('ok')
    expect(job?.ultimaCorridaEn).toBe(filas[1]?.actualizadaEn)
  })

  it('marca como fallando un job cuya última corrida es fallida y reciente', () => {
    const filas = [
      { tipo: 'sync-hazard-imerg', actualizadaEn: hace(10), estado: 'fallido', errorSaneado: 'HTTP 503' },
    ]
    const [job] = evaluarJobsEsperados({ filas, ahora, esperados: [esperado] })
    expect(job?.estado).toBe('fallando')
    expect(job?.ultimaCorridaEn).toBe(filas[0]?.actualizadaEn)
    expect(job?.errorSaneado).toBe('HTTP 503')
    expect(job?.ultimaCompletadaEn).toBeNull()
  })

  it('marca como ok un job cuya corrida completada es posterior a un fallido anterior', () => {
    const filas = [
      { tipo: 'sync-hazard-imerg', actualizadaEn: hace(30), estado: 'fallido' },
      { tipo: 'sync-hazard-imerg', actualizadaEn: hace(10), estado: 'completado' },
    ]
    const [job] = evaluarJobsEsperados({ filas, ahora, esperados: [esperado] })
    expect(job?.estado).toBe('ok')
    expect(job?.errorSaneado).toBeNull()
    expect(job?.ultimaCompletadaEn).toBe(filas[1]?.actualizadaEn)
  })

  it('marca como atrasado un job cuyo último fallido es mayor que 2× el intervalo', () => {
    const filas = [{ tipo: 'sync-hazard-imerg', actualizadaEn: hace(2 * 60 + 1), estado: 'fallido' }]
    const [job] = evaluarJobsEsperados({ filas, ahora, esperados: [esperado] })
    expect(job?.estado).toBe('atrasado')
  })

  it('apunta ultimaCompletadaEn a la última completada aunque la más reciente falle', () => {
    const filas = [
      { tipo: 'sync-hazard-imerg', actualizadaEn: hace(90), estado: 'completado' },
      { tipo: 'sync-hazard-imerg', actualizadaEn: hace(10), estado: 'fallido' },
    ]
    const [job] = evaluarJobsEsperados({ filas, ahora, esperados: [esperado] })
    expect(job?.estado).toBe('fallando')
    expect(job?.ultimaCompletadaEn).toBe(filas[0]?.actualizadaEn)
  })

  it('marca como no_programado un job deshabilitado, con o sin corridas', () => {
    const deshabilitado = { ...esperado, habilitado: false }
    const sinCorridas = evaluarJobsEsperados({ filas: [], ahora, esperados: [deshabilitado] })
    expect(sinCorridas[0]?.estado).toBe('no_programado')

    const conCorridaVieja = evaluarJobsEsperados({
      filas: [{ tipo: 'sync-hazard-imerg', actualizadaEn: hace(10 * 60) }],
      ahora,
      esperados: [deshabilitado],
    })
    expect(conCorridaVieja[0]?.estado).toBe('no_programado')
  })

  it('sync-prefectura-alturas figura declarado horario y habilitado', () => {
    const entrada = JOBS_ESPERADOS.find((job) => job.nombre === 'sync-prefectura-alturas')
    expect(entrada).toMatchObject({ intervaloMinutos: 60, habilitado: true })
    const [job] = evaluarJobsEsperados({ filas: [], ahora, esperados: entrada ? [entrada] : [] })
    expect(job?.estado).not.toBe('no_programado')
  })

  it('marca como sin_trazabilidad un job que no escribe infra_job_run', () => {
    const sinTipo = { ...esperado, tipo: null }
    const [job] = evaluarJobsEsperados({ filas: [], ahora, esperados: [sinTipo] })
    expect(job?.estado).toBe('sin_trazabilidad')
  })

  it('la lista declarada usa nombres de despacho válidos de scripts/jobs.mjs', () => {
    const fuente = readFileSync(join(process.cwd(), 'scripts/jobs.mjs'), 'utf8')
    const bloque = fuente.slice(fuente.indexOf('const NOMBRES_VALIDOS'), fuente.indexOf('\n]', fuente.indexOf('const NOMBRES_VALIDOS')))
    for (const job of JOBS_ESPERADOS) {
      expect(bloque).toContain(`'${job.nombre}'`)
    }
  })
})

describe('evaluarFrescuraFuente — IMERG mide la edad del dato, no la del job', () => {
  const ahora = new Date('2026-10-14T12:00:00.000Z')

  it('nasa-imerg con job reciente pero dato de 5,5 h: frescura 330 min, al día (límite 6 h)', async () => {
    const { evaluarFrescuraFuente } = await import('./salud')
    expect(
      evaluarFrescuraFuente({
        provider: 'nasa-imerg',
        ultimoExitoEn: '2026-10-14T11:59:00.000Z',
        ttlMinutos: 180,
        datoMasRecienteEn: '2026-10-14T06:30:00.000Z',
        ahora,
      }),
    ).toEqual({ frescuraMinutos: 330, limiteMinutos: 360, vencida: false, base: 'dato' })
  })

  it('nasa-imerg con dato de más de 6 h: vencida aunque el job haya corrido bien', async () => {
    const { evaluarFrescuraFuente } = await import('./salud')
    expect(
      evaluarFrescuraFuente({
        provider: 'nasa-imerg',
        ultimoExitoEn: '2026-10-14T11:59:00.000Z',
        ttlMinutos: 180,
        datoMasRecienteEn: '2026-10-14T05:30:00.000Z',
        ahora,
      }),
    ).toMatchObject({ frescuraMinutos: 390, vencida: true, base: 'dato' })
  })

  it('nasa-imerg sin ningún dato ingerido: sin frescura y vencida', async () => {
    const { evaluarFrescuraFuente } = await import('./salud')
    expect(
      evaluarFrescuraFuente({ provider: 'nasa-imerg', ultimoExitoEn: '2026-10-14T11:59:00.000Z', ttlMinutos: 180, datoMasRecienteEn: null, ahora }),
    ).toMatchObject({ frescuraMinutos: null, vencida: true, base: 'dato' })
  })

  it('otras fuentes siguen midiendo la última corrida exitosa contra su TTL', async () => {
    const { evaluarFrescuraFuente } = await import('./salud')
    expect(
      evaluarFrescuraFuente({ provider: 'open-meteo', ultimoExitoEn: '2026-10-14T11:00:00.000Z', ttlMinutos: 30, datoMasRecienteEn: null, ahora }),
    ).toEqual({ frescuraMinutos: 60, limiteMinutos: 30, vencida: true, base: 'corrida' })
  })
})

describe('obtenerDatoMasRecienteImerg', () => {
  it('devuelve el observadoEn más reciente de la lluvia satelital IMERG', async () => {
    const { obtenerDatoMasRecienteImerg } = await import('./salud')
    const { hazardObservation } = await import('@/lib/db/schema')
    const { PROVIDER_OBSERVADO, VARIABLE_OBSERVADA } = await import('./peligro/observado')
    expect(await obtenerDatoMasRecienteImerg()).toBeNull()
    const obs = (id: string, observadoEn: string, provider = PROVIDER_OBSERVADO) => ({
      id,
      provider,
      variable: VARIABLE_OBSERVADA,
      geometryRef: 'celda-1',
      valor: 1,
      unidad: 'mm/30min',
      observadoEn,
      validoDesde: observadoEn,
      validoHasta: observadoEn,
      ingeridoEn: observadoEn,
    })
    await getDb().insert(hazardObservation).values([
      obs('o1', '2026-10-14T05:30:00.000Z'),
      obs('o2', '2026-10-14T06:30:00.000Z'),
      obs('o3', '2026-10-14T09:00:00.000Z', 'otro-proveedor'),
    ])
    expect(await obtenerDatoMasRecienteImerg()).toBe('2026-10-14T06:30:00.000Z')
  })
})
