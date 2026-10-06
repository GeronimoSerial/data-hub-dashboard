// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pedirSyncParte, registrarServiceWorkerParte } from './registrar-sync'

afterEach(() => vi.unstubAllGlobals())

describe('registrar-sync', () => {
  it('sin serviceWorker devuelve null/false y no lanza', async () => {
    vi.stubGlobal('navigator', {})
    expect(await registrarServiceWorkerParte()).toBeNull()
    expect(await pedirSyncParte()).toBe(false)
  })

  it('sin SyncManager (Safari) no registra sync', async () => {
    vi.stubGlobal('navigator', {
      serviceWorker: { register: vi.fn(async () => ({})), ready: Promise.resolve({}) },
    })
    expect(await pedirSyncParte()).toBe(false)
  })

  it('con SyncManager registra el tag', async () => {
    const register = vi.fn(async () => {})
    vi.stubGlobal('navigator', {
      serviceWorker: { register: vi.fn(async () => ({})), ready: Promise.resolve({ sync: { register } }) },
    })
    expect(await pedirSyncParte()).toBe(true)
    expect(register).toHaveBeenCalledWith('parte-envio')
  })
})
