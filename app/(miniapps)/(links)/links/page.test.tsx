import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CONFIG_INICIAL } from '@/miniapps/links/lib/config'
import { guardarConfig } from '@/miniapps/links/lib/store'
import Page, { generateMetadata } from './page'

// Nothing here mocks the session: the page must render for an anonymous
// visitor, and reading `headers()` or cookies outside a request would throw.
describe('/links', () => {
  it('renderiza sin sesión mostrando la configuración guardada', async () => {
    await guardarConfig({
      ...CONFIG_INICIAL,
      titulo: 'Sistemas públicos',
      enlaces: [{ id: 'e1', titulo: 'Hub de Datos', descripcion: '', url: 'https://hub.sistemas.mec.gob.ar' }],
    })
    const html = renderToStaticMarkup(await Page())
    expect(html).toContain('Sistemas públicos')
    expect(html).toContain('href="https://hub.sistemas.mec.gob.ar"')
  })

  it('usa el título configurado como título de la pestaña', async () => {
    const metadata = await generateMetadata()
    expect(metadata.title).toEqual({ absolute: 'Sistemas públicos' })
  })
})
