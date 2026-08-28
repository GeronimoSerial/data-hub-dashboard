import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { recursos } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { loadRecursoAccess } from '@/lib/db/recurso-access'
import { getSessionUser } from '@/lib/session'
import { FORMATOS } from '@/lib/model'
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

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureSeeded()
  const { id } = await ctx.params
  const [row] = await getDb().select().from(recursos).where(eq(recursos.id, id))
  if (!row || row.estado !== 'publicado') return Response.json({ error: 'Recurso no encontrado' }, { status: 404 })
  const access = await loadRecursoAccess(id)
  if (!access) return Response.json({ error: 'Recurso no encontrado' }, { status: 404 })
  const catalog = await loadHubCatalog({ publishedOnly: true })
  const recurso = catalog.recursos.find((item) => item.id === id)
  if (!recurso) return Response.json({ error: 'Recurso no encontrado' }, { status: 404 })
  const user = await getSessionUser()
  const context = buildExplainContext(recurso, {
    format: FORMATOS[recurso.formato].label,
    topic: catalog.categorias.find((item) => item.id === recurso.categoriaId)?.nombre ?? 'este tema',
    level: catalog.niveles.find((item) => item.id === recurso.nivelId)?.nombre ?? 'este nivel',
    type: catalog.tipos.find((item) => item.id === recurso.tipoId)?.nombre ?? 'recurso',
    tags: recurso.tagIds.map((id) => catalog.tags.find((item) => item.id === id)?.nombre).filter((item): item is string => Boolean(item)),
  }, user, access)

  const cached = getCachedExplanation(explanationFingerprint(context))
  if (cached) {
    return Response.json({ explanation: cached, cached: true, status: 'success' })
  }

  try {
    const result = await generateExplanation(context, getExplainProvider())
    return Response.json({
      explanation: result.explanation,
      cached: result.cached,
      status: result.status,
    })
  } catch (error) {
    if (error instanceof ExplainUnavailableError) {
      return Response.json(
        { error: { code: 'ai_unavailable', message: 'El resumen con IA no está configurado en este despliegue.' } },
        { status: 503 },
      )
    }
    if (error instanceof ExplainTimeoutError) {
      return Response.json(
        { error: { code: 'ai_timeout', message: 'El proveedor tardó demasiado. Volvé a intentar en un momento.' } },
        { status: 502 },
      )
    }
    if (error instanceof ExplainRequestError) {
      return Response.json(
        { error: { code: 'ai_request_failed', message: 'No se pudo generar la explicación. El recurso sigue disponible sin IA.' } },
        { status: 502 },
      )
    }
    if (error instanceof ExplainResponseError) {
      return Response.json(
        { error: { code: 'ai_invalid_response', message: 'La explicación no se pudo generar correctamente.' } },
        { status: 502 },
      )
    }
    return Response.json(
      { error: { code: 'ai_error', message: 'No se pudo generar la explicación.' } },
      { status: 500 },
    )
  }
}