import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ guard: vi.fn() }))

vi.mock('@/lib/hub-entry-server', () => ({ requireServerHubPageAccess: mocks.guard }))
vi.mock('@/components/explore-page', () => ({ ExplorePage: (props: { forcedFormato: string }) => props }))

import Mapas from './mapas/page'
import Tableros from './tableros/page'

describe('section catalog pages', () => {
  it.each([
    { Page: Mapas, path: '/mapas', formato: 'mapa' },
    { Page: Tableros, path: '/tableros', formato: 'tablero' },
  ])('renders the existing catalog forced to $formato without redirecting', async ({ Page, path, formato }) => {
    const result = await Page()
    expect(mocks.guard).toHaveBeenCalledWith(path)
    expect(result.type).toBe((await import('react')).Suspense)
    expect(result.props.children.props.forcedFormato).toBe(formato)
  })
})
