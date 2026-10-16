// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useDraftCounts } from './use-draft-counts'

function Count({ cue }: { cue: string }) {
  const { counts } = useDraftCounts()
  return <span>{counts.get(cue) ?? 0}</span>
}

afterEach(() => vi.unstubAllGlobals())

describe('useDraftCounts', () => {
  it('shares one grouped request across map consumers', async () => {
    const fetchMock = vi.fn(async (url: string) => url.includes('/config')
      ? Response.json({ mapaBorradores: true })
      : {
          ok: true,
          json: async () => ({ items: [{ cue: '1801605-60', count: 2 }, { cue: '1801605-61', count: 4 }] }),
        })
    vi.stubGlobal('fetch', fetchMock)
    render(<><Count cue="1801605-60" /><Count cue="1801605-61" /></>)

    expect(await screen.findByText('2')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock).toHaveBeenCalledWith('/api/infraestructura/borradores/conteos')
  })
})
