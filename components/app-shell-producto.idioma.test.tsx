// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { AppShell } from './app-shell'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/app/providers', () => ({ useThemeMode: () => ({ mode: 'light', setMode: vi.fn() }) }))
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ isPending: true, data: null }),
    signOut: vi.fn(),
    signIn: { email: vi.fn() },
  },
}))
vi.mock('@/components/marca', () => ({ MarcaBanda: () => null, MarcaCompacta: () => null, MarcaHorizontal: () => null, MarcaHorizontalInversa: () => null }))

afterEach(() => cleanup())

function titulo(idioma: 'es' | 'pt'): string | null | undefined {
  const { container } = render(
    <IdiomaProvider idioma={idioma}>
      <AppShell initialUser={null}>Contenido</AppShell>
    </IdiomaProvider>,
  )
  return container.querySelector('.app-brand__text')?.textContent
}

describe('AppShell · título del producto', () => {
  it('mantiene "Hub de Datos" en español', () => {
    expect(titulo('es')).toBe('Hub de Datos')
  })

  it('muestra "Hub de Dados" en portugués', () => {
    expect(titulo('pt')).toBe('Hub de Dados')
  })
})
