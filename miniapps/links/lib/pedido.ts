import { BlockList, isIP } from 'node:net'
import { basePathPublico } from './host'

// Only transport metadata is eligible. Never derive the peer from a header.
export function ipPar(request: Request): string | undefined {
  return (request as Request & { socket?: { remoteAddress?: string } }).socket?.remoteAddress
}

function normalizarIp(ip: string) {
  return ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip
}

export function proxyConfiable(ip: string | undefined, lista = process.env.LINKS_TRUSTED_PROXIES ?? '') {
  if (!ip) return false
  const reglas = new BlockList()
  try {
    for (const entrada of lista.split(',').map((s) => s.trim()).filter(Boolean)) {
      const [direccion, prefijo, ...resto] = entrada.split('/')
      const familia = isIP(direccion)
      if (!familia || resto.length || (prefijo !== undefined && !/^\d+$/.test(prefijo))) return false
      const tipo = familia === 4 ? 'ipv4' : 'ipv6'
      if (prefijo === undefined) reglas.addAddress(direccion, tipo)
      else reglas.addSubnet(direccion, Number(prefijo), tipo)
    }
    const par = normalizarIp(ip)
    return reglas.check(par, isIP(par) === 4 ? 'ipv4' : 'ipv6')
  } catch {
    return false
  }
}

export function contextoPedido(request: Request) {
  const url = new URL(request.url)
  const par = ipPar(request)
  const confiar = proxyConfiable(par)
  const hostDirecto = request.headers.get('host') ?? url.host
  // Require single values: the trusted edge must replace, not append, these headers.
  const hostReenviado = request.headers.get('x-forwarded-host')
  const protoReenviado = request.headers.get('x-forwarded-proto')
  const host = confiar && hostReenviado && /^[a-z0-9.:[\]-]+$/i.test(hostReenviado) ? hostReenviado : hostDirecto
  // Production has an HTTPS-only public origin even when TLS terminates upstream.
  const protocolo = process.env.NODE_ENV === 'production' ? 'https:'
    : confiar && (protoReenviado === 'http' || protoReenviado === 'https') ? `${protoReenviado}:` : url.protocol
  let ip = par ? normalizarIp(par) : 'unknown'
  if (confiar) {
    // Walk from the immediate peer towards the client, stopping at the first untrusted hop.
    const cadena = request.headers.get('x-forwarded-for')?.split(',').map((s) => normalizarIp(s.trim())) ?? []
    if (cadena.every((s) => isIP(s))) {
      for (let i = cadena.length - 1; i >= 0 && proxyConfiable(ip); i--) ip = cadena[i]
    }
  }
  return { host, protocolo, ip, basePath: basePathPublico(hostDirecto) }
}

export function origenPropio(request: Request) {
  const origen = request.headers.get('origin')
  if (!origen) return false
  const { host, protocolo } = contextoPedido(request)
  try {
    return new URL(origen).origin === new URL(`${protocolo}//${host}`).origin && origen === new URL(origen).origin
  } catch {
    return false
  }
}

export const NO_STORE = { 'Cache-Control': 'private, no-store' }

export class BodyGrande extends Error {}

export async function leerJsonLimitado(request: Request, maxBytes: number): Promise<unknown> {
  const longitud = request.headers.get('content-length')
  if (longitud && Number(longitud) > maxBytes) throw new BodyGrande()
  const reader = request.body?.getReader()
  if (!reader) return null
  const partes: Uint8Array[] = []
  let bytes = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > maxBytes) {
        await reader.cancel()
        throw new BodyGrande()
      }
      partes.push(value)
    }
    return JSON.parse(Buffer.concat(partes).toString('utf8'))
  } catch (error) {
    if (error instanceof BodyGrande) throw error
    return null
  } finally {
    reader.releaseLock()
  }
}

// Avoid serializing driver errors, query parameters or submitted credentials.
export function rutaLinks(handler: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    let respuesta: Response
    try {
      respuesta = await handler(request)
    } catch (error) {
      const status = error instanceof BodyGrande ? 413 : 500
      if (status === 500) console.error('links_api_error')
      respuesta = Response.json({ error: status === 413 ? 'Contenido demasiado grande' : 'Error interno' }, { status })
    }
    respuesta.headers.set('Cache-Control', NO_STORE['Cache-Control'])
    return respuesta
  }
}
