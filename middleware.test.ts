import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from './middleware'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('middleware: legacy static dashboards', () => {
  // Next's middleware adapter rejects a relative Location with ERR_INVALID_URL,
  // which turned /tablero into a 500 on staging.
  it('redirects /tablero to the public origin, not the internal bind address', () => {
    vi.stubEnv('BETTER_AUTH_URL', '')
    const request = new NextRequest('http://0.0.0.0:3000/tablero', {
      headers: { 'x-forwarded-host': 'staging.analisis.sistemas.mec.gob.ar', 'x-forwarded-proto': 'https' },
    })

    const response = middleware(request)

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://staging.analisis.sistemas.mec.gob.ar/recursos/r2')
  })

  it('prefers BETTER_AUTH_URL as the public origin', () => {
    vi.stubEnv('BETTER_AUTH_URL', 'https://analisis.sistemas.mec.gob.ar')
    const response = middleware(new NextRequest('http://0.0.0.0:3000/mapa_notas/'))

    expect(response.headers.get('location')).toBe('https://analisis.sistemas.mec.gob.ar/recursos/r14')
  })
})
