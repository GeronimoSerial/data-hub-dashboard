import { describe, expect, it, vi } from 'vitest'
import { createReconnectCoordinator, validateSavedContext, type ContextoReconexion } from './reconexion'

const context: ContextoReconexion = {
  draftId: 'draft-1',
  cue: '1234567-89',
  escuela: { cue: '1234567-89', nombre: 'Old school' },
}

describe('offline reconnect', () => {
  it('reports a changed school while still flushing drafts and triggering submissions', async () => {
    const flushDrafts = vi.fn(async (_excludedDraftIds: string[]) => [])
    const triggerSubmissions = vi.fn(async () => true)
    const reconnect = createReconnectCoordinator({
      fetch: vi.fn(async () => Response.json({ escuela: { cueAnexo: context.cue, nombre: 'New school' } })),
      flushDrafts,
      triggerSubmissions,
    })

    const result = await reconnect([context])

    expect(result.contextConflicts).toEqual([expect.objectContaining({
      draftId: context.draftId,
      reason: 'school_changed',
      localSchool: 'Old school',
      serverSchool: 'New school',
    })])
    expect(result.draftSync).toEqual([])
    expect(result.submissionSyncRequested).toBe(true)
    expect(flushDrafts).toHaveBeenCalledWith([context.draftId])
    expect(triggerSubmissions).toHaveBeenCalledOnce()
  })

  it('detects a CUE that no longer resolves and preserves the pending record', async () => {
    const fetcher = vi.fn(async () => Response.json({ error: 'Not found' }, { status: 404 }))

    await expect(validateSavedContext(context, fetcher)).resolves.toMatchObject({
      draftId: context.draftId,
      cue: context.cue,
      reason: 'school_missing',
    })
    expect(fetcher).toHaveBeenCalledWith(
      `/api/problematicas/contexto?cue=${encodeURIComponent(context.cue)}`,
      { cache: 'no-store' },
    )
  })

  it('does not report transient server failures as stale context', async () => {
    await expect(validateSavedContext(context, async () => Response.json({}, { status: 503 }))).resolves.toBeNull()
  })
})
