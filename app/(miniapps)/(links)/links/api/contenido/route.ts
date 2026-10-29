import { ruta } from '@/lib/http/ruta'
import { configSchema } from '@/miniapps/links/lib/config'
import { esAdmin } from '@/miniapps/links/lib/admin'
import { origenPropio } from '@/miniapps/links/lib/sesion'
import { guardarConfig } from '@/miniapps/links/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

async function handlePUT(request: Request) {
  if (!origenPropio(request)) return Response.json({ error: 'Origen no permitido' }, { status: 403, headers: NO_STORE })
  if (!(await esAdmin())) return Response.json({ error: 'No autorizado' }, { status: 401, headers: NO_STORE })

  const parsed = configSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({
      error: 'Contenido inválido',
      detalles: parsed.error.issues.map((issue) => ({ ruta: issue.path.join('.'), mensaje: issue.message })),
    }, { status: 400, headers: NO_STORE })
  }
  await guardarConfig(parsed.data)
  return Response.json(parsed.data, { headers: NO_STORE })
}

export const PUT = ruta('links.contenido.put', handlePUT)
