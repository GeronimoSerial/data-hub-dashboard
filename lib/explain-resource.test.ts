import { describe, expect, it, beforeEach } from 'vitest'
import {
  buildExplainContext,
  clearExplanationCache,
  explanationFingerprint,
  generateExplanation,
  hasEnoughContext,
  insufficientContextExplanation,
} from './explain-resource'
import { ExplainUnavailableError, type ExplainProvider } from './explain-provider'
import type { Recurso } from './model'

const resource: Recurso = {
  id: 'r1',
  titulo: 'Mapa',
  descripcion: 'Muestra establecimientos.',
  formato: 'mapa',
  nivelId: 'transversal',
  tipoId: 'georref',
  categoriaId: 'matricula',
  tagIds: [],
  area: 'Área',
  actualizado: '2026-08-01',
  estado: 'publicado',
}

const labels = {
  format: 'Mapa',
  topic: 'Matrícula',
  level: 'Transversal',
  type: 'Georreferencial',
  tags: [],
}

const publicAccess = {
  estado: 'publicado' as const,
  audienciaNivelIds: [],
  audienciaUserIds: [],
}

const restrictedAccess = {
  estado: 'publicado' as const,
  audienciaNivelIds: ['secundario'],
  audienciaUserIds: [],
}

function stubProvider(
  overrides: Partial<ExplainProvider> = {},
): ExplainProvider {
  return {
    name: 'stub',
    available: true,
    async explain() {
      return {
        summary: 'Resumen',
        usefulFor: ['Consultar Matrícula.'],
        firstLook: 'Mirá el período.',
      }
    },
    ...overrides,
  }
}

describe('resource explanations', () => {
  beforeEach(() => clearExplanationCache())

  it('builds safe metadata context and a stable scoped fingerprint', () => {
    const context = buildExplainContext(resource, labels, null, publicAccess)
    expect(context.authorized).toBe(false)
    expect(explanationFingerprint(context)).toBe(explanationFingerprint(context))
    expect(explanationFingerprint({ ...context, authorized: true })).not.toBe(
      explanationFingerprint(context),
    )
  })

  it('marks restricted resources as authorized only for allowed users', () => {
    const anonymous = buildExplainContext(resource, labels, null, restrictedAccess)
    const editor = buildExplainContext(
      resource,
      labels,
      { id: 'u1', role: 'editor', banned: false, nivelIds: [] },
      restrictedAccess,
    )
    expect(anonymous.authorized).toBe(false)
    expect(editor.authorized).toBe(true)
  })

  it('does not invent when there is not enough published context', () => {
    expect(hasEnoughContext({ description: '   ' })).toBe(false)
    const explanation = insufficientContextExplanation()
    expect(explanation.summary).toContain('No hay suficiente contexto')
  })

  it('returns the honest refusal without calling the provider when context is insufficient', async () => {
    let called = false
    const context = buildExplainContext(
      { ...resource, descripcion: '  ' },
      labels,
      null,
      publicAccess,
    )
    const result = await generateExplanation(context, {
      available: true,
      name: 'stub',
      async explain() {
        called = true
        return { summary: 'x', usefulFor: [], firstLook: null }
      },
    })
    expect(called).toBe(false)
    expect(result.status).toBe('insufficient-context')
    expect(result.explanation.summary).toContain('No hay suficiente contexto')
    expect(result.cached).toBe(false)
  })

  it('caches a hit and invalidates on metadata change', async () => {
    const provider = stubProvider()
    const a = buildExplainContext(resource, labels, null, publicAccess)
    const first = await generateExplanation(a, provider)
    expect(first.cached).toBe(false)
    expect(first.status).toBe('success')
    const second = await generateExplanation(a, provider)
    expect(second.cached).toBe(true)
    expect(second.status).toBe('success')

    const changed = buildExplainContext(
      { ...resource, descripcion: 'Texto distinto.' },
      labels,
      null,
      publicAccess,
    )
    const refreshed = await generateExplanation(changed, provider)
    expect(refreshed.cached).toBe(false)
  })

  it('keeps authorized and anonymous caches isolated', async () => {
    let calls = 0
    const provider = stubProvider({
      async explain() {
        calls += 1
        return { summary: `S${calls}`, usefulFor: [], firstLook: null }
      },
    })
    const anonymous = buildExplainContext(resource, labels, null, publicAccess)
    const authorized = buildExplainContext(
      resource,
      labels,
      { id: 'u1', role: 'consulta', banned: false, nivelIds: [] },
      publicAccess,
    )
    const first = await generateExplanation(anonymous, provider)
    const second = await generateExplanation(authorized, provider)
    expect(first.cached).toBe(false)
    expect(second.cached).toBe(false)
    expect(calls).toBe(2)
  })

  it('surfaces an unavailable provider instead of faking a response', async () => {
    const context = buildExplainContext(resource, labels, null, publicAccess)
    await expect(
      generateExplanation(context, { name: 'unavailable', available: false, async explain() { return { summary: '', usefulFor: [], firstLook: null } } }),
    ).rejects.toBeInstanceOf(ExplainUnavailableError)
  })

  it('validates provider output before caching or returning', async () => {
    const context = buildExplainContext(resource, labels, null, publicAccess)
    const provider = stubProvider({
      async explain() {
        return {
          summary: 'x',
          usefulFor: ['a'],
          firstLook: null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any
      },
    })
    clearExplanationCache()
    const ok = await generateExplanation(context, provider)
    expect(ok.explanation.summary).toBe('x')

    clearExplanationCache()
    const bad = stubProvider({
      async explain() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { summary: '', usefulFor: [], firstLook: null } as any
      },
    })
    await expect(generateExplanation(context, bad)).rejects.toThrow()
  })
})