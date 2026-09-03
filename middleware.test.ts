import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { config, middleware } from './middleware'

function rewriteTarget(response: Response): URL | null {
  const value = response.headers.get('x-middleware-rewrite')
  return value ? new URL(value) : null
}

describe('middleware', () => {
  it('rewrites gated prefix roots, nested paths and static files', () => {
    const cases = [
      ['/tablero', '/api/gate/tablero'],
      ['/tablero/index.html', '/api/gate/tablero/index.html'],
      ['/mapa_interactivo/foo', '/api/gate/mapa_interactivo/foo'],
      ['/mapa_sobreedad', '/api/gate/mapa_sobreedad'],
      ['/mapa_notas/bar', '/api/gate/mapa_notas/bar'],
      [
        '/recursos/reporte-sobreedad-inicial.pdf',
        '/api/gate/recursos/reporte-sobreedad-inicial.pdf',
      ],
    ]
    for (const [path, expected] of cases) {
      const response = middleware(new NextRequest(`http://localhost:3000${path}`))
      const target = rewriteTarget(response)
      expect(target?.pathname, path).toBe(expected)
    }
  })

  it('preserves the original query string on the rewritten request', () => {
    const response = middleware(
      new NextRequest('http://localhost:3000/tablero?capa=1&id=2'),
    )
    const target = rewriteTarget(response)
    expect(target?.search).toBe('?capa=1&id=2')
  })

  it('passes through non-gated App Router routes untouched', () => {
    for (const path of [
      '/',
      '/explorar',
      '/explorar?formato=mapa',
      '/mapas/matricula',
      '/recursos/r1',
      '/admin',
      '/login',
      '/forbidden',
    ]) {
      const response = middleware(new NextRequest(`http://localhost:3000${path}`))
      expect(rewriteTarget(response), path).toBeNull()
      expect(response.headers.get('x-middleware-next')).toBe('1')
    }
  })

  it('never rewrites the /recursos/[id] viewer', () => {
    const response = middleware(new NextRequest('http://localhost:3000/recursos/r1'))
    expect(rewriteTarget(response)).toBeNull()
  })
})

describe('middleware config', () => {
  it('matches every gated static prefix with root and nested variants', () => {
    const matcher = config.matcher
    for (const prefix of ['/tablero', '/mapa_interactivo', '/mapa_sobreedad', '/mapa_notas']) {
      expect(matcher).toContain(prefix)
      expect(matcher).toContain(`${prefix}/:path*`)
    }
    expect(matcher).toContain('/recursos/:file.pdf')
  })

  it('excludes catalog routes that run inside the App Router', () => {
    const matcher = config.matcher.join('\n')
    for (const path of ['/explorar', '/recursos/[id]', '/admin', '/mapas/matricula']) {
      expect(matcher, path).not.toContain(path)
    }
  })
})