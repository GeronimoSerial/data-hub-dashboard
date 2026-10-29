import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

// The miniapp has its own single credential, set through the environment, and
// its own signed cookie. It shares nothing with the Hub's accounts or roles.
export const COOKIE = 'links_admin'
export const COOKIE_PATH = '/links'
export const DURACION_S = 8 * 60 * 60

export interface Credenciales {
  usuario: string
  clave: string
  secreto: string
}

/** Null when any variable is missing or too weak: the admin stays closed rather than open. */
export function leerCredenciales(env: Record<string, string | undefined> = process.env): Credenciales | null {
  const usuario = env.LINKS_ADMIN_USER?.trim()
  const clave = env.LINKS_ADMIN_PASSWORD
  const secreto = env.LINKS_SESSION_SECRET
  if (!usuario || !clave || !secreto || secreto.length < 32) return null
  return { usuario, clave, secreto }
}

const hash = (valor: string) => createHash('sha256').update(valor).digest()

// Hashing first gives both sides the same length, which timingSafeEqual requires.
const iguales = (a: string, b: string) => timingSafeEqual(hash(a), hash(b))

export function credencialesValidas(cred: Credenciales, usuario: string, clave: string) {
  const usuarioOk = iguales(cred.usuario, usuario)
  const claveOk = iguales(cred.clave, clave)
  return usuarioOk && claveOk
}

const firmar = (secreto: string, expira: string) => createHmac('sha256', secreto).update(`links:${expira}`).digest('base64url')

export function crearToken(secreto: string, ahora = Date.now()) {
  const expira = String(Math.floor(ahora / 1000) + DURACION_S)
  return `${expira}.${firmar(secreto, expira)}`
}

export function tokenValido(secreto: string, token: string | undefined, ahora = Date.now()) {
  if (!token) return false
  const [expira, firma, ...resto] = token.split('.')
  if (!expira || !firma || resto.length > 0 || !/^\d+$/.test(expira)) return false
  if (!iguales(firma, firmar(secreto, expira))) return false
  return Number(expira) > Math.floor(ahora / 1000)
}

/** Mutations must come from this site: the Origin host has to match the request host. */
export function origenPropio(request: Request) {
  const origen = request.headers.get('origin')
  if (!origen) return false
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  try {
    return new URL(origen).host === host
  } catch {
    return false
  }
}
