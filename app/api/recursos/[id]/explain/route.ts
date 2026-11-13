import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { recursos } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { loadRecursoAccess } from '@/lib/db/recurso-access'
import { getSessionUser } from '@/lib/session'
import { puedeVerEnSeccion } from '@/lib/acl'
import { FORMATOS } from '@/lib/model'
import { filterCatalogForSections } from '@/lib/db/hub-catalog-for'
import { loadHubCatalog } from '@/lib/db/hub'
import {
  buildExplainContext,
  explanationFingerprint,
  generateExplanation,
  getCachedExplanation,
} from '@/lib/explain-resource'
import {
  ExplainRequestError,
  ExplainResponseError,
  ExplainTimeoutError,
  ExplainUnavailableError,
  getExplainProvider,
} from '@/lib/explain-provider'
import { ruta } from '@/lib/http/ruta'
import { conAuditoria } from '@/lib/infraestructura/auditoria/servidor'
import { describirAuditoria } from '@/lib/infraestructura/auditoria/contexto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function explainJson(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

async function handlePOST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureSeeded()
  const { id } = await ctx.params
  describirAuditoria({ objetoTipo: 'recurso', objetoId: id })
  const [row] = await getDb().select().from(recursos).where(eq(recursos.id, id))
  if (!row || row.estado !== 'publicado') return explainJson({ error: 'Recurso no encontrado' }, 404)
  const access = await loadRecursoAccess(id)
  if (!access) return explainJson({ error: 'Recurso no encontrado' }, 404)
  const user = await getSessionUser()
  if (!user) return explainJson({ error: { code: 'unauthorized', message: 'No autenticado' } }, 401)
  if (!puedeVerEnSeccion(user, { ...access, formato: row.formato as 'reporte' | 'tablero' | 'mapa', ruta: row.ruta }, user.hubPolicy)) {
    return explainJson({ error: { code: 'forbidden', message: 'No tiene acceso a este recurso' } }, 403)
  }
  const catalog = filterCatalogForSections(await loadHubCatalog({ publishedOnly: true }), user)
  const recurso = catalog.recursos.find((item) => item.id === id)
  if (!recurso) return explainJson({ error: 'Recurso no encontrado' }, 404)
  const context = buildExplainContext(recurso, {
    format: FORMATOS[recurso.formato].label,
    topic: catalog.categorias.find((item) => item.id === recurso.categoriaId)?.nombre ?? 'este tema',
    level: catalog.niveles.find((item) => item.id === recurso.nivelId)?.nombre ?? 'este nivel',
    type: catalog.tipos.find((item) => item.id === recurso.tipoId)?.nombre ?? 'recurso',
    tags: recurso.tagIds.map((id) => catalog.tags.find((item) => item.id === id)?.nombre).filter((item): item is string => Boolean(item)),
  }, user, access)

  const cached = getCachedExplanation(explanationFingerprint(context))
  if (cached) {
    return explainJson({ explanation: cached, cached: true, status: 'success' })
  }

  try {
    const result = await generateExplanation(context, getExplainProvider())
    return explainJson({
      explanation: result.explanation,
      cached: result.cached,
      status: result.status,
    })
  } catch (error) {
    if (error instanceof ExplainUnavailableError) {
      return explainJson(
        { error: { code: 'ai_unavailable', message: 'El resumen con IA no está configurado en este despliegue.' } },
        503,
      )
    }
    if (error instanceof ExplainTimeoutError) {
      return explainJson(
        { error: { code: 'ai_timeout', message: 'El proveedor tardó demasiado. Intente nuevamente en un momento.' } },
        502,
      )
    }
    if (error instanceof ExplainRequestError) {
      return explainJson(
        { error: { code: 'ai_request_failed', message: 'No se pudo generar la explicación. El recurso sigue disponible sin IA.' } },
        502,
      )
    }
    if (error instanceof ExplainResponseError) {
      return explainJson(
        { error: { code: 'ai_invalid_response', message: 'La explicación no se pudo generar correctamente.' } },
        502,
      )
    }
    return explainJson(
      { error: { code: 'ai_error', message: 'No se pudo generar la explicación.' } },
      500,
    )
  }
}

export const POST = conAuditoria('recurso.explicar', '/api/recursos/[id]/explain', ruta('recursos.id.explain.post', handlePOST))
