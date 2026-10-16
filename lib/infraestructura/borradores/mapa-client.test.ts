import { describe, expect, it, vi } from 'vitest'
import { fetchDraftCounts, fetchDraftPage } from './mapa-client'

describe('map draft read client', () => {
  it('loads grouped totals with one global aggregated request', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [{ cue: '1801605-60', count: 3 }] }) })

    await expect(fetchDraftCounts(fetcher)).resolves.toEqual([{ cue: '1801605-60', count: 3 }])
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledWith('/api/infraestructura/borradores/conteos')
  })

  it('uses the per-school keyset endpoint only for a requested detail page', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [], nextCursor: null }) })

    await fetchDraftPage('1801605-60', null, fetcher)

    expect(fetcher).toHaveBeenCalledWith('/api/infraestructura/borradores/1801605-60?limit=20')
  })
})
