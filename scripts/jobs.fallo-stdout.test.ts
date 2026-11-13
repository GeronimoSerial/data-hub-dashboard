import { afterEach, describe, expect, it, vi } from 'vitest'
import { reportarFalloDespacho } from './jobs.mjs'

describe('reportarFalloDespacho', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('imprime mensaje y stack por stdout (Coolify no guarda stderr) y mantiene stderr', () => {
    const out = vi.spyOn(console, 'log').mockImplementation(() => {})
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('canceling statement due to statement timeout')

    reportarFalloDespacho('sync-imerg', error)

    const stdout = out.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(stdout).toContain('sync-imerg')
    expect(stdout).toContain('canceling statement due to statement timeout')
    expect(stdout).toContain(String(error.stack).split('\n')[1].trim())
    expect(err).toHaveBeenCalledWith('canceling statement due to statement timeout')
  })

  it('no filtra EARTHDATA_TOKEN en la salida', () => {
    vi.stubEnv('EARTHDATA_TOKEN', 'tok-secreto-123')
    const out = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})

    reportarFalloDespacho('sync-imerg', new Error('fetch fallo con tok-secreto-123'))

    const stdout = out.mock.calls.map((c) => c.join(' ')).join('\n')
    expect(stdout).not.toContain('tok-secreto-123')
    expect(stdout).toContain('[REDACTED]')
  })

  it('acepta valores no Error', () => {
    const out = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    reportarFalloDespacho('sync-imerg', 'boom')
    expect(out.mock.calls.map((c) => c.join(' ')).join('\n')).toContain('boom')
  })
})
