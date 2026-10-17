import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  calcularGeoPerfiles: vi.fn(),
  calcularAsociacionesRio: vi.fn(),
  ejecutarSyncPronosticoCaudal: vi.fn(),
  ejecutarSyncRadarMeteo: vi.fn(),
  ejecutarVerificacionRadarMeteo: vi.fn(),
  ejecutarSyncEnsemble: vi.fn(),
  ejecutarSyncImerg: vi.fn(),
  ejecutarCalculoClimatologia: vi.fn(),
  ejecutarCalculoClimatologiaCaudal: vi.fn(),
  ejecutarCalculoClimatologiaImerg: vi.fn(),
  calcularYPublicarRiesgo: vi.fn(),
  correrJobEpisodiosDerivados: vi.fn(),
  syncPrefecturaAlturas: vi.fn(),
  syncSynopLluvia: vi.fn(),
  syncPrefecturaHistorico: vi.fn(),
  importarExposicionRioDem: vi.fn(),
  generarCorte: vi.fn(),
  enosJobsEnabled: vi.fn(),
  adquirirLease: vi.fn(),
  publicarResultado: vi.fn(),
  ensureSeeded: vi.fn(),
}))

vi.mock('../lib/db/seed.ts', () => ({
  ensureSeeded: mocks.ensureSeeded,
}))

