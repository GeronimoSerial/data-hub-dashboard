import { configSchema } from '@/lib/linktree/config'
import { soloAdminDenegado } from '@/lib/linktree/permiso'
import { cargarConfig, guardarConfig } from '@/lib/linktree/store'
import { getSessionUser } from '@/lib/session'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

async function handleGET() {
  const denied = soloAdminDenegado(await getSessionUser())
  if (denied) return Response.json({ error: denied.error }, { status: denied.status, headers: NO_STORE })
  return Response.json(await cargarConfig(), { headers: NO_STORE })
}

async function handlePUT(request: Request) {
  const user = await getSessionUser()
  const denied = soloAdminDenegado(user)
  if (denied) return Response.json({ error: denied.error }, { status: denied.status, headers: NO_STORE })

  let body: unknown
  try { body = await request.json() } catch {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400, headers: NO_STORE })
  }
  const parsed = configSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({
      error: 'Configuración inválida',
      detalles: parsed.error.issues.map((issue) => ({ ruta: issue.path.join('.'), mensaje: issue.message })),
    }, { status: 400, headers: NO_STORE })
  }
  await guardarConfig(parsed.data, user!.id)
  return Response.json(parsed.data, { headers: NO_STORE })
}

export const GET = ruta('linktree.get', handleGET)
export const PUT = ruta('linktree.put', handlePUT)
