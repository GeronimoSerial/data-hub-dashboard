import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

// The miniapp has its own single credential, set through the environment, and
// its own signed cookie. It shares nothing with the Hub's accounts or roles.
export const COOKIE = 'links_admin'
export const COOKIE_PATH = '/links'
export const DURACION_S = 8 * 60 * 60

export interface Usuario {
  usuario: string
  clave: string
}

export interface Credenciales {
  usuarios: Usuario[]
  secreto: string
}

// LINKS_ADMIN_USERS is "usuario:clave" pairs separated by ",". The first ":" splits
// each pair, so a password may contain ":" but not ",".
function leerUsuarios(crudo: string | undefined): Usuario[] | null {
  if (!crudo?.trim()) return null
  const usuarios: Usuario[] = []
  for (const par of crudo.split(',')) {
    if (!par.trim()) continue
    const corte = par.indexOf(':')
    const usuario = par.slice(0, corte).trim()
    const clave = par.slice(corte + 1)
    if (corte < 1 || !usuario || !clave) return null
    usuarios.push({ usuario, clave })
  }
  return usuarios.length > 0 ? usuarios : null
}

/** Null when anything is missing, malformed or too weak: the admin stays closed rather than open. */
export function leerCredenciales(env: Record<string, string | undefined> = process.env): Credenciales | null {
  const usuarios = leerUsuarios(env.LINKS_ADMIN_USERS)
  const secreto = env.LINKS_SESSION_SECRET
  if (!usuarios || !secreto || secreto.length < 32) return null
  return { usuarios, secreto }
}

const hash = (valor: string) => createHash('sha256').update(valor).digest()

// Hashing first gives both sides the same length, which timingSafeEqual requires.
const iguales = (a: string, b: string) => timingSafeEqual(hash(a), hash(b))

/** Checks every user, with no early exit, so the time taken does not reveal which name exists. */
export function credencialesValidas(cred: Credenciales, usuario: string, clave: string) {
  let valido = false
  for (const candidato of cred.usuarios) {
    const usuarioOk = iguales(candidato.usuario, usuario)
    const claveOk = iguales(candidato.clave, clave)
    if (usuarioOk && claveOk) valido = true
  }
  return valido
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
