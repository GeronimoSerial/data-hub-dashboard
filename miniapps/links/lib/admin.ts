import { cookies } from 'next/headers'
import { COOKIE, leerCredenciales, usuarioSesion } from './sesion'

export async function usuarioAdmin(): Promise<string | null> {
  const cred = leerCredenciales()
  if (!cred) return null
  return usuarioSesion(cred, (await cookies()).get(COOKIE)?.value)
}

export async function esAdmin() {
  return (await usuarioAdmin()) !== null
}
