import { cookies } from 'next/headers'
import { getSessionUser } from '@/lib/session'
import {
  NOMBRE_COOKIE,
  tieneAccesoPublico,
  tieneAccesoPublicoDesdeValorCookie,
} from '@/lib/infraestructura/acceso-publico'
import {
  extraerCookieVerificacionSesion,
  NOMBRE_COOKIE_SESION_VERIFICACION,
  verificacionIdDeSesionValida,
} from '@/lib/infraestructura/verificacion-sesion'
import { verificacionHabilitaSesionEscritura } from '@/lib/infraestructura/verificaciones'

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

/**
 * Acceso acotado al CUE exacto de una verificación (batch E1): un director
 * que entró por el enlace de "Hay afectación" puede usar el formulario de
 * parte SIN la contraseña compartida, pero SÓLO para ese CUE y sólo mientras
 * la sesión canjeada del token no venció. Nunca amplía a otro CUE ni a rol
 * admin — ver verificacion-sesion.ts para el alcance exacto.
 */
export async function tieneAccesoAlParteParaCue(request: Request, cueAnexo: string): Promise<boolean> {
  if (await tieneAccesoAlParte(request)) return true
  const cookieHeader = request.headers.get('cookie')
  const valor = extraerCookieVerificacionSesion(cookieHeader)
  const verificacionId = verificacionIdDeSesionValida(valor, cueAnexo)
  if (!verificacionId) return false
  return verificacionHabilitaSesionEscritura(verificacionId)
}

/** Para Server Components (app/problematicas/parte/page.tsx). */
export async function tieneAccesoAlParteParaCueDesdeCookies(cueAnexo: string): Promise<boolean> {
  if (await tieneAccesoAlParteDesdeCookies()) return true
  const cookieStore = await cookies()
  const valor = cookieStore.get(NOMBRE_COOKIE_SESION_VERIFICACION)?.value
  const verificacionId = verificacionIdDeSesionValida(valor, cueAnexo)
  if (!verificacionId) return false
  return verificacionHabilitaSesionEscritura(verificacionId)
}
