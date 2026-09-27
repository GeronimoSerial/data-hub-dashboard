import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  calcularGeoPerfiles: vi.fn(),
  ejecutarSyncPronosticoCaudal: vi.fn(),
  ejecutarSyncEnsemble: vi.fn(),
  ejecutarSyncImerg: vi.fn(),
  ejecutarCalculoClimatologia: vi.fn(),
  ejecutarCalculoClimatologiaCaudal: vi.fn(),
  calcularYPublicarRiesgo: vi.fn(),
  correrJobEpisodiosDerivados: vi.fn(),
  enosJobsEnabled: vi.fn(),
  adquirirLease: vi.fn(),
  publicarResultado: vi.fn(),
}))

vi.mock('../lib/infraestructura/riesgo/geo-perfil.ts', () => ({
  calcularGeoPerfiles: mocks.calcularGeoPerfiles,
}))
vi.mock('../lib/infraestructura/riesgo/jobs/sync-pronostico-caudal.ts', () => ({
  ejecutarSyncPronosticoCaudal: mocks.ejecutarSyncPronosticoCaudal,
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
vi.mock('../lib/infraestructura/riesgo/jobs/calcular-climatologia-caudal.ts', () => ({
  ejecutarCalculoClimatologiaCaudal: mocks.ejecutarCalculoClimatologiaCaudal,
}))
vi.mock('../lib/infraestructura/riesgo/jobs/calcular-riesgo.ts', () => ({
  calcularYPublicarRiesgo: mocks.calcularYPublicarRiesgo,
}))
vi.mock('../lib/infraestructura/episodios-derivados/job.ts', () => ({
  correrJobEpisodiosDerivados: mocks.correrJobEpisodiosDerivados,
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
  it('rechaza un nombre desconocido con un error que dice "desconocido" y el CLI saldría con 2', async () => {
    const { correrJob, JobDesconocidoError } = await import('./jobs.mjs')

    await expect(correrJob('nombre-invalido')).rejects.toThrow(/desconocido/)

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
  // Los 8 jobs comparten un único flag maestro (lib/infraestructura/jobs/flags.ts),
  // deliberadamente distinto de riskEngineEnabled()/episodiosDerivadosEnabled()
  // (esos son flags de UI, ver el módulo de flags): se verifica que con
  // ENOS_JOBS_ENABLED=false ninguno de los 8 importa ni llama al job real.
  const casos: Array<[string, keyof typeof mocks]> = [
    ['geo-perfiles', 'calcularGeoPerfiles'],
    ['sync-pronostico-caudal', 'ejecutarSyncPronosticoCaudal'],
    ['sync-ensemble', 'ejecutarSyncEnsemble'],
    ['sync-imerg', 'ejecutarSyncImerg'],
    ['climatologia-precipitacion', 'ejecutarCalculoClimatologia'],
    ['climatologia-caudal', 'ejecutarCalculoClimatologiaCaudal'],
    ['calcular-riesgo', 'calcularYPublicarRiesgo'],
    ['episodios-derivados', 'correrJobEpisodiosDerivados'],
  ]

  it.each(casos)('%s con enosJobsEnabled=false no importa ni llama al job real', async (nombre, mockKey) => {
    mocks.enosJobsEnabled.mockReturnValue(false)
    const { correrJob } = await import('./jobs.mjs')

    const resultado = await correrJob(nombre)
    expect(resultado).toEqual({ ejecutado: false, motivo: 'flag_deshabilitado' })
    expect(mocks[mockKey]).not.toHaveBeenCalled()
    expect(mocks.adquirirLease).not.toHaveBeenCalled()
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
