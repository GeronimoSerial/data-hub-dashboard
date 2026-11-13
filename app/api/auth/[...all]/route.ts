import { auth } from '@/lib/auth'
import { toNextJsHandler } from 'better-auth/next-js'
import { ensureSeeded } from '@/lib/db/seed'
import type { AccionAuditoria } from '@/lib/infraestructura/auditoria/catalogo'
import { describirAuditoria } from '@/lib/infraestructura/auditoria/contexto'
import { conAuditoria } from '@/lib/infraestructura/auditoria/servidor'
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
  return handler.POST(request)
}

// La acción la decide la ruta y el status. Sin cuerpo: ni correo ni contraseña llegan al evento.
function accionSesion(pathname: string, status: number): AccionAuditoria {
  const exito = status >= 200 && status < 300
  if (pathname.endsWith('/sign-out')) return exito ? 'session.logout_exito' : 'session.logout_fallo'
  if (pathname.startsWith('/api/auth/sign-in/')) return exito ? 'session.login_exito' : 'session.login_fallo'
  return 'cuenta.operacion'
}

async function handlePOSTAuditado(request: Request) {
  const pathname = new URL(request.url).pathname
  try {
    const respuesta = await handlePOST(request)
    describirAuditoria({ accion: accionSesion(pathname, respuesta.status) })
    return respuesta
  } catch (error) {
    describirAuditoria({ accion: accionSesion(pathname, 500) })
    throw error
  }
}

export const GET = ruta('auth.all.get', handleGET)
// El default es de falla: si la ruta responde antes de llegar al handler (p. ej. 429), queda registrado como fallo.
export const POST = conAuditoria('session.login_fallo', '/api/auth/[...all]', ruta('auth.all.post', handlePOSTAuditado))
