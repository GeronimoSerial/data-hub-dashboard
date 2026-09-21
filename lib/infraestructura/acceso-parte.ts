import { cookies } from 'next/headers'
import { getSessionUser } from '@/lib/session'
import {
  NOMBRE_COOKIE,
  tieneAccesoPublico,
  tieneAccesoPublicoDesdeValorCookie,
} from '@/lib/infraestructura/acceso-publico'

/*
  Guarda del recorrido del parte: contraseña pública O sesión de administrador.

  Por qué existe este módulo y no un cambio dentro de acceso-publico.ts: ese
  archivo se declara la única costura con el mundo público y promete que el día
  que llegue la autenticación por token se reescribe él solo, sin tocar a sus
  llamadores. Meterle la sesión del hub adentro rompería esa promesa —pasaría a
  depender de la base y del rol—, así que la composición vive acá, una capa
  arriba, y él sigue siendo sólo contraseña.

  El rol es 'admin' y no isStaff(): la contraseña se puso porque el contexto del
  parte incluye identidad de alumnos, y ese mismo dato ya tiene una regla de
  acceso escrita en permiso-nominal.ts, donde 'admin' entra sin grant y 'editor'
  queda afuera a propósito. Abrirle la puerta a 'editor' acá contradiría esa
  decisión por la ventana de al lado.

  El orden importa: primero la contraseña, que es una verificación HMAC en
  memoria, y sólo si falla se resuelve la sesión, que consulta la base. Así el
  director —que es quien más entra— nunca paga ese viaje.
*/

async function esAdministrador(): Promise<boolean> {
  const user = await getSessionUser()
  return Boolean(user && !user.banned && user.role === 'admin')
}

/** Para Route Handlers, que reciben la cookie dentro del Request. */
export async function tieneAccesoAlParte(request: Request): Promise<boolean> {
  if (tieneAccesoPublico(request)) return true
  return esAdministrador()
}

/** Para páginas del App Router, que leen la cookie del store de la request. */
export async function tieneAccesoAlParteDesdeCookies(): Promise<boolean> {
  const cookieStore = await cookies()
  if (tieneAccesoPublicoDesdeValorCookie(cookieStore.get(NOMBRE_COOKIE)?.value)) return true
  return esAdministrador()
}