vi.mock('../lib/infraestructura/riesgo/geo-perfil.ts', () => ({
  calcularGeoPerfiles: mocks.calcularGeoPerfiles,
}))
vi.mock('../lib/infraestructura/riesgo/rio-asociacion.ts', () => ({
  calcularAsociacionesRio: mocks.calcularAsociacionesRio,
}))
vi.mock('../lib/infraestructura/riesgo/jobs/sync-pronostico-caudal.ts', () => ({
  ejecutarSyncPronosticoCaudal: mocks.ejecutarSyncPronosticoCaudal,
}))
vi.mock('../lib/infraestructura/radar-meteo/job-sync.ts', () => ({
  ejecutarSyncRadarMeteo: mocks.ejecutarSyncRadarMeteo,
}))
vi.mock('../lib/infraestructura/radar-meteo/verificacion.ts', () => ({
  ejecutarVerificacionRadarMeteo: mocks.ejecutarVerificacionRadarMeteo,
}))
vi.mock('../lib/infraestructura/riesgo/jobs/sync-ensemble.ts', () => ({
  ejecutarSyncEnsemble: mocks.ejecutarSyncEnsemble,
}))
vi.mock('../lib/infraestructura/riesgo/jobs/sync-imerg.ts', () => ({
  ejecutarSyncImerg: mocks.ejecutarSyncImerg,
}))
vi.mock('../lib/infraestructura/riesgo/jobs/calcular-climatologia.ts', () => ({
  ejecutarCalculoClimatologia: mocks.ejecutarCalculoClimatologia,
}))
vi.mock('../lib/infraestructura/riesgo/jobs/calcular-climatologia-imerg.ts', () => ({
  ejecutarCalculoClimatologiaImerg: mocks.ejecutarCalculoClimatologiaImerg,
}))
vi.mock('../lib/infraestructura/riesgo/jobs/calcular-climatologia-caudal.ts', () => ({
  ejecutarCalculoClimatologiaCaudal: mocks.ejecutarCalculoClimatologiaCaudal,
}))
vi.mock('../lib/infraestructura/riesgo/jobs/calcular-riesgo.ts', () => ({
  calcularYPublicarRiesgo: mocks.calcularYPublicarRiesgo,
}))
vi.mock('../lib/infraestructura/episodios-derivados/job.ts', () => ({
  correrJobEpisodiosDerivados: mocks.correrJobEpisodiosDerivados,
}))
vi.mock('../lib/infraestructura/hidrometria/sync-prefectura-alturas.ts', () => ({
  syncPrefecturaAlturas: mocks.syncPrefecturaAlturas,
}))
vi.mock('../lib/infraestructura/lluvia-estaciones/sync-synop-lluvia.ts', () => ({
  syncSynopLluvia: mocks.syncSynopLluvia,
}))
vi.mock('../lib/infraestructura/hidrometria/sync-prefectura-historico.ts', () => ({
  syncPrefecturaHistorico: mocks.syncPrefecturaHistorico,
}))
vi.mock('../lib/infraestructura/riesgo/jobs/importar-exposicion-rio-dem.ts', () => ({
  importarExposicionRioDem: mocks.importarExposicionRioDem,
}))
vi.mock('../lib/infraestructura/riesgo/situacion/corte.ts', () => ({
  generarCorte: mocks.generarCorte,
}))
vi.mock('../lib/infraestructura/jobs/flags.ts', () => ({
  enosJobsEnabled: mocks.enosJobsEnabled,
}))
vi.mock('../lib/infraestructura/riesgo/job-run.ts', () => ({
  adquirirLease: mocks.adquirirLease,
  publicarResultado: mocks.publicarResultado,
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.enosJobsEnabled.mockReturnValue(true)
})

describe('correrJob — despacho por nombre', () => {
  it('despacha sync-radar-meteo', async () => {
    mocks.ejecutarSyncRadarMeteo.mockResolvedValue({ estado: 'completo' })
    const { correrJob } = await import('./jobs.mjs')
    await expect(correrJob('sync-radar-meteo')).resolves.toEqual({ estado: 'completo' })
    expect(mocks.ejecutarSyncRadarMeteo).toHaveBeenCalledTimes(1)
  })

  it('despacha verificar-radar-meteo con opciones de backfill', async () => {
    mocks.ejecutarVerificacionRadarMeteo.mockResolvedValue({ departamentos: 25 })
    const { correrJob } = await import('./jobs.mjs')
    await expect(correrJob('verificar-radar-meteo', { desde: '2026-09-20' }))
      .resolves.toEqual({ departamentos: 25 })
    expect(mocks.ejecutarVerificacionRadarMeteo).toHaveBeenCalledWith({ desde: '2026-09-20' })
  })

  it('rechaza un nombre desconocido con un error que dice "desconocido" y el CLI saldría con 2', async () => {
    const { correrJob, JobDesconocidoError } = await import('./jobs.mjs')

    await expect(correrJob('nombre-invalido')).rejects.toThrow(/desconocido/)
    expect(mocks.ensureSeeded).not.toHaveBeenCalled()

    let codigo = 0
    try {
      await correrJob('nombre-invalido')
    } catch (error) {
      codigo = error instanceof JobDesconocidoError ? 2 : 1
    }
    expect(codigo).toBe(2)
  })

  it('propaga el error de un job y el flujo del CLI resulta en exit 1', async () => {
    mocks.ejecutarSyncImerg.mockRejectedValue(new Error('boom'))
    const { correrJob, JobDesconocidoError } = await import('./jobs.mjs')

    await expect(correrJob('sync-imerg')).rejects.toThrow('boom')

    let codigo = 0
    try {
      await correrJob('sync-imerg')
    } catch (error) {
      codigo = error instanceof JobDesconocidoError ? 2 : 1
    }
    expect(codigo).toBe(1)
  })
})

describe('codigoSalida', () => {
  it('devuelve 0 cuando no se pudo adquirir el lease (idempotencia normal)', async () => {
    mocks.ejecutarSyncEnsemble.mockResolvedValue({
      ok: false,
      motivo: 'lease_no_disponible',
    })
    const { correrJob, codigoSalida } = await import('./jobs.mjs')

    const resultado = await correrJob('sync-ensemble')
    expect(codigoSalida('sync-ensemble', resultado)).toBe(0)
  })

  it('devuelve 0 en un caso feliz ok:true', async () => {
    mocks.ejecutarSyncImerg.mockResolvedValue({
      ok: true,
      resultado: { celdasActualizadas: 1 },
    })
    const { correrJob, codigoSalida } = await import('./jobs.mjs')

    const resultado = await correrJob('sync-imerg')
    expect(resultado).toEqual({ ok: true, resultado: { celdasActualizadas: 1 } })
    expect(codigoSalida('sync-imerg', resultado)).toBe(0)
  })
})

describe('sync-imerg — token de Earthdata', () => {
  const tokenPrevio = process.env.EARTHDATA_TOKEN

  afterEach(() => {
    if (tokenPrevio === undefined) delete process.env.EARTHDATA_TOKEN
    else process.env.EARTHDATA_TOKEN = tokenPrevio
  })

  it('reenvía EARTHDATA_TOKEN del entorno al job (nunca lo lee el job por su cuenta)', async () => {
    process.env.EARTHDATA_TOKEN = 'token-de-prueba'
    mocks.ejecutarSyncImerg.mockResolvedValue({ ok: true, resultado: {} })
    const { correrJob } = await import('./jobs.mjs')

    await correrJob('sync-imerg')

    expect(mocks.ejecutarSyncImerg).toHaveBeenCalledWith({ earthdataToken: 'token-de-prueba' })
  })
})

describe('gating por ENOS_JOBS_ENABLED', () => {
  // Los jobs comparten un único flag maestro (lib/infraestructura/jobs/flags.ts),
  // deliberadamente distinto de riskEngineEnabled()/episodiosDerivadosEnabled()
  // (esos son flags de UI, ver el módulo de flags): se verifica que con
  // ENOS_JOBS_ENABLED=false los casos cubiertos no importan ni llaman al job real.
  const casos: Array<[string, keyof typeof mocks]> = [
    ['geo-perfiles', 'calcularGeoPerfiles'],
    ['asociacion-rio', 'calcularAsociacionesRio'],
    ['sync-pronostico-caudal', 'ejecutarSyncPronosticoCaudal'],
    ['sync-ensemble', 'ejecutarSyncEnsemble'],
    ['sync-imerg', 'ejecutarSyncImerg'],
    ['climatologia-precipitacion', 'ejecutarCalculoClimatologia'],
    ['climatologia-caudal', 'ejecutarCalculoClimatologiaCaudal'],
    ['climatologia-imerg', 'ejecutarCalculoClimatologiaImerg'],
    ['calcular-riesgo', 'calcularYPublicarRiesgo'],
    ['episodios-derivados', 'correrJobEpisodiosDerivados'],
    ['situacion-corte', 'generarCorte'],
    ['sync-prefectura-alturas', 'syncPrefecturaAlturas'],
    ['sync-synop-lluvia', 'syncSynopLluvia'],
    ['sync-prefectura-historico', 'syncPrefecturaHistorico'],
    ['importar-exposicion-rio-dem', 'importarExposicionRioDem'],
  ]

  it.each(casos)('%s con enosJobsEnabled=false no importa ni llama al job real', async (nombre, mockKey) => {
    mocks.enosJobsEnabled.mockReturnValue(false)
    const { correrJob } = await import('./jobs.mjs')

    const resultado = await correrJob(nombre)
    expect(resultado).toEqual({ ejecutado: false, motivo: 'flag_deshabilitado' })
    expect(mocks[mockKey]).not.toHaveBeenCalled()
    expect(mocks.adquirirLease).not.toHaveBeenCalled()
    expect(mocks.ensureSeeded).not.toHaveBeenCalled()
  })

  it('imprime un WARN a stderr con el nombre del job cuando lo salta el flag', async () => {
    mocks.enosJobsEnabled.mockReturnValue(false)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { correrJob } = await import('./jobs.mjs')

    await correrJob('sync-imerg')

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('sync-imerg'))
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('ENOS_JOBS_ENABLED'))
    warnSpy.mockRestore()
  })
})

