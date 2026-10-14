import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { correrJobCierreVeredicto, correrJobVeredicto } from './job'

const mocks = vi.hoisted(() => ({
  adquirirLease: vi.fn(),
  publicarResultado: vi.fn(),
  generarVeredictos: vi.fn(),
  cerrarDiaAnterior: vi.fn(),
  getDb: vi.fn(),
  actualizarSaludFuente: vi.fn(),
}))

const DB_FAKE = { fake: true }

vi.mock('@/lib/db', () => ({
  getDb: mocks.getDb,
}))

vi.mock('@/lib/infraestructura/riesgo/job-run', () => ({
  adquirirLease: mocks.adquirirLease,
  publicarResultado: mocks.publicarResultado,
}))

vi.mock('@/lib/infraestructura/riesgo/jobs/salud-fuente', () => ({
  actualizarSaludFuente: mocks.actualizarSaludFuente,
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
  fuentesNoDisponibles: [] as string[],
}

// Registro de eventos inexistente por defecto: no debe afectar a las corridas sin foco en salud.
const RUTA_REGISTRO_INEXISTENTE = path.join(tmpdir(), 'no-existe-eventos.csv')

function saludEscrita(provider: string) {
  return mocks.actualizarSaludFuente.mock.calls
    .map(([, params]) => params)
    .find((params) => params.provider === provider)
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.actualizarSaludFuente.mockResolvedValue(undefined)
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

describe('salud del veredicto y del registro de eventos', () => {
  const ahora = new Date('2026-10-13T12:00:00.000Z')

  it('degradado con las fuentes no disponibles en la corrida', async () => {
    mocks.generarVeredictos.mockResolvedValue({
      ...resultadoGenerar,
      fuentesNoDisponibles: ['glofas', 'ensamble'],
    })
    await correrJobVeredicto({ ahora, rutaRegistroEventos: RUTA_REGISTRO_INEXISTENTE })

    expect(saludEscrita('veredicto-diario')).toEqual(
      expect.objectContaining({
        ttlMinutos: 360,
        licencia: 'interna',
        estado: 'degradado',
        ultimoErrorSaneado: 'fuentes no disponibles: glofas, ensamble',
        ahoraIso: ahora.toISOString(),
      }),
    )
  })

  it('degradado cuando la IA cae a plantilla por un motivo de la lista', async () => {
    mocks.generarVeredictos.mockResolvedValue({ ...resultadoGenerar, motivoFallback: 'sin_api_key' })
    await correrJobVeredicto({ ahora, rutaRegistroEventos: RUTA_REGISTRO_INEXISTENTE })

    expect(saludEscrita('veredicto-diario')).toEqual(
      expect.objectContaining({ estado: 'degradado', ultimoErrorSaneado: 'IA: sin_api_key' }),
    )
  })

  it('ok sin fuentes caídas ni fallback de IA', async () => {
    await correrJobVeredicto({ ahora, rutaRegistroEventos: RUTA_REGISTRO_INEXISTENTE })

    expect(saludEscrita('veredicto-diario')).toEqual(
      expect.objectContaining({ estado: 'ok', ultimoErrorSaneado: null }),
    )
  })

  it('no_disponible si la generación falla, sin el mensaje crudo, y relanza el error', async () => {
    mocks.generarVeredictos.mockRejectedValue(new Error('secreto interno'))
    await expect(
      correrJobVeredicto({ ahora, rutaRegistroEventos: RUTA_REGISTRO_INEXISTENTE }),
    ).rejects.toThrow('secreto interno')

    expect(saludEscrita('veredicto-diario')).toEqual(
      expect.objectContaining({
        estado: 'no_disponible',
        ultimoErrorSaneado: 'fallo al generar los veredictos',
      }),
    )
  })

  it('un fallo al escribir la salud no hace fallar el job', async () => {
    mocks.actualizarSaludFuente.mockRejectedValue(new Error('db caída'))
    const resultado = await correrJobVeredicto({ ahora, rutaRegistroEventos: RUTA_REGISTRO_INEXISTENTE })
    expect(resultado.ejecutado).toBe(true)
  })

  it('registro de eventos ausente se reporta como no_disponible', async () => {
    await correrJobVeredicto({ ahora, rutaRegistroEventos: RUTA_REGISTRO_INEXISTENTE })

    expect(saludEscrita('registro-eventos-inundaciones')).toEqual(
      expect.objectContaining({
        ttlMinutos: 10080,
        licencia: 'registro manual',
        estado: 'no_disponible',
        ultimoErrorSaneado: 'registro de eventos no publicado',
      }),
    )
  })

  it('registro de eventos reciente se reporta como ok', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'veredicto-registro-'))
    const ruta = path.join(dir, 'eventos.csv')
    writeFileSync(ruta, 'fecha\n')
    await correrJobVeredicto({ ahora, rutaRegistroEventos: ruta })

    expect(saludEscrita('registro-eventos-inundaciones')).toEqual(
      expect.objectContaining({ estado: 'ok', ultimoErrorSaneado: null }),
    )
  })

  it('registro de eventos con más de 7 días se reporta como degradado con su fecha', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'veredicto-registro-'))
    const ruta = path.join(dir, 'eventos.csv')
    writeFileSync(ruta, 'fecha\n')
    const viejo = new Date('2026-10-01T12:00:00.000Z')
    utimesSync(ruta, viejo, viejo)
    await correrJobVeredicto({ ahora, rutaRegistroEventos: ruta })

    expect(saludEscrita('registro-eventos-inundaciones')).toEqual(
      expect.objectContaining({
        estado: 'degradado',
        ultimoErrorSaneado: 'registro de eventos sin actualizar desde 01/10/2026',
      }),
    )
  })
})
