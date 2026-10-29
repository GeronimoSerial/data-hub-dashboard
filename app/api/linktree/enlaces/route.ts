import { agregarEnlaceSchema } from '@/lib/linktree/config'
import { agregarEnlaceRapido } from '@/lib/linktree/editar'
import { actualizarConfig } from '@/lib/linktree/store'
import { getSessionUser, staffGuard } from '@/lib/session'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

// Staff (admin, editor) can add a link to the public page; changing or removing
// existing ones stays with the admin-only `PUT /api/linktree`.
async function handlePOST(request: Request) {
  const user = await getSessionUser()
  const denied = staffGuard(user)
  if (denied) return Response.json({ error: denied.error }, { status: denied.status, headers: NO_STORE })

  let body: unknown
  try { body = await request.json() } catch {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400, headers: NO_STORE })
  }
  const parsed = agregarEnlaceSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({
      error: 'Revisá el enlace y la descripción.',
      detalles: parsed.error.issues.map((issue) => ({ ruta: issue.path.join('.'), mensaje: issue.message })),
    }, { status: 400, headers: NO_STORE })
  }

  const enlaceId = crypto.randomUUID()
  const config = await actualizarConfig(user!.id, (actual) =>
    agregarEnlaceRapido(actual, enlaceId, crypto.randomUUID(), parsed.data.url, parsed.data.descripcion),
  )
  if (!config) {
    return Response.json(
      { error: 'No hay lugar para más enlaces en el grupo. Pedile a un administrador que ordene la lista.' },
      { status: 409, headers: NO_STORE },
    )
  }
  const enlace = config.grupos.flatMap((grupo) => grupo.enlaces).find((e) => e.id === enlaceId)
  return Response.json({ enlace }, { status: 201, headers: NO_STORE })
}

export const POST = ruta('linktree.enlaces.post', handlePOST)
