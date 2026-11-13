import { z } from 'zod'
import { configSchema } from '@/miniapps/links/lib/config'
import { usuarioAdmin } from '@/miniapps/links/lib/admin'
import { leerJsonLimitado, origenPropio, rutaLinks } from '@/miniapps/links/lib/pedido'
import { guardarConfig } from '@/miniapps/links/lib/store'
import { actorAuditoria } from '@/lib/infraestructura/auditoria/contexto'
import { cambioAuditado, conAuditoria } from '@/lib/infraestructura/auditoria/servidor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const escrituraSchema = configSchema.extend({ revision: z.number().int().min(0).max(2_147_483_646) })

export const PUT = conAuditoria('links.contenido_modificar', '/links/api/contenido', rutaLinks(async (request) => {
  if (!origenPropio(request)) return Response.json({ error: 'Origen no permitido' }, { status: 403 })
  const usuario = await usuarioAdmin()
  if (!usuario) return Response.json({ error: 'No autorizado' }, { status: 401 })
  actorAuditoria({ actorTipo: 'compartido', actorId: usuario, actorRol: null, viaAcceso: 'sesion_links' })
  const parsed = escrituraSchema.safeParse(await leerJsonLimitado(request, 512 * 1024))
  if (!parsed.success) {
    return Response.json({
      error: 'Contenido inválido',
      detalles: parsed.error.issues.map((issue) => ({ ruta: issue.path.join('.'), mensaje: issue.message })),
    }, { status: 400 })
  }
  const guardado = await cambioAuditado(
    () => guardarConfig(parsed.data, usuario),
    resultado => resultado
      ? { status: 200, objetoTipo: 'linktree', objetoId: 'config', metadatos: { revision: resultado.revision } }
      : { status: 409, objetoTipo: 'linktree', objetoId: 'config' },
  )
  if (!guardado) return Response.json({ error: 'Otra persona publicó cambios. Tu borrador se conserva. Recargá para ver la versión publicada.' }, { status: 409 })
  return Response.json(guardado)
}))
