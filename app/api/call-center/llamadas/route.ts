import { jsonNoStore } from '@/lib/infraestructura/respuesta-no-store'
import { callCenterGuard } from '@/lib/call-center/acceso'
import { getSessionUser } from '@/lib/session'
import { ruta } from '@/lib/http/ruta'
import { listarLlamadasPorCue, registrarLlamada, validarEntradaLlamada } from '@/lib/call-center/llamadas'
import { normalizeCue } from '@/lib/infraestructura/cue'
import { cambioAuditado, conAuditoria } from '@/lib/infraestructura/auditoria/servidor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handlePOST(request: Request) {
  const user = await getSessionUser()
  const denied = callCenterGuard(user)
  if (denied) return Response.json({ error: denied.error }, { status: denied.status })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'El cuerpo de la llamada no es válido' }, { status: 400 })
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return Response.json({ error: 'El cuerpo de la llamada no es válido' }, { status: 400 })
  }

  const validated = validarEntradaLlamada(body)
  if (!validated.ok) return Response.json({ error: validated.error }, { status: 400 })

  // El autor es siempre la sesión: un usuarioId del body se ignora.
  const llamada = await cambioAuditado(
    () => registrarLlamada({ ...validated.value, usuarioId: user!.id }),
    registrada => ({ status: 201, objetoTipo: 'llamada', objetoId: registrada.id, cueAnexo: registrada.cueAnexo }),
  )
  return jsonNoStore({ llamada }, 201)
}

async function handleGET(request: Request) {
  const denied = callCenterGuard(await getSessionUser())
  if (denied) return Response.json({ error: denied.error }, { status: denied.status })

  const cue = normalizeCue(new URL(request.url).searchParams.get('cue') ?? '')
  if (!cue) return Response.json({ error: 'CUE inválido' }, { status: 400 })

  const llamadas = await listarLlamadasPorCue(cue.value)
  return jsonNoStore({ llamadas })
}

export const POST = conAuditoria('call_center.llamada_crear', '/api/call-center/llamadas', ruta('call-center.llamadas.post', handlePOST))
export const GET = ruta('call-center.llamadas.get', handleGET)
