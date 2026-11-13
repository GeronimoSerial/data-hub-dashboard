// @vitest-environment jsdom
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { AdminShell } from './admin-shell'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'
import { __reiniciarIdiomaClienteParaPruebas } from '@/lib/i18n/idioma-cliente'
import type { Idioma } from '@/lib/i18n'

// Next's Link prefetches by default; the mock exposes the prop so the test can
// check that the audit entry opts out without touching the other links.
vi.mock('next/link', () => ({
  default: ({ href, prefetch, children, ...resto }: { href: string; prefetch?: boolean; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} data-prefetch={prefetch === undefined ? 'default' : String(prefetch)} {...resto}>{children}</a>
  ),
}))
vi.mock('next/navigation', () => ({ usePathname: () => '/admin/operacion' }))

const politica = { enabledSections: ['infrastructure'] as const, landing: true }
const flags = { riskEngineEnabled: false, episodiosDerivadosEnabled: false }

function renderShell(role: 'admin' | 'editor' | 'consulta', idioma: Idioma = 'es') {
  return render(
    <IdiomaProvider idioma={idioma}>
      <AdminShell role={role} hubPolicy={politica} flags={flags}>
        <div>Contenido</div>
      </AdminShell>
    </IdiomaProvider>,
  )
}

afterEach(() => {
  cleanup()
  __reiniciarIdiomaClienteParaPruebas()
})

describe('AdminShell: entrada de auditoría', () => {
  it('muestra "Auditoría" solo al admin, dentro de Operación, sin prefetch', () => {
    renderShell('admin')
    const enlace = screen.getByRole('link', { name: 'Auditoría' })
    expect(enlace).toHaveAttribute('href', '/admin/auditoria')
    expect(enlace).toHaveAttribute('data-prefetch', 'false')
    expect(enlace.closest('.admin-sidebar__section')).toHaveTextContent('Operación')
    expect(screen.getByRole('link', { name: 'Salud' })).toHaveAttribute('data-prefetch', 'default')
  })

  it('queda después de Salud para no alterar el orden de los demás ítems', () => {
    renderShell('admin')
    const enlaces = screen.getAllByRole('link').map((a) => a.textContent?.trim())
    expect(enlaces.indexOf('Auditoría')).toBeGreaterThan(enlaces.indexOf('Salud'))
  })

  it.each(['editor', 'consulta'] as const)('no aparece para el rol %s', (role) => {
    renderShell(role)
    expect(screen.queryByRole('link', { name: 'Auditoría' })).not.toBeInTheDocument()
  })

  it('se muestra como "Auditoria" con el idioma portugués', () => {
    renderShell('admin', 'pt')
    expect(screen.getByRole('link', { name: 'Auditoria' })).toHaveAttribute('href', '/admin/auditoria')
  })
})