describe('geo-perfiles — lease externo', () => {
  it('si el lease no se adquiere, no llama al cálculo y sale con 0', async () => {
    mocks.adquirirLease.mockResolvedValue({ adquirido: false, motivo: 'ya_completado' })
    const { correrJob, codigoSalida } = await import('./jobs.mjs')

    const resultado = await correrJob('geo-perfiles')
    expect(resultado).toMatchObject({ ejecutado: false, motivo: 'ya_completado' })
    expect(mocks.calcularGeoPerfiles).not.toHaveBeenCalled()
    expect(codigoSalida('geo-perfiles', resultado)).toBe(0)
  })
})

describe('asociacion-rio — lease externo', () => {
  it('acepta el nombre, calcula con lease y mapea el resultado a exit 0', async () => {
    mocks.adquirirLease.mockResolvedValue({
      adquirido: true,
      jobRunId: 'job-rio-1',
      leaseOwner: 'owner-rio-1',
    })
    mocks.publicarResultado.mockResolvedValue(true)
    mocks.calcularAsociacionesRio.mockResolvedValue({
      procesados: 5,
      conPunto: 3,
      sinPunto: 2,
      version: 'rio-asociacion-v1',
    })
    const { correrJob, codigoSalida } = await import('./jobs.mjs')

    const resultado = await correrJob('asociacion-rio', {
      ahora: new Date('2026-09-29T03:10:00.000Z'),
    })

    expect(mocks.calcularAsociacionesRio).toHaveBeenCalledOnce()
    expect(mocks.publicarResultado).toHaveBeenCalledWith(
      expect.objectContaining({
        jobRunId: 'job-rio-1',
        estado: 'completado',
        contadores: { procesados: 5, conPunto: 3, sinPunto: 2 },
      }),
    )
    expect(codigoSalida('asociacion-rio', resultado)).toBe(0)
  })

  it('devuelve exit 0 sin importar el cálculo cuando ENOS_JOBS_ENABLED=false', async () => {
    mocks.enosJobsEnabled.mockReturnValue(false)
    const { correrJob, codigoSalida } = await import('./jobs.mjs')

    const resultado = await correrJob('asociacion-rio')

    expect(resultado).toEqual({ ejecutado: false, motivo: 'flag_deshabilitado' })
    expect(mocks.calcularAsociacionesRio).not.toHaveBeenCalled()
    expect(mocks.adquirirLease).not.toHaveBeenCalled()
    expect(mocks.ensureSeeded).not.toHaveBeenCalled()
    expect(codigoSalida('asociacion-rio', resultado)).toBe(0)
  })
})

