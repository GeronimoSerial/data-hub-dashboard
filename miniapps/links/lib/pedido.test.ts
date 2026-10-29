import { afterEach, describe, expect, it, vi } from 'vitest'
import { BodyGrande, contextoPedido, leerJsonLimitado, origenPropio, proxyConfiable, rutaLinks } from './pedido'

afterEach(() => vi.unstubAllEnvs())
const pedido = (peer?: string) => {
  const req = new Request('http://interno:3000/links/api/sesion', { headers: {
    host: 'interno:3000', origin: 'https://publico.example.org',
    'x-forwarded-host': 'publico.example.org', 'x-forwarded-proto': 'https', 'x-forwarded-for': '198.51.100.4, 10.0.0.2',
  } })
  if (peer) Object.defineProperty(req, 'socket', { value: { remoteAddress: peer } })
  return req
}

describe('confianza en proxies', () => {
  it('sin lista no confía aunque exista socket', () => {
    vi.stubEnv('LINKS_TRUSTED_PROXIES', '')
    expect(origenPropio(pedido('10.0.0.1'))).toBe(false)
    expect(contextoPedido(pedido('10.0.0.1'))).toMatchObject({ ip: '10.0.0.1', host: 'interno:3000', protocolo: 'http:' })
  })
  it('sin socket ignora todas las cabeceras aunque la lista esté configurada', () => {
    vi.stubEnv('LINKS_TRUSTED_PROXIES', '10.0.0.0/8')
    expect(origenPropio(pedido())).toBe(false)
    expect(contextoPedido(pedido()).ip).toBe('unknown')
  })
  it('peer confiable habilita host, proto y primer salto no confiable', () => {
    vi.stubEnv('LINKS_TRUSTED_PROXIES', '10.0.0.0/8')
    expect(origenPropio(pedido('10.0.0.1'))).toBe(true)
    expect(contextoPedido(pedido('10.0.0.1'))).toMatchObject({ host: 'publico.example.org', protocolo: 'https:', ip: '198.51.100.4' })
    expect(origenPropio(pedido('203.0.113.2'))).toBe(false)
  })
  it('no permite falsificar IP a la izquierda de un salto no confiable', () => {
    vi.stubEnv('LINKS_TRUSTED_PROXIES', '10.0.0.0/8')
    const req = pedido('10.0.0.1')
    req.headers.set('x-forwarded-for', '192.0.2.77, 203.0.113.4')
    expect(contextoPedido(req).ip).toBe('203.0.113.4')
  })
  it('rechaza un protocolo distinto aunque el host coincida', () => {
    const req = new Request('http://example.org/links', { headers: { host: 'example.org', origin: 'https://example.org' } })
    expect(origenPropio(req)).toBe(false)
  })
  it('producción exige HTTPS sin depender de forwarded proto ni URL interna', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const req = pedido()
    req.headers.set('host', 'publico.example.org')
    req.headers.set('x-forwarded-proto', 'http')
    expect(origenPropio(req)).toBe(true)
    expect(contextoPedido(req).protocolo).toBe('https:')
    req.headers.set('origin', 'http://publico.example.org')
    expect(origenPropio(req)).toBe(false)
  })
  it('acepta origen directo exacto y rechaza ausencia o formato inválido', () => {
    const req = new Request('https://example.org/links', { headers: { host: 'example.org', origin: 'https://example.org' } })
    expect(origenPropio(req)).toBe(true)
    for (const origin of ['', 'null', 'https://evil.example', 'https://example.org/path']) {
      req.headers.set('origin', origin)
      expect(origenPropio(req)).toBe(false)
    }
  })
  it('soporta IPv4, IPv6 y mapped IPv4; configuración inválida cierra confianza', () => {
    expect(proxyConfiable('10.1.2.3', '10.0.0.0/8')).toBe(true)
    expect(proxyConfiable('::ffff:10.1.2.3', '10.0.0.0/8')).toBe(true)
    expect(proxyConfiable('::1', '::1/128')).toBe(true)
    expect(proxyConfiable('10.1.2.3', '10.0.0.0/8,mal')).toBe(false)
    expect(proxyConfiable('10.1.2.3', '10.0.0.0/99')).toBe(false)
  })
})

describe('body y errores privados', () => {
  it('limita Content-Length y streams sin longitud incluyendo bytes UTF-8', async () => {
    const req = new Request('https://example.org', { method: 'POST', body: '"ááá"' })
    await expect(leerJsonLimitado(req, 6)).rejects.toBeInstanceOf(BodyGrande)
    const conLongitud = new Request('https://example.org', { method: 'POST', headers: { 'content-length': '100' }, body: '{}' })
    await expect(leerJsonLimitado(conLongitud, 10)).rejects.toBeInstanceOf(BodyGrande)
  })
  it('500 nunca serializa error y lleva no-store', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await rutaLinks(async () => { throw new Error('dato privado de prueba') })(pedido())
    expect(res.status).toBe(500)
    expect(res.headers.get('cache-control')).toContain('no-store')
    expect(await res.text()).not.toContain('dato privado')
    expect(log).toHaveBeenCalledWith('links_api_error')
    log.mockRestore()
  })
})
