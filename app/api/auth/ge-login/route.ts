import { ensureSeeded } from '@/lib/db/seed'
import { manejarGeLogin, responderPreflightGe } from '@/lib/ge-sso/handlers'
import { describirAuditoria } from '@/lib/infraestructura/auditoria/contexto'
import { conAuditoria } from '@/lib/infraestructura/auditoria/servidor'
import { crearLimitador } from '@/lib/http/limitador'
import { ruta } from '@/lib/http/ruta'

// Ruta estática: Next la prioriza sobre el catch-all de better-auth
// (app/api/auth/[...all]). Ver odd/tasks/ge-sso-nivel-jurisdiccional.md (T6).
export const runtime = 'nodejs'

const limitador = crearLimitador({ ventanaMs: 60_000, max: 50 })

async function handleOPTIONS(request: Request) {
  return responderPreflightGe(request)
}

async function handlePOST(request: Request) {
  await ensureSeeded()
  return manejarGeLogin(request)
}

// Excepción deliberada: esta ruta NO corre dentro de la transacción del evento porque hace llamadas
// externas a GE y no conviene sostener una transacción abierta sobre red. Si la inserción del evento
// falla, sí puede quedar una sesión creada, pero la respuesta 503 descarta Set-Cookie, así que esa
// sesión no es alcanzable por el cliente.
// Solo el status decide el resultado; el cuerpo (ticket, parámetros) nunca entra al evento.
async function handlePOSTAuditado(request: Request) {
  const respuesta = await handlePOST(request)
  describirAuditoria({ accion: respuesta.status >= 200 && respuesta.status < 300 ? 'session.login_exito' : 'session.login_fallo' })
  return respuesta
}

export const OPTIONS = ruta('auth.ge-login.options', handleOPTIONS)
// El default es de falla: el 429 del limitador responde antes de llegar al handler.
export const POST = conAuditoria('session.login_fallo', '/api/auth/ge-login', ruta('auth.ge-login.post', handlePOSTAuditado, { limite: { limitador } }))