describe('sync-prefectura-alturas — despacho y códigos de salida', () => {
  it('despacha al job sin opciones y devuelve su resultado', async () => {
    const esperado = { ejecutado: true, estado: 'completo', contadores: { insertadas: 3 } }
    mocks.syncPrefecturaAlturas.mockResolvedValue(esperado)
    const { correrJob, codigoSalida } = await import('./jobs.mjs')

    const resultado = await correrJob('sync-prefectura-alturas')

    expect(mocks.syncPrefecturaAlturas).toHaveBeenCalledTimes(1)
    expect(resultado).toEqual(esperado)
    expect(codigoSalida('sync-prefectura-alturas', resultado)).toBe(0)
  })

  it('un resultado fallido se devuelve sin lanzar y el proceso sale con exit 1', async () => {
    const fallido = { ejecutado: false, estado: 'fallido', mensaje: 'HTTP 503' }
    mocks.syncPrefecturaAlturas.mockResolvedValue(fallido)
    const { correrJob, codigoSalida } = await import('./jobs.mjs')

    const resultado = await correrJob('sync-prefectura-alturas')

    expect(resultado).toEqual(fallido)
    expect(codigoSalida('sync-prefectura-alturas', resultado)).toBe(1)
  })

  it('un lease ya tomado (omitido) sale con exit 0 por ser idempotente', async () => {
    const omitido = { ejecutado: false, estado: 'omitido' }
    mocks.syncPrefecturaAlturas.mockResolvedValue(omitido)
    const { correrJob, codigoSalida } = await import('./jobs.mjs')

    const resultado = await correrJob('sync-prefectura-alturas')

    expect(codigoSalida('sync-prefectura-alturas', resultado)).toBe(0)
  })
})

