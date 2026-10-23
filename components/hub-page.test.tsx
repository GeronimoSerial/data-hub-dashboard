// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { HubPage } from './hub-page'

const mocks = vi.hoisted(() => ({ push: vi.fn(), canAccessPath: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/components/hub-data', () => ({
  useHubData: () => ({ recursos: [], categorias: [], niveles: [{ id: 'primaria', nombre: 'Primaria' }] }),
}))
vi.mock('@/components/app-shell', () => ({ useSectionAccess: () => mocks.canAccessPath }))

afterEach(() => {
  cleanup()
  mocks.push.mockClear()
  mocks.canAccessPath.mockReset()
})

describe('HubPage section navigation', () => {
  it('hides educational-level explore chips when landing is allowed but explore is disabled', () => {
    mocks.canAccessPath.mockImplementation((path: string) => path === '/')
    render(<HubPage />)

    expect(screen.getByRole('heading', { name: 'Análisis educativo' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Primaria/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Explorar/ })).not.toBeInTheDocument()
  })
})
