import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { linksSesiones } from '@/lib/db/schema'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

// Sessions and credentials are independent of the Hub accounts.
export const COOKIE = 'links_admin'
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
    if (usuarios.some((u) => u.usuario === usuario)) return null
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

const credencialHash = (cred: Credenciales, usuario: Usuario) => createHmac('sha256', cred.secreto).update(JSON.stringify([usuario.usuario, usuario.clave])).digest('hex')
const idHash = (token: string) => hash(token).toString('hex')

export async function crearSesion(cred: Credenciales, usuario: string, ahora = Date.now()) {
  const cuenta = cred.usuarios.find((u) => u.usuario === usuario)
  if (!cuenta) throw new Error('Usuario inválido')
  const token = randomBytes(32).toString('base64url')
  await getDb().insert(linksSesiones).values({
    id: idHash(token), usuario, credencialHash: credencialHash(cred, cuenta),
    expira: new Date(ahora + DURACION_S * 1000),
  })
  return token
}

export async function usuarioSesion(cred: Credenciales, token: string | undefined, ahora = Date.now()): Promise<string | null> {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  const [sesion] = await getDb().select().from(linksSesiones).where(eq(linksSesiones.id, idHash(token)))
  if (!sesion || sesion.revocada || sesion.expira.getTime() <= ahora) return null
  const cuenta = cred.usuarios.find((u) => u.usuario === sesion.usuario)
  if (!cuenta || !iguales(sesion.credencialHash, credencialHash(cred, cuenta))) return null
  return sesion.usuario
}

export async function revocarSesion(token: string | undefined) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return
  await getDb().update(linksSesiones).set({ revocada: true }).where(eq(linksSesiones.id, idHash(token)))
}

export { origenPropio } from './pedido'
