import { auth } from '@/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'
import { ensureSeeded } from '@/lib/db/seed'
import type { AccionAuditoria } from '@/lib/infraestructura/auditoria/catalogo'
import { actorAuditoria, describirAuditoria } from '@/lib/infraestructura/auditoria/contexto'
import { cambioAuditado, conAuditoria } from '@/lib/infraestructura/auditoria/servidor'
import { ruta } from '@/lib/http/ruta'
import { getSessionUser } from '@/lib/session'

export const runtime = 'nodejs'

const handler = toNextJsHandler(auth)

async function handleGET(request: Request) {
  await ensureSeeded()
  return handler.GET(request)
}

async function handlePOST(request: Request) {
  await ensureSeeded()
  if (new URL(request.url).pathname === '/api/auth/change-password') {
    const user = await getSessionUser()
    if (user?.banned) {
      return Response.json({ message: 'No tiene acceso a este recurso' }, {
        status: 403,
        headers: { 'Cache-Control': 'private, no-store' },
      })
    }
  }
  // El handler corre dentro de la transacción del evento: sus escrituras (sesión, usuario, baneo)
  // se confirman junto con el evento. Un 4xx se confirma igual; una excepción o una falla de
  // inserción revierte todo y la respuesta sale como 503 sin Set-Cookie.
  return cambioAuditado(async () => {
    const respuesta = await handler.POST(request)
    await identificarInicioSesion(pathname(request), respuesta)
    return respuesta
  }, (respuesta) => ({
    status: respuesta.status,
    accion: accionSesion(pathname(request), respuesta.status),
  }))
}

// La acción la decide la ruta y el status. Sin cuerpo: ni correo ni contraseña llegan al evento.
function accionSesion(pathname: string, status: number): AccionAuditoria {
  const exito = status >= 200 && status < 300
  if (pathname.endsWith('/sign-out')) return exito ? 'session.logout_exito' : 'session.logout_fallo'
  if (pathname.startsWith('/api/auth/sign-in/')) return exito ? 'session.login_exito' : 'session.login_fallo'
  return 'cuenta.operacion'
}

// better-auth responde { user: { id, role } } al iniciar sesión. Se lee una copia para que la respuesta
// original salga intacta. Solo se toman el id y el rol: token, cookie y correo nunca llegan al evento.
// Sin usuario en el cuerpo (p. ej. un paso intermedio) el evento queda anónimo.
async function identificarInicioSesion(pathname: string, respuesta: Response) {
  if (accionSesion(pathname, respuesta.status) !== 'session.login_exito') return
  try {
    const cuerpo = await respuesta.clone().json() as { user?: { id?: unknown; role?: unknown } } | null
    if (typeof cuerpo?.user?.id !== 'string') return
    actorAuditoria({
      actorTipo: 'usuario',
      actorId: cuerpo.user.id,
      actorRol: typeof cuerpo.user.role === 'string' ? cuerpo.user.role : null,
      viaAcceso: 'sesion',
    })
  } catch {
    /* cuerpo que no es JSON: el evento queda anónimo */
  }
}

function pathname(request: Request) {
  return new URL(request.url).pathname
}

async function handlePOSTAuditado(request: Request) {
  try {
    const respuesta = await handlePOST(request)
    describirAuditoria({ accion: accionSesion(pathname(request), respuesta.status) })
    return respuesta
  } catch (error) {
    describirAuditoria({ accion: accionSesion(pathname(request), 500) })
    throw error
  }
}

export const GET = ruta('auth.all.get', handleGET)
// El default es de falla: si la ruta responde antes de llegar al handler (p. ej. 429), queda registrado como fallo.
export const POST = conAuditoria('session.login_fallo', '/api/auth/[...all]', ruta('auth.all.post', handlePOSTAuditado))
