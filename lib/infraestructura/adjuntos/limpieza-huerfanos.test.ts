import { describe, expect, it, vi } from 'vitest'
import { limpiarObjetosHuerfanos, type DependenciasLimpieza } from './limpieza-huerfanos'

const ahora = new Date('2026-10-15T12:00:00.000Z')

function dependencias(overrides: Partial<DependenciasLimpieza> = {}) {
  return {
    listar: vi.fn(async () => [
      { key: 'reportes/cue/mov/known/optimizada.jpg', lastModified: new Date('2026-10-14T00:00:00Z') },
      { key: 'reportes/cue/mov/orphan/optimizada.jpg', lastModified: new Date('2026-10-14T00:00:00Z') },
      { key: 'reportes/cue/mov/recent/miniatura.jpg', lastModified: new Date('2026-10-15T11:30:00Z') },
      { key: 'huerfanos/reportes/cue/mov/old.jpg', lastModified: new Date('2026-10-13T00:00:00Z') },
    ]),
    clavesAdjuntas: vi.fn(async () => new Set(['reportes/cue/mov/known/optimizada.jpg'])),
    moverAHuerfanos: vi.fn(async () => undefined),
    log: vi.fn(),
    ...overrides,
  }
}

describe('limpiarObjetosHuerfanos', () => {
  it('dry-runs only old report objects without attachment references', async () => {
    const deps = dependencias()
    const result = await limpiarObjetosHuerfanos({ ahora }, deps)

    expect(result).toMatchObject({ dryRun: true, examinados: 3, referenciados: 1, recientes: 1, candidatos: 1, movidos: 0 })
    expect(deps.moverAHuerfanos).not.toHaveBeenCalled()
  })

  it('quarantines only candidates when dry-run is disabled', async () => {
    const deps = dependencias()
    const result = await limpiarObjetosHuerfanos({ dryRun: false, ahora }, deps)

    expect(result.movidos).toBe(1)
    expect(deps.moverAHuerfanos).toHaveBeenCalledOnce()
    expect(deps.moverAHuerfanos).toHaveBeenCalledWith('reportes/cue/mov/orphan/optimizada.jpg')
  })
})
