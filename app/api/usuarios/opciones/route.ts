import { getSessionUser } from '@/lib/session'
import { mutateUsuariosDenied, getHubUserSession } from '@/lib/usuarios'
import { loadHubCatalog } from '@/lib/db/hub'
import { HUB_DESTINATIONS } from '@/lib/hub-sections'
import { serverHubPathAllowedByExistingAcl } from '@/lib/hub-entry-server'
import type { Role } from '@/lib/acl'
import { ensureSeeded } from '@/lib/db/seed'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ROLES: Role[] = ['admin', 'editor', 'consulta', 'director_nivel', 'operador_establecimiento', 'admin_ge']
const NO_STORE = { 'Cache-Control': 'private, no-store' }

async function adminDenial() {
  const actor = await getSessionUser()
  return mutateUsuariosDenied(actor)
}

async function handleGET() {
  await ensureSeeded()
  const denied = await adminDenial()
  if (denied) return Response.json({ error: denied.error }, { status: denied.status, headers: NO_STORE })

  // Management choices are deliberately separate from the section-filtered read catalog.
  const catalog = await loadHubCatalog({ publishedOnly: false })
  return Response.json({
    recursos: catalog.recursos.map(({ id, titulo, nivelId }) => ({
      id, titulo, nivelId,
      nivelNombre: catalog.niveles.find((nivel) => nivel.id === nivelId)?.nombre ?? nivelId,
    })),
  }, { headers: NO_STORE })
}

async function handlePOST(request: Request) {
  await ensureSeeded()
  const denied = await adminDenial()
  if (denied) return Response.json({ error: denied.error }, { status: denied.status, headers: NO_STORE })

  let body: unknown
  try { body = await request.json() } catch {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400, headers: NO_STORE })
  }
  if (!body || typeof body !== 'object') return Response.json({ error: 'Cuerpo inválido' }, { status: 400, headers: NO_STORE })
  const input = body as Record<string, unknown>
  if (typeof input.role !== 'string' || !ROLES.includes(input.role as Role)
    || !Array.isArray(input.nivelJurIds) || !input.nivelJurIds.every((id) => Number.isSafeInteger(id) && Number(id) > 0)
    || !Array.isArray(input.recursoIds) || !input.recursoIds.every((id) => typeof id === 'string')
    || !['todos', 'seleccionados'].includes(String(input.accesoRecursos))) {
    return Response.json({ error: 'Permisos del usuario inválidos' }, { status: 400, headers: NO_STORE })
  }

  const existing = typeof input.userId === 'string' ? await getHubUserSession(input.userId) : null
  if (input.userId !== undefined && !existing) return Response.json({ error: 'Usuario no encontrado' }, { status: 404, headers: NO_STORE })
  const target = {
    ...(existing ?? { id: 'pending-user', cueAnexo: null }),
    // A temporary ban blocks runtime entry, not administration of the account's
    // configurable destination. The persisted ban remains untouched here.
    banned: false,
    role: input.role as Role,
    nivelJurIds: input.nivelJurIds as number[],
    accesoRecursos: input.accesoRecursos as 'todos' | 'seleccionados',
    recursoIds: input.recursoIds as string[],
  }
  const destinos: string[] = []
  for (const entry of HUB_DESTINATIONS) {
    if (await serverHubPathAllowedByExistingAcl(target, entry.path)) destinos.push(entry.path)
  }
  return Response.json({ destinos }, { headers: NO_STORE })
}

export const GET = ruta('usuarios.opciones.get', handleGET)
export const POST = ruta('usuarios.opciones.post', handlePOST)
