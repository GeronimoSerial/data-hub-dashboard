import type { Page } from '@playwright/test'
import { cuentaPorClave } from '../cuentas-qa'
import { esperarMapaListo, expect, test } from '../fixtures/base'

test.use({ storageState: cuentaPorClave('admin').storageStatePath })

type VentanaE2E = { __mapaE2E: { zoom(): number; capasVisibles(): string[] }; __lienzoPrueba?: Element | null }

function zoomActual(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as VentanaE2E).__mapaE2E.zoom())
}

function capasVisibles(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as VentanaE2E).__mapaE2E.capasVisibles())
}

// Pestañas con su panel. `tab` es null para Metodología: no tiene botón, solo se llega por hash.
// `mapa` dice si el mapa queda visible con esa pestaña.
const CASOS_HASH = [
  { hash: '#actual', tab: 'tab-actual', panel: 'panel-situacion-actual', mapa: true },
  { hash: '#radar', tab: 'tab-radar', panel: 'panel-radar', mapa: true },
  { hash: '#planificacion', tab: 'tab-planificacion', panel: 'panel-planificacion', mapa: true },
  { hash: '#estadisticas', tab: 'tab-estadisticas', panel: 'pestana-estadisticas', mapa: false },
  { hash: '#metodologia', tab: 'tab-metodologia', panel: 'pestana-metodologia', mapa: false },
  { hash: '#exportar', tab: 'tab-exportar', panel: 'pestana-exportar', mapa: false },
] as const

for (const caso of CASOS_HASH) {
  test(`hash ${caso.hash} muestra su panel y ${caso.mapa ? 'deja visible' : 'oculta'} el mapa`, async ({ page }) => {
    await page.goto(`/mapas/infraestructura${caso.hash}`)

    await expect(page.getByTestId(caso.panel)).toBeVisible({ timeout: 30_000 })
    if (caso.tab) {
      await expect(page.getByTestId(caso.tab)).toHaveAttribute('aria-selected', 'true')
    } else {
      await expect(page.getByRole('tab', { selected: true })).toHaveCount(0)
    }
    if (caso.mapa) {
      await expect(page.getByTestId('pestana-mapa')).toBeVisible()
    } else {
      await expect(page.getByTestId('pestana-mapa')).not.toBeVisible()
    }
  })
}

test('la pestaña Situación actual cuenta 17 escuelas con situaciones abiertas', async ({ page }) => {
  await page.goto('/mapas/infraestructura#actual')

  await expect(
    page.getByRole('tab', { name: 'Situación actual, 17 escuelas con situaciones abiertas', exact: true }),
  ).toBeVisible({ timeout: 30_000 })
})

test('#operativa resuelve a Situación actual', async ({ page }) => {
  await page.goto('/mapas/infraestructura#operativa')

  await expect(page.getByTestId('tab-actual')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('panel-situacion-actual')).toBeVisible({ timeout: 30_000 })
})

test('#evolucion resuelve a Estadísticas', async ({ page }) => {
  await page.goto('/mapas/infraestructura#evolucion')

  await expect(page.getByTestId('tab-estadisticas')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('pestana-estadisticas')).toBeVisible()
})

test('?modo=radar resuelve a Radar', async ({ page }) => {
  await page.goto('/mapas/infraestructura?modo=radar')

  await expect(page.getByTestId('tab-radar')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('panel-radar')).toBeVisible({ timeout: 30_000 })
})

test('con la bandera del radar encendida, la pestaña Radar existe', async ({ page }) => {
  await page.goto('/mapas/infraestructura#actual')

  await expect(page.getByRole('tab', { name: 'Radar', exact: true })).toHaveCount(1)
})

test('el mapa queda montado al cambiar de pestaña: conserva zoom, capas y el mismo canvas', async ({ page }) => {
  await page.goto('/mapas/infraestructura#actual')
  await esperarMapaListo(page)
  await page.evaluate(() => {
    ;(window as unknown as VentanaE2E).__lienzoPrueba = document.querySelector('.maplibregl-canvas')
  })
  const zoomInicial = await zoomActual(page)

  // Acercar: MapLibre zoomIn suma exactamente 1 al zoom.
  await page.getByRole('group', { name: 'Zoom del mapa' }).getByRole('button', { name: 'Acercar' }).click()
  await expect.poll(() => zoomActual(page)).toBeCloseTo(zoomInicial + 1, 2)
  const zoomAcercado = await zoomActual(page)

  // Apagar la capa de estaciones de Prefectura, que arranca encendida.
  await expect.poll(() => capasVisibles(page)).toContain('estacionesRio')
  await page.getByTestId('tab-capas').click()
  await expect(page.getByTestId('panel-capas')).toBeVisible()
  const estaciones = page.getByRole('switch', { name: 'Estaciones de Prefectura (altura de ríos)' })
  await estaciones.click()
  await expect(estaciones).not.toBeChecked()
  await expect.poll(() => capasVisibles(page)).not.toContain('estacionesRio')

  // Ida y vuelta por otra pestaña.
  await page.getByTestId('tab-estadisticas').click()
  await expect(page.getByTestId('pestana-estadisticas')).toBeVisible()
  await expect(page.getByTestId('pestana-mapa')).not.toBeVisible()
  await page.getByTestId('tab-actual').click()
  await expect(page.getByTestId('pestana-mapa')).toBeVisible()

  await expect.poll(() => zoomActual(page)).toBeCloseTo(zoomAcercado, 2)
  expect(await capasVisibles(page)).not.toContain('estacionesRio')
  expect(await capasVisibles(page)).toContain('lluviaObservada')
  // El mismo elemento canvas: el mapa no se desmontó ni volvió a crearse.
  expect(await page.evaluate(() => document.querySelector('.maplibregl-canvas') === (window as unknown as VentanaE2E).__lienzoPrueba)).toBe(true)
})
