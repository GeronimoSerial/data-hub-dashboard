import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONFIG_INICIAL } from '@/miniapps/links/lib/config'
import { getDb, migrarDb } from '@/lib/db'
import { linktreeConfig } from '@/lib/db/schema'
import { guardarConfig } from '@/miniapps/links/lib/store'
import Page, { generateMetadata } from './page'

vi.mock('next/headers', () => ({ headers: async () => new Headers({ host: 'links.sistemas.mec.gob.ar' }) }))
vi.mock('@/lib/db/seed', () => ({ ensureSeeded: () => { throw new Error('seed prohibido') } }))
beforeAll(() => migrarDb())
beforeEach(async () => {
  await getDb().delete(linktreeConfig)
  await guardarConfig({ ...CONFIG_INICIAL, titulo: 'Sistemas públicos', enlaces: [{ id: 'e1', titulo: 'Hub de Datos', descripcion: '', url: 'https://hub.sistemas.mec.gob.ar' }] }, 'editor')
})
// Nothing here mocks the session: the page must render for an anonymous
// visitor, and reading `headers()` or cookies outside a request would throw.
describe('/links', () => {
  it('renderiza sin sesión mostrando la configuración guardada', async () => {
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('Sistemas públicos')
    expect(html).toContain('href="/cadm/admin"')
    expect(html).toContain('href="https://hub.sistemas.mec.gob.ar"')
  })

  it('usa el título configurado como título de la pestaña', async () => {
    const metadata = await generateMetadata()
    expect(metadata.metadataBase?.toString()).toBe('https://links.sistemas.mec.gob.ar/cadm')
    expect(metadata.alternates?.canonical).toBe('https://links.sistemas.mec.gob.ar/cadm')
    expect(metadata.openGraph).toMatchObject({ url: 'https://links.sistemas.mec.gob.ar/cadm' })
    expect(metadata.title).toEqual({ absolute: 'Sistemas públicos' })
  })
})

it('visita anónima vacía sin ejecutar migración ni seed', async () => {
  await getDb().delete(linktreeConfig)
  const html = renderToStaticMarkup(await Page())
  expect(html).toContain('Todavía no hay accesos publicados.')
})
