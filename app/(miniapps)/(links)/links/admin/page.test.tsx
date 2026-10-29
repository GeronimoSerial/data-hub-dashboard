import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { esAdmin } from '@/miniapps/links/lib/admin'
import Page from './page'

vi.mock('@/miniapps/links/lib/admin', () => ({ esAdmin: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

beforeEach(() => {
  vi.mocked(esAdmin).mockReset()
  vi.stubEnv('LINKS_ADMIN_USER', 'editor')
  vi.stubEnv('LINKS_ADMIN_PASSWORD', 'clave-larga-123')
  vi.stubEnv('LINKS_SESSION_SECRET', 'x'.repeat(40))
})
afterEach(() => vi.unstubAllEnvs())

describe('/links/admin', () => {
  it('sin credenciales configuradas avisa que la administración no está habilitada', async () => {
    vi.stubEnv('LINKS_ADMIN_PASSWORD', '')
    expect(renderToStaticMarkup(await Page())).toContain('La administración no está habilitada')
  })

  it('sin sesión muestra el formulario de ingreso, no el contenido', async () => {
    vi.mocked(esAdmin).mockResolvedValue(false)
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('Contraseña')
    expect(html).not.toContain('Guardar cambios')
  })

  it('con sesión muestra el editor', async () => {
    vi.mocked(esAdmin).mockResolvedValue(true)
    expect(renderToStaticMarkup(await Page())).toContain('Guardar cambios')
  })
})
