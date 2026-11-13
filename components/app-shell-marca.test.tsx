// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { AppShell } from './app-shell'
import { RegionProvider } from '@/lib/infraestructura/region/region-provider'
import { regionPublica, cargarRegion, type RegionConfig } from '@/lib/infraestructura/region'

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
  },
}))

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

function renderConRegion(region: RegionConfig) {
  return render(
    <RegionProvider region={regionPublica(region)} marca={region.marca}>
      <AppShell initialUser={null}>Contenido</AppShell>
    </RegionProvider>,
  )
}

const firma = () => document.querySelector('.app-signature')
const pie = () => document.querySelector('.app-footer > span:first-child')

describe('AppShell marca de la region', () => {
  it('Corrientes muestra la firma y los textos actuales', () => {
    renderConRegion(cargarRegion('corrientes'))

    expect(firma()?.textContent).toContain('Dirección de Sistemas de Información')
    expect(firma()?.textContent).toContain('Dirección de Gestión Escolar')
    expect(firma()?.textContent).toContain('Provincia de Corrientes')
    expect(firma()?.textContent).toContain('República Argentina')
    expect(pie()?.textContent).toBe('Ministerio de EducaciónProvincia de Corrientes')
    expect(firma()?.querySelector('img[src="/marca/logo-educacion-h.svg"]')).toBeInTheDocument()
    expect(firma()?.querySelector('img[src="/marca/escudo.svg"]')).toBeInTheDocument()
  })

  it('Manaos muestra la marca neutra ENOS y ningun logo de Corrientes', () => {
    renderConRegion(cargarRegion('manaos'))

    expect(firma()?.textContent).toContain('ENOS')
    expect(firma()?.textContent).toContain('Amazonas')
    expect(firma()?.textContent).not.toContain('Corrientes')
    expect(pie()?.textContent).toBe('ENOS')
    expect(pie()?.textContent).not.toContain('Corrientes')
    expect(firma()?.querySelector('img')).toBeNull()
  })
})
