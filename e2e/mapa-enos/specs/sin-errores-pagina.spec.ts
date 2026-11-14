import { cuentaPorClave } from '../cuentas-qa'
import { esperarMapaListo, expect, test } from '../fixtures/base'

test.use({ storageState: cuentaPorClave('admin').storageStatePath, viewport: { width: 1440, height: 900 } })

// QA de staging (13/11) registró 3 pageerror 'Cannot read properties of undefined (reading '0')': maplibre
// lanzaba al dibujar la capa de cursos de agua con un line-dasharray dependiente de la feature. El estilo
// local incluye una capa `waterway` con una línea, así que ese dibujo ocurre acá también.
test('el mapa de infraestructura no lanza errores de página al cargar', async ({ page, externasBloqueadas, estiloLocal }) => {
  const errores: string[] = []
  page.on('pageerror', (error) => errores.push(error.message))

  await page.goto('/mapas/infraestructura')
  await esperarMapaListo(page)
  // La tesela de agua se pide y se dibuja después del primer frame.
  await expect.poll(() => estiloLocal.some((url) => url.includes('/e2e-agua/')), { timeout: 30_000 }).toBe(true)
  await page.waitForTimeout(3_000)

  expect(errores).toEqual([])
})
