import { cookies } from 'next/headers'
import { COOKIE, leerCredenciales, tokenValido } from './sesion'

/** Reads the miniapp cookie; false when the admin is not configured or the cookie is not valid. */
export async function esAdmin() {
  const cred = leerCredenciales()
  if (!cred) return false
  return tokenValido(cred.secreto, (await cookies()).get(COOKIE)?.value)
}
