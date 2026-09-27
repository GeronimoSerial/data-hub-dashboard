import { beforeEach, describe, expect, it, vi } from 'vitest'
import { correrJobBriefingIA } from './job'

const mocks = vi.hoisted(() => ({
  obtenerUltimoCorte: vi.fn(),
  adquirirLease: vi.fn(),
  publicarResultado: vi.fn(),
  generarBriefingAsistido: vi.fn(),
}))

// Se mockean los tres módulos completos: el puerto real, el de lease y el
// pipeline de generación. Así los tests son de unidad pura sobre el orquestador
// y nunca tocan la base ni ejecutan la IA.
vi.mock('./puertos', () => ({
  crearPuertoCorteSituacionReal: () => ({
    obtenerUltimoCorte: mocks.obtenerUltimoCorte,
    obtenerCortePorId: vi.fn(),
    obtenerCorteAnterior: vi.fn(),
  }),
}))

vi.mock('@/lib/infraestructura/riesgo/job-run', () => ({
  adquirirLease: mocks.adquirirLease,
  publicarResultado: mocks.publicarResultado,
}))

vi.mock('./generar-briefing-asistido', () => ({
  generarBriefingAsistido: mocks.generarBriefingAsistido,
}))

function corteFake(id = 'corte-1') {
  return {
    id,
    generadoEn: '2026-09-27T00:00:00.000Z',
    riskRunId: null,
    cobertura: null,
    conteosPorNivelRiesgo: {},
    kpis: {
      escuelasAfectacionConfirmadaVigente: 0,
      escuelasRiesgoAlto24h: 0,
      fuentesVencidas: 0,
    },
    fuentesSalud: [],
    episodiosAbiertos: 0,
    episodiosCerradosDesdeAnterior: 0,
    generadoPorJobRunId: null,
    creadaEn: '2026-09-27T00:00:00.000Z',
  }
}

const ahora = new Date('2026-09-27T12:00:00.000Z')
const leaseAdquirido = { adquirido: true, jobRunId: 'jr-1', leaseOwner: 'owner-1' }

beforeEach(() => {
  vi.resetAllMocks()
})

describe('correrJobBriefingIA', () => {
  it('sin corte disponible no pide lease ni genera briefing', async () => {
    mocks.obtenerUltimoCorte.mockResolvedValue(null)

    const resultado = await correrJobBriefingIA({ ahora })

    expect(resultado).toEqual({ ejecutado: false, motivo: 'sin_corte_disponible' })
    expect(mocks.adquirirLease).not.toHaveBeenCalled()
    expect(mocks.generarBriefingAsistido).not.toHaveBeenCalled()
    expect(mocks.publicarResultado).not.toHaveBeenCalled()
  })

  it('con lease en progreso vigente no genera ni publica', async () => {
    mocks.obtenerUltimoCorte.mockResolvedValue(corteFake())
    mocks.adquirirLease.mockResolvedValue({ adquirido: false, motivo: 'en_progreso_vigente' })

    const resultado = await correrJobBriefingIA({ ahora })

    expect(resultado).toEqual({ ejecutado: false, motivo: 'en_progreso_vigente' })
    expect(mocks.adquirirLease).toHaveBeenCalledWith({
      tipo: 'briefing-ia-v0',
      claveIdempotente: 'corte-1',
      version: 'v1',
      duracionLeaseMs: 10 * 60 * 1000,
      ahora,
    })
    expect(mocks.generarBriefingAsistido).not.toHaveBeenCalled()
    expect(mocks.publicarResultado).not.toHaveBeenCalled()
  })

  it('con lease ya completado no genera ni publica', async () => {
    mocks.obtenerUltimoCorte.mockResolvedValue(corteFake())
    mocks.adquirirLease.mockResolvedValue({ adquirido: false, motivo: 'ya_completado' })

    const resultado = await correrJobBriefingIA({ ahora })

    expect(resultado).toEqual({ ejecutado: false, motivo: 'ya_completado' })
    expect(mocks.generarBriefingAsistido).not.toHaveBeenCalled()
    expect(mocks.publicarResultado).not.toHaveBeenCalled()
  })

  it('con briefing de fuente ia publica completado con contador esFuenteIa en 1', async () => {
    mocks.obtenerUltimoCorte.mockResolvedValue(corteFake())
    mocks.adquirirLease.mockResolvedValue(leaseAdquirido)
    mocks.generarBriefingAsistido.mockResolvedValue({
      ejecutado: true,
      briefing: { fuente: 'ia', motivoFallback: null },
    })

    const resultado = await correrJobBriefingIA({ ahora })

    expect(resultado).toEqual({
      ejecutado: true,
      corteId: 'corte-1',
      fuente: 'ia',
      motivoFallback: null,
    })
    expect(mocks.publicarResultado).toHaveBeenCalledWith({
      jobRunId: 'jr-1',
      leaseOwner: 'owner-1',
      estado: 'completado',
      contadores: { esFuenteIa: 1 },
      ahora,
    })
  })

  it('con briefing de fuente plantilla publica completado con contador esFuenteIa en 0', async () => {
    mocks.obtenerUltimoCorte.mockResolvedValue(corteFake())
    mocks.adquirirLease.mockResolvedValue(leaseAdquirido)
    mocks.generarBriefingAsistido.mockResolvedValue({
      ejecutado: true,
      briefing: { fuente: 'plantilla', motivoFallback: 'presupuesto_agotado' },
    })

    const resultado = await correrJobBriefingIA({ ahora })

    expect(resultado).toEqual({
      ejecutado: true,
      corteId: 'corte-1',
      fuente: 'plantilla',
      motivoFallback: 'presupuesto_agotado',
    })
    expect(mocks.publicarResultado).toHaveBeenCalledWith({
      jobRunId: 'jr-1',
      leaseOwner: 'owner-1',
      estado: 'completado',
      contadores: { esFuenteIa: 0 },
      ahora,
    })
  })

  it('si el corte desaparece al ejecutar publica fallido sin briefing', async () => {
    mocks.obtenerUltimoCorte.mockResolvedValue(corteFake())
    mocks.adquirirLease.mockResolvedValue(leaseAdquirido)
    mocks.generarBriefingAsistido.mockResolvedValue({
      ejecutado: false,
      motivo: 'sin_corte_disponible',
    })

    const resultado = await correrJobBriefingIA({ ahora })

    expect(resultado).toEqual({ ejecutado: false, motivo: 'sin_corte_disponible' })
    expect(mocks.publicarResultado).toHaveBeenCalledWith({
      jobRunId: 'jr-1',
      leaseOwner: 'owner-1',
      estado: 'fallido',
      errorSaneado: 'corte ya no disponible al ejecutar',
      ahora,
    })
  })

  it('si la generación tira una excepción publica fallido con error genérico y relanza', async () => {
    mocks.obtenerUltimoCorte.mockResolvedValue(corteFake())
    mocks.adquirirLease.mockResolvedValue(leaseAdquirido)
    mocks.generarBriefingAsistido.mockRejectedValue(new Error('detalle crudo secreto'))

    await expect(correrJobBriefingIA({ ahora })).rejects.toThrow('detalle crudo secreto')

    expect(mocks.publicarResultado).toHaveBeenCalledWith({
      jobRunId: 'jr-1',
      leaseOwner: 'owner-1',
      estado: 'fallido',
      errorSaneado: 'fallo al generar el briefing asistido',
      ahora,
    })
    expect(mocks.publicarResultado).not.toHaveBeenCalledWith(
      expect.objectContaining({ errorSaneado: expect.stringContaining('detalle crudo secreto') }),
    )
  })
})
