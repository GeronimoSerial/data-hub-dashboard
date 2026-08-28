import { z } from 'zod'
import type { Recurso } from '@/lib/model'
import type { SessionUser } from '@/lib/acl'
import { puedeAbrir, type RecursoAccess } from '@/lib/acl'
import type { ExplainProvider } from '@/lib/explain-provider'

export const explanationSchema = z.object({
  summary: z.string().trim().min(1).max(600),
  usefulFor: z.array(z.string().trim().min(1).max(180)).max(3),
  firstLook: z.string().trim().min(1).max(240).nullable(),
})

export type ResourceExplanation = z.infer<typeof explanationSchema>

export type ExplainContext = {
  id: string
  title: string
  description: string
  format: string
  topic: string
  level: string
  type: string
  tags: string[]
  authorized: boolean
}

/**
 * Builds the allowed context for an explanation. Only catalog metadata is ever
 * included; whether the current session may open the resource is carried as a
 * boolean so restricted content can never leave the server.
 */
export function buildExplainContext(
  recurso: Recurso,
  labels: { format: string; topic: string; level: string; type: string; tags: string[] },
  user: SessionUser | null,
  access: RecursoAccess,
): ExplainContext {
  return {
    id: recurso.id,
    title: recurso.titulo,
    description: recurso.descripcion,
    format: labels.format,
    topic: labels.topic,
    level: labels.level,
    type: labels.type,
    // Tags are editorial catalog metadata and are safe for the public explanation.
    tags: labels.tags,
    authorized: puedeAbrir(user, access),
  }
}

/** Whether the published metadata is enough to produce a trustworthy explanation. */
export function hasEnoughContext(context: Pick<ExplainContext, 'description'>) {
  return context.description.trim().length > 0
}

/** Canned, honest refusal when the catalog alone cannot support an explanation. */
export function insufficientContextExplanation(): ResourceExplanation {
  return {
    summary:
      'No hay suficiente contexto publicado para generar una explicación confiable.',
    usefulFor: [],
    firstLook: null,
  }
}

export function explanationFingerprint(context: ExplainContext) {
  const payload = JSON.stringify({
    id: context.id,
    title: context.title,
    description: context.description,
    format: context.format,
    topic: context.topic,
    level: context.level,
    type: context.type,
    tags: context.tags,
    // Keep authorized and unauthorized caches isolated even when their metadata matches.
    audience: context.authorized ? 'authorized' : 'catalog',
  })
  let hash = 2166136261
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `${context.id}:${(hash >>> 0).toString(16)}`
}

const cache = new Map<string, ResourceExplanation>()

export function getCachedExplanation(key: string) {
  return cache.get(key)
}

export function setCachedExplanation(key: string, value: ResourceExplanation) {
  cache.set(key, explanationSchema.parse(value))
}

export function clearExplanationCache() {
  cache.clear()
}

/**
 * Orchestrates a single explanation request: refuses insufficient context,
 * short-circuits on a cached fingerprint, then validates the provider output.
 * An unavailable provider surfaces the configured error instead of faking a
 * model response. `status` distinguishes a successful explanation from an
 * explicit "insufficient published context" refusal so callers never render
 * the canned response as a model-generated success.
 */
export type GenerateExplanationResult = {
  explanation: ResourceExplanation
  cached: boolean
  status: 'success' | 'insufficient-context'
}

export async function generateExplanation(
  context: ExplainContext,
  provider: ExplainProvider,
): Promise<GenerateExplanationResult> {
  if (!hasEnoughContext(context)) {
    return {
      explanation: insufficientContextExplanation(),
      cached: false,
      status: 'insufficient-context',
    }
  }
  if (!provider.available) {
    const { ExplainUnavailableError } = await import('@/lib/explain-provider')
    throw new ExplainUnavailableError()
  }
  const key = explanationFingerprint(context)
  const cached = getCachedExplanation(key)
  if (cached) return { explanation: cached, cached: true, status: 'success' }
  const explanation = await provider.explain(context)
  const validated = explanationSchema.parse(explanation)
  setCachedExplanation(key, validated)
  return { explanation: validated, cached: false, status: 'success' }
}