import { cookies } from 'next/headers'
import { actorAuditoria, describirAuditoria } from './auditoria/contexto'
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
import { getRawClient } from '@/lib/db'
import { crearEjecutorSql, ensureGeSchema } from '@/lib/infraestructura/ge-db'
import { nivelJurisdiccionalDeCue } from '@/lib/infraestructura/nivel-jurisdiccional'
import { normalizeCue } from '@/lib/infraestructura/cue'
import {
  accesoParteSesion,
  type DecisionAccesoParte,
} from '@/lib/infraestructura/acceso-parte-sesion'

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
  if (tieneAccesoPublico(request)) {
    actorAuditoria({ actorTipo: 'compartido', actorId: null, actorRol: null, viaAcceso: 'password_compartida' })
    return true
  }
  return esAdministrador()
}

/** Para páginas del App Router, que leen la cookie del store de la request. */
export async function tieneAccesoAlParteDesdeCookies(): Promise<boolean> {
  const cookieStore = await cookies()
  if (tieneAccesoPublicoDesdeValorCookie(cookieStore.get(NOMBRE_COOKIE)?.value)) return true
  return esAdministrador()
}

/**
 * Decisión por rol de sesión (operador de establecimiento / director de nivel).
 * Sólo consulta la base cuando la contraseña y la verificación ya fallaron, y
 * para director sólo si hay CUE, para resolver su nivel jurisdiccional.
 */
export async function decisionAccesoParteDeSesion(cuePedido: string | null): Promise<DecisionAccesoParte> {
  const user = await getSessionUser()
  const pedido = normalizeCue(cuePedido ?? '')?.value ?? null
  let nivelDeCue: number | null = null
  if (user && !user.banned && user.role === 'director_nivel' && pedido) {
    const client = crearEjecutorSql(getRawClient())
    await ensureGeSchema(client)
    nivelDeCue = (await nivelJurisdiccionalDeCue(client, pedido))?.id ?? null
  }
  return accesoParteSesion(user, pedido, nivelDeCue)
}

/**
 * Código de denegación para una API del parte: 403 si la sesión es de un rol
 * con alcance por CUE (ya autenticada, pero fuera de su alcance); 401 en el
 * resto, como siempre.
 */
export async function codigoSinAccesoParte(): Promise<401 | 403> {
  const user = await getSessionUser()
  if (user && !user.banned && (user.role === 'operador_establecimiento' || user.role === 'director_nivel')) {
    return 403
  }
  return 401
}

/**
 * Acceso acotado al CUE exacto de una verificación (batch E1): un director
 * que entró por el enlace de "Hay afectación" puede usar el formulario de
 * parte SIN la contraseña compartida, pero SÓLO para ese CUE y sólo mientras
 * la sesión canjeada del token no venció. Nunca amplía a otro CUE ni a rol
 * admin — ver verificacion-sesion.ts para el alcance exacto.
 * Después, la sesión por rol (operador/director) con su alcance propio.
 */
export async function tieneAccesoAlParteParaCue(request: Request, cueAnexo: string): Promise<boolean> {
  describirAuditoria({ cueAnexo })
  if (await tieneAccesoAlParte(request)) return true
  const cookieHeader = request.headers.get('cookie')
  const valor = extraerCookieVerificacionSesion(cookieHeader)
  const verificacionId = verificacionIdDeSesionValida(valor, cueAnexo)
  if (verificacionId && (await verificacionHabilitaSesionEscritura(verificacionId))) {
    actorAuditoria({ actorTipo: 'enlace', actorId: verificacionId, actorRol: null, viaAcceso: 'sesion_verificacion' })
    return true
  }
  return (await decisionAccesoParteDeSesion(cueAnexo)).permitido
}

async function tieneCredencialParteDesdeCookies(cueAnexo: string | null): Promise<boolean> {
  if (await tieneAccesoAlParteDesdeCookies()) return true
  if (!cueAnexo) return false
  const cookieStore = await cookies()
  const valor = cookieStore.get(NOMBRE_COOKIE_SESION_VERIFICACION)?.value
  const verificacionId = verificacionIdDeSesionValida(valor, cueAnexo)
  if (!verificacionId) return false
  const habilitada = await verificacionHabilitaSesionEscritura(verificacionId)
  if (habilitada) actorAuditoria({ actorTipo: 'enlace', actorId: verificacionId, actorRol: null, viaAcceso: 'sesion_verificacion' })
  return habilitada
}

/** Para Server Components (app/problematicas/parte/page.tsx). */
export async function tieneAccesoAlParteParaCueDesdeCookies(cueAnexo: string): Promise<boolean> {
  if (await tieneCredencialParteDesdeCookies(cueAnexo)) return true
  return (await decisionAccesoParteDeSesion(cueAnexo)).permitido
}

/**
 * Para páginas del parte: resuelve si se puede entrar y con qué CUE. Sin ?cue,
 * el operador usa el CUE de su sesión; el director debe elegirlo por URL.
 */
export async function resolverAccesoParteDesdeCookies(cuePedido: string | null): Promise<DecisionAccesoParte> {
  if (await tieneCredencialParteDesdeCookies(cuePedido)) {
    return { permitido: true, cue: cuePedido }
  }
  return decisionAccesoParteDeSesion(cuePedido)
}
