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

  it('preserves query parameters when translating a legacy dashboard URL', () => {
    const response = middleware(new NextRequest('http://localhost:3000/tablero?cue=1&vista=actual'))
    expect(response.headers.get('location')).toBe('http://localhost:3000/recursos/r2?cue=1&vista=actual')
  })

  it('forwards the original page URL to server layouts for authorization', () => {
    const response = middleware(new NextRequest('http://localhost:3000/mapas/infraestructura?cue=1'))
    expect(response.headers.get('x-middleware-request-x-hub-request-url')).toBe('/mapas/infraestructura?cue=1')
    expect(response.headers.get('x-middleware-override-headers')).toContain('x-hub-request-url')
  })

  it('overwrites a client-supplied hub path header before forwarding it', () => {
    const response = middleware(new NextRequest('http://localhost:3000/mapas/infraestructura?cue=1', {
      headers: { 'x-hub-request-url': '/explorar' },
    }))

    expect(response.headers.get('x-middleware-request-x-hub-request-url')).toBe('/mapas/infraestructura?cue=1')
  })

  it('rewrites direct resource HTML and PDF aliases through the server gate', () => {
    for (const pathname of ['/recursos/r-private.html', '/recursos/r-private.pdf']) {
      const response = middleware(new NextRequest(`http://localhost:3000${pathname}`))
      expect(response.headers.get('x-middleware-rewrite')).toContain('/api/gate/recursos/r-private.')
    }
  })

  it('does not apply the static gate to public report APIs', () => {
    const response = middleware(new NextRequest('http://localhost:3000/api/problematicas/parte'))
    expect(response.headers.get('x-middleware-rewrite')).toBeNull()
  })
})


describe('middleware: host links CADM', () => {
  const request = (path: string, host = 'links.sistemas.mec.gob.ar') => new NextRequest(`http://interno:3000${path}`, { headers: { host } })
  it.each(['/cadm', '/cadm/', '/cadm/admin', '/cadm/api/sesion', '/cadm/api/contenido'])('reescribe %s conservando query', (path) => {
    const res = middleware(request(`${path}?vista=1`))
    expect(res.headers.get('x-middleware-rewrite')).toBe(`http://interno:3000/links${path.slice(5)}?vista=1`)
  })
  it.each(['/links', '/links/admin', '/links/api/sesion', '/cadmx', '/cadm/otro', '/explorar', '/api/auth', '/tablero'])('rechaza %s', (path) => {
    expect(middleware(request(path)).status).toBe(404)
  })
  it('normaliza host y puerto y redirige raíz', () => {
    expect(middleware(request('/', 'LINKS.SISTEMAS.MEC.GOB.AR:443')).headers.get('location')).toBe('https://links.sistemas.mec.gob.ar/cadm')
  })
  it.each(['/_next/static/app.js', '/_next/image', '/marca/escudo.svg', '/favicon.ico'])('sirve %s', (path) => {
    expect(middleware(request(path)).headers.get('x-middleware-next')).toBe('1')
  })
  it.each(['hub.sistemas.mec.gob.ar', 'links.sistemas.mec.gob.ar.evil.test'])('no altera /links en %s', (host) => {
    expect(middleware(request('/links', host)).headers.get('x-middleware-next')).toBe('1')
  })
  it('no confía en forwarded host', () => {
    const req = request('/links', 'hub.sistemas.mec.gob.ar')
    req.headers.set('x-forwarded-host', 'links.sistemas.mec.gob.ar')
    expect(middleware(req).headers.get('x-middleware-next')).toBe('1')
  })
})