describe('ensureSeeded — migración antes de despachar', () => {
  it('corre ensureSeeded una sola vez antes de despachar el job (proceso propio sin la migración web)', async () => {
    mocks.ejecutarSyncImerg.mockResolvedValue({ ok: true, resultado: {} })
    const { correrJob } = await import('./jobs.mjs')

    await correrJob('sync-imerg')

    expect(mocks.ensureSeeded).toHaveBeenCalledTimes(1)
  })
})

describe('situacion-corte — lease externo', () => {
  it('si el lease no se adquiere, no llama al corte y sale con 0', async () => {
    mocks.adquirirLease.mockResolvedValue({ adquirido: false, motivo: 'ya_completado' })
    const { correrJob, codigoSalida } = await import('./jobs.mjs')

    const resultado = await correrJob('situacion-corte')
    expect(resultado).toMatchObject({ ejecutado: false, motivo: 'ya_completado' })
    expect(mocks.generarCorte).not.toHaveBeenCalled()
    expect(codigoSalida('situacion-corte', resultado)).toBe(0)
  })

  it('con el lease adquirido genera el corte y publica los contadores', async () => {
    const ahora = new Date('2026-01-01T00:00:00.000Z')
    mocks.adquirirLease.mockResolvedValue({
      adquirido: true,
      jobRunId: 'job-run-1',
      leaseOwner: 'owner-1',
    })
    mocks.publicarResultado.mockResolvedValue(true)
    mocks.generarCorte.mockResolvedValue({
      corteId: 'corte-1',
      generadoEn: '2026-01-01T00:00:00.000Z',
      riskRunId: null,
      kpis: {
        escuelasAfectacionConfirmadaVigente: 1,
        escuelasRiesgoAlto24h: 2,
        fuentesVencidas: 0,
      },
      conteosPorNivelRiesgo: {},
      episodiosAbiertos: 3,
      episodiosCerradosDesdeAnterior: 1,
    })
    const { correrJob, codigoSalida } = await import('./jobs.mjs')

    const resultado = await correrJob('situacion-corte', { ahora })

    expect(mocks.generarCorte).toHaveBeenCalledWith({ ahora, jobRunId: 'job-run-1' })
    expect(mocks.publicarResultado).toHaveBeenCalledWith(
      expect.objectContaining({
        jobRunId: 'job-run-1',
        leaseOwner: 'owner-1',
        estado: 'completado',
        contadores: {
          episodiosAbiertos: 3,
          episodiosCerradosDesdeAnterior: 1,
          escuelasRiesgoAlto24h: 2,
        },
      }),
    )
    expect(resultado).toMatchObject({ ejecutado: true, corteId: 'corte-1', leasePerdido: false })
    expect(codigoSalida('situacion-corte', resultado)).toBe(0)
  })
})

describe('RADAR_SYNC_ENABLED', () => {
  afterEach(() => vi.unstubAllEnvs())

  it.each(['sync-radar-meteo', 'verificar-radar-meteo', 'sync-radar-ensemble'])(
    'bloquea %s antes de migrar o cargar el productor', async nombre => {
      vi.stubEnv('RADAR_SYNC_ENABLED', 'false')
      const { correrJob } = await import('./jobs.mjs')
      await expect(correrJob(nombre)).resolves.toEqual({ ejecutado: false, motivo: 'radar_sync_deshabilitado' })
      expect(mocks.ensureSeeded).not.toHaveBeenCalled()
      expect(mocks.ejecutarSyncRadarMeteo).not.toHaveBeenCalled()
      expect(mocks.ejecutarVerificacionRadarMeteo).not.toHaveBeenCalled()
    },
  )
  it('mantiene habilitados los otros jobs', async () => {
    vi.stubEnv('RADAR_SYNC_ENABLED', 'false')
    mocks.ejecutarSyncImerg.mockResolvedValue({ estado: 'completo' })
    const { correrJob } = await import('./jobs.mjs')
    await expect(correrJob('sync-imerg')).resolves.toEqual({ estado: 'completo' })
    expect(mocks.ejecutarSyncImerg).toHaveBeenCalledOnce()
  })
})
