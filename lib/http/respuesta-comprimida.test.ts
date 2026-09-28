import { brotliDecompressSync, gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { BROTLI_QUALITY, jsonComprimido } from './respuesta-comprimida'

function pedido(acceptEncoding?: string) {
  const headers: Record<string, string> = {}
  if (acceptEncoding !== undefined) headers['accept-encoding'] = acceptEncoding
  return new Request('http://localhost/api', { headers })
}

function pedidoCon(headers: Record<string, string>) {
  return new Request('http://localhost/api', { headers })
}

const datos = {
  escuelas: [
    { cueAnexo: '1801605-04', nombre: 'Escuela N° 1', matricula: 321 },
    { cueAnexo: '1801605-05', nombre: 'Escuela N° 2', matricula: 154 },
  ],
}

describe('jsonComprimido', () => {
  it('expone la calidad de brotli usada', () => {
    expect(BROTLI_QUALITY).toBe(4)
  })

  it('comprime con brotli cuando el cliente acepta br', async () => {
    const res = jsonComprimido(pedido('br'), datos)
    expect(res.headers.get('Content-Encoding')).toBe('br')
    const cuerpo = Buffer.from(await res.arrayBuffer())
    expect(JSON.parse(brotliDecompressSync(cuerpo).toString())).toEqual(datos)
  })

  it('comprime con gzip cuando el cliente acepta gzip', async () => {
    const res = jsonComprimido(pedido('gzip'), datos)
    expect(res.headers.get('Content-Encoding')).toBe('gzip')
    const cuerpo = Buffer.from(await res.arrayBuffer())
    expect(JSON.parse(gunzipSync(cuerpo).toString())).toEqual(datos)
  })

  it('devuelve JSON plano cuando no hay encoding aceptado', async () => {
    const res = jsonComprimido(pedido(), datos)
    expect(res.headers.get('Content-Encoding')).toBeNull()
    expect(await res.json()).toEqual(datos)
  })

  it('preserva el status y los headers personalizados', async () => {
    const res = jsonComprimido(pedido('br'), datos, {
      status: 201,
      headers: { 'Cache-Control': 'private, no-store' },
    })
    expect(res.status).toBe(201)
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(res.headers.get('Vary')).toBe('Accept-Encoding')
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const cuerpo = Buffer.from(await res.arrayBuffer())
    expect(JSON.parse(brotliDecompressSync(cuerpo).toString())).toEqual(datos)
  })

  it('siempre incluye un ETag estable entre codificaciones', () => {
    const br = jsonComprimido(pedido('br'), datos)
    const gzip = jsonComprimido(pedido('gzip'), datos)
    const plano = jsonComprimido(pedido(), datos)
    const etag = br.headers.get('ETag')
    expect(etag).toMatch(/^"[A-Za-z0-9_-]{22}"$/)
    expect(gzip.headers.get('ETag')).toBe(etag)
    expect(plano.headers.get('ETag')).toBe(etag)
  })

  it('devuelve 304 sin cuerpo cuando If-None-Match coincide', async () => {
    const etag = jsonComprimido(pedido('br'), datos).headers.get('ETag')!
    const res = jsonComprimido(
      pedidoCon({ 'accept-encoding': 'br', 'if-none-match': etag }),
      datos,
      { headers: { 'Cache-Control': 'private, no-cache' } },
    )
    expect(res.status).toBe(304)
    expect(res.body).toBeNull()
    expect(res.headers.get('ETag')).toBe(etag)
    expect(res.headers.get('Vary')).toBe('Accept-Encoding')
    expect(res.headers.get('Cache-Control')).toBe('private, no-cache')
  })

  it('acepta If-None-Match débil, en listas y comodín', () => {
    const etag = jsonComprimido(pedido(), datos).headers.get('ETag')!
    expect(jsonComprimido(pedidoCon({ 'if-none-match': `W/${etag}` }), datos).status).toBe(304)
    expect(jsonComprimido(pedidoCon({ 'if-none-match': `"otro", ${etag}` }), datos).status).toBe(304)
    expect(jsonComprimido(pedidoCon({ 'if-none-match': '*' }), datos).status).toBe(304)
  })

  it('devuelve 200 con cuerpo cuando If-None-Match no coincide', async () => {
    const res = jsonComprimido(pedidoCon({ 'if-none-match': '"no-coincide"' }), datos)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(datos)
  })

  it('nunca devuelve 304 cuando el status no es 200', () => {
    const etag = jsonComprimido(pedido(), datos).headers.get('ETag')!
    for (const status of [201, 400, 404, 500]) {
      const res = jsonComprimido(pedidoCon({ 'if-none-match': etag }), datos, { status })
      expect(res.status).toBe(status)
    }
  })
})
