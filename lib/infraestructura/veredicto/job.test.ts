import { beforeEach, describe, expect, it, vi } from 'vitest'
import { correrJobCierreVeredicto, correrJobVeredicto } from './job'

const mocks = vi.hoisted(() => ({
  adquirirLease: vi.fn(),
  publicarResultado: vi.fn(),
  generarVeredictos: vi.fn(),
  cerrarDiaAnterior: vi.fn(),
  getDb: vi.fn(),
}))

const DB_FAKE = { fake: true }

vi.mock('@/lib/db', () => ({
  getDb: mocks.getDb,
}))

vi.mock('@/lib/infraestructura/riesgo/job-run', () => ({
  adquirirLease: mocks.adquirirLease,
  publicarResultado: mocks.publicarResultado,
}))

vi.mock('./generar', () => ({
  generarVeredictos: mocks.generarVeredictos,
  cerrarDiaAnterior: mocks.cerrarDiaAnterior,
}))

const leaseAdquirido = { adquirido: true, jobRunId: 'jr-1', leaseOwner: 'owner-1' }
const resultadoGenerar = {
  evaluados: 4,
  sinCambios: 1,
  insertados: 3,
  fuenteIa: 2,
  fuentePlantilla: 1,
  motivoFallback: null,
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.getDb.mockReturnValue(DB_FAKE)
  mocks.adquirirLease.mockResolvedValue(leaseAdquirido)
  mocks.generarVeredictos.mockResolvedValue(resultadoGenerar)
  mocks.cerrarDiaAnterior.mockResolvedValue(undefined)
  mocks.publicarResultado.mockResolvedValue(undefined)
})

describe('correrJobVeredicto', () => {
  it('pide lease con la clave del slot UTC de 6h y el tipo veredicto-diario-v0', async () => {
    const ahora = new Date('2026-10-13T14:37:00.000Z')
    await correrJobVeredicto({ ahora })

    expect(mocks.adquirirLease).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'veredicto-diario-v0',
        claveIdempotente: '2026-10-13T12:00:00.000Z',
        version: 'v1',
        duracionLeaseMs: 10 * 60 * 1000,
        ahora,
      }),
    )
  })

  it('dos horas del mismo slot de 6h comparten clave idempotente', async () => {
    await correrJobVeredicto({ ahora: new Date('2026-10-13T18:00:00.000Z') })
    await correrJobVeredicto({ ahora: new Date('2026-10-13T23:59:59.000Z') })
    const claves = mocks.adquirirLease.mock.calls.map(([p]) => p.claveIdempotente)
    expect(claves).toEqual(['2026-10-13T18:00:00.000Z', '2026-10-13T18:00:00.000Z'])
  })

  it('genera veredictos con el db, el instante y el jobRunId del lease', async () => {
    const ahora = new Date('2026-10-13T06:10:00.000Z')
    await correrJobVeredicto({ ahora })

    expect(mocks.generarVeredictos).toHaveBeenCalledWith(DB_FAKE, { ahora, jobRunId: 'jr-1' })
  })

  it('usa el generador inyectado en lugar del real', async () => {
    const generar = vi.fn().mockResolvedValue(resultadoGenerar)
    await correrJobVeredicto({ ahora: new Date('2026-10-13T06:10:00.000Z'), generar })
    expect(generar).toHaveBeenCalledTimes(1)
    expect(mocks.generarVeredictos).not.toHaveBeenCalled()
  })

  it('publica completado con los contadores del resultado', async () => {
    const ahora = new Date('2026-10-13T06:10:00.000Z')
    const resultado = await correrJobVeredicto({ ahora })

    expect(mocks.publicarResultado).toHaveBeenCalledWith(
      expect.objectContaining({
        jobRunId: 'jr-1',
        leaseOwner: 'owner-1',
        estado: 'completado',
        ahora,
      }),
    )
    expect(resultado).toEqual({ ejecutado: true, resultado: resultadoGenerar })
  })

  it('si el lease no se adquiere no genera nada y devuelve el motivo', async () => {
    mocks.adquirirLease.mockResolvedValue({ adquirido: false, motivo: 'ya_completado' })
    const resultado = await correrJobVeredicto({ ahora: new Date('2026-10-13T06:10:00.000Z') })

    expect(mocks.generarVeredictos).not.toHaveBeenCalled()
    expect(mocks.publicarResultado).not.toHaveBeenCalled()
    expect(resultado).toEqual({ ejecutado: false, motivo: 'ya_completado' })
  })

  it('ante error publica fallido con mensaje saneado y relanza', async () => {
    mocks.generarVeredictos.mockRejectedValue(new Error('secreto interno'))
    await expect(correrJobVeredicto({ ahora: new Date('2026-10-13T06:10:00.000Z') })).rejects.toThrow(
      'secreto interno',
    )
    expect(mocks.publicarResultado).toHaveBeenCalledWith(
      expect.objectContaining({
        estado: 'fallido',
        errorSaneado: 'fallo al generar los veredictos',
      }),
    )
  })
})

describe('correrJobCierreVeredicto', () => {
  it('pide lease de cierre con la fecha ART anterior como clave', async () => {
    // 2026-10-13T03:30Z es 2026-10-13 00:30 en ART: el día anterior es 2026-10-12.
    const ahora = new Date('2026-10-13T03:30:00.000Z')
    await correrJobCierreVeredicto({ ahora })

    expect(mocks.adquirirLease).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'veredicto-cierre-v0',
        claveIdempotente: '2026-10-12',
        version: 'v1',
        duracionLeaseMs: 10 * 60 * 1000,
        ahora,
      }),
    )
  })

  it('cierra el día anterior con el db y el instante', async () => {
    const ahora = new Date('2026-10-13T03:30:00.000Z')
    await correrJobCierreVeredicto({ ahora })
    expect(mocks.cerrarDiaAnterior).toHaveBeenCalledWith(DB_FAKE, ahora)
    expect(mocks.publicarResultado).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'completado', ahora }),
    )
  })

  it('si el lease no se adquiere no cierra nada', async () => {
    mocks.adquirirLease.mockResolvedValue({ adquirido: false, motivo: 'en_progreso_vigente' })
    const resultado = await correrJobCierreVeredicto({ ahora: new Date('2026-10-13T03:30:00.000Z') })
    expect(mocks.cerrarDiaAnterior).not.toHaveBeenCalled()
    expect(resultado).toEqual({ ejecutado: false, motivo: 'en_progreso_vigente' })
  })
})
