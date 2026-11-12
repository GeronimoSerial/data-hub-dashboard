import type { Page } from '@playwright/test'
import { cuentaPorClave } from '../cuentas-qa'
import { esperarMapaListo, expect, test } from '../fixtures/base'

test.use({ storageState: cuentaPorClave('admin').storageStatePath })

// Cuenta sus colores distintos en el navegador: el PNG se decodifica con <img> y se
// lee con un canvas 2D, sin dependencias nuevas ni acceso al canvas de WebGL.
async function coloresDistintos(page: Page, png: Buffer): Promise<number> {
  return page.evaluate(async (base64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${base64}`
    await img.decode()
    const lienzo = document.createElement('canvas')
    lienzo.width = img.naturalWidth
    lienzo.height = img.naturalHeight
    const ctx = lienzo.getContext('2d')
    if (!ctx) throw new Error('Sin contexto 2D')
    ctx.drawImage(img, 0, 0)
    const datos = ctx.getImageData(0, 0, lienzo.width, lienzo.height).data
    const colores = new Set<number>()
    for (let i = 0; i < datos.length; i += 4) {
      colores.add(((datos[i] << 24) | (datos[i + 1] << 16) | (datos[i + 2] << 8) | datos[i + 3]) >>> 0)
    }
    return colores.size
  }, png.toString('base64'))
}

test('humo: el mapa dibuja sin salir del origen y expone el gancho E2E', async ({ page, externasBloqueadas, estiloLocal }) => {
  await page.goto('/mapas/infraestructura')
  await esperarMapaListo(page)

  // Indicativo, no prueba: el screenshot del elemento incluye los paneles superpuestos (título,
  // leyenda), así que puede contar colores ajenos al mapa. La prueba real de dibujo es el conteo
  // de features de abajo. Se reintenta porque el dibujo llega después del primer frame.
  const canvas = page.locator('.maplibregl-canvas')
  await expect
    .poll(async () => coloresDistintos(page, await canvas.screenshot()), { timeout: 30_000 })
    .toBeGreaterThan(1)

  // Prueba real de dibujo: la capa de límites tiene que renderizar los 4 departamentos del seed.
  // El gancho cuenta features únicas: queryRenderedFeatures devuelve copias recortadas por tesela de
  // los departamentos que cruzan un borde de tesela, con las mismas propiedades; sin deduplicar daría 5.
  // Una capa oculta da 0 y un seed incompleto da otro número.
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { __mapaE2E: { featuresRenderizadas(capa: string): number } })
          .__mapaE2E.featuresRenderizadas('limitesDepartamentos'),
      ),
    )
    .toBe(4)

  // CA2: fuera del origen solo hubo peticiones del mapa, atendidas en local.
  expect(externasBloqueadas).toEqual([])
  expect(estiloLocal.some((url) => url.startsWith('https://tiles.openfreemap.org/styles/'))).toBe(true)

  // CA4a: el gancho existe con sus tres métodos en el build de prueba.
  const gancho = await page.evaluate(() => {
    const g = (window as unknown as { __mapaE2E?: Record<string, unknown> }).__mapaE2E
    if (!g) return null
    return {
      tipo: typeof g,
      capasVisibles: typeof g.capasVisibles,
      featuresRenderizadas: typeof g.featuresRenderizadas,
      proyectar: typeof g.proyectar,
    }
  })
  expect(gancho).toEqual({
    tipo: 'object',
    capasVisibles: 'function',
    featuresRenderizadas: 'function',
    proyectar: 'function',
  })
})
