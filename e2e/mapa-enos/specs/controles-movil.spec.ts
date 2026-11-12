import type { Page } from '@playwright/test'
import { cuentaPorClave } from '../cuentas-qa'
import { ESCUELAS } from '../seed/escuelas'
import { esperarMapaListo, expect, test } from '../fixtures/base'

test.use({ storageState: cuentaPorClave('admin').storageStatePath })

type VentanaE2E = { __mapaE2E: { zoom(): number } }

const CUE_OPERADOR = '1800554-00'
const ESCUELA_OPERADOR = ESCUELAS.find((escuela) => escuela.cueAnexo === CUE_OPERADOR)!

function zoomActual(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as VentanaE2E).__mapaE2E.zoom())
}

type ElementoFueraDelViewport = {
  tag: string
  id: string
  clase: string
  rect: { left: number; right: number; top: number; width: number }
}

// Recorre los elementos visibles y devuelve los que se salen del viewport sin estar dentro de un
// contenedor con scroll horizontal propio (overflow-x auto/scroll) ni dentro del canvas de MapLibre.
// scrollWidth del documento no basta: un hijo dentro de un ancestro overflow:hidden queda recortado
// y el documento no lo ve, aunque sí desborde.
function elementosFueraDelViewport(page: Page): Promise<ElementoFueraDelViewport[]> {
  return page.evaluate(() => {
    const ancho = window.innerWidth
    const dentroDeScroller = (el: Element) => {
      if (el.closest('.maplibregl-map, .maplibregl-canvas-container')) return true
      for (let padre = el.parentElement; padre && padre !== document.body; padre = padre.parentElement) {
        const overflowX = getComputedStyle(padre).overflowX
        if (overflowX === 'auto' || overflowX === 'scroll') return true
      }
      return false
    }
    const fuera: ElementoFueraDelViewport[] = []
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      if (el.getClientRects().length === 0) continue
      const r = el.getBoundingClientRect()
      if (r.right <= ancho + 1 && r.left >= -1) continue
      if (dentroDeScroller(el)) continue
      fuera.push({
        tag: el.tagName.toLowerCase(),
        id: el.getAttribute('data-testid') ?? el.id,
        clase: (el.getAttribute('class') ?? '').slice(0, 120),
        rect: { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), width: Math.round(r.width) },
      })
    }
    return fuera
  })
}

async function expectSinDesbordeHorizontal(page: Page, zona: string) {
  const medidas = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(medidas.scrollWidth, `${zona}: scrollWidth del documento supera innerWidth`).toBeLessThanOrEqual(medidas.innerWidth)
  const fuera = await elementosFueraDelViewport(page)
  expect(fuera, `${zona}: elementos fuera del viewport sin scroller propio: ${JSON.stringify(fuera)}`).toEqual([])
}

// Este archivo corre en los dos proyectos: escritorio (chromium) y móvil (iPhone 13).
// Cada bloque se omite en el proyecto que no le corresponde.
test.describe('controles del mapa en escritorio', () => {
  test.skip(({ isMobile }) => isMobile, 'bloque de escritorio')

  test('Acercar y Alejar cambian el zoom exactamente en 1', async ({ page }) => {
    await page.goto('/mapas/infraestructura#actual')
    await esperarMapaListo(page)
    const grupo = page.getByRole('group', { name: 'Zoom del mapa' })
    const zoomInicial = await zoomActual(page)

    await grupo.getByRole('button', { name: 'Acercar' }).click()
    await expect.poll(() => zoomActual(page)).toBeCloseTo(zoomInicial + 1, 2)

    await grupo.getByRole('button', { name: 'Alejar' }).click()
    await expect.poll(() => zoomActual(page)).toBeCloseTo(zoomInicial, 2)

    await grupo.getByRole('button', { name: 'Alejar' }).click()
    await expect.poll(() => zoomActual(page)).toBeCloseTo(zoomInicial - 1, 2)
  })

  test('Pantalla completa entra y sale del modo de pantalla completa', async ({ page }) => {
    await page.goto('/mapas/infraestructura#actual')
    await esperarMapaListo(page)
    const boton = page.getByRole('button', { name: 'Pantalla completa', exact: true })
    const enPantallaCompleta = () => page.evaluate(() => document.fullscreenElement !== null)

    expect(await enPantallaCompleta()).toBe(false)
    await boton.click()
    await expect.poll(enPantallaCompleta).toBe(true)
    await expect(page.getByRole('button', { name: 'Salir de pantalla completa', exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Salir de pantalla completa', exact: true }).click()
    await expect.poll(enPantallaCompleta).toBe(false)
    await expect(boton).toBeVisible()
  })

  test('cambiar el mapa base pide el estilo de la base elegida', async ({ page, estiloLocal }) => {
    await page.goto('/mapas/infraestructura#actual')
    await esperarMapaListo(page)
    await page.getByTestId('tab-capas').click()
    await expect(page.getByTestId('panel-capas')).toBeVisible()

    // La base inicial es "Mapa vial alternativo" (voyager, /styles/bright).
    const radioVial = page.getByRole('radio', { name: 'Mapa vial alternativo' })
    const radioRutas = page.getByRole('radio', { name: 'Rutas y caminos' })
    await expect(radioVial).toBeChecked()
    await expect.poll(() => estiloLocal.some((url) => url.includes('/styles/bright'))).toBe(true)
    expect(estiloLocal.some((url) => url.includes('/styles/liberty'))).toBe(false)

    await radioRutas.click()
    await expect(radioRutas).toBeChecked()
    await expect.poll(() => estiloLocal.some((url) => url.includes('/styles/liberty'))).toBe(true)
  })
})

test.describe('vista móvil (iPhone 13)', () => {
  test.skip(({ isMobile }) => !isMobile, 'bloque móvil')

  test('el mapa monta y cada pestaña llega a la pantalla al desplazar la barra', async ({ page }) => {
    await page.goto('/mapas/infraestructura#actual')
    await esperarMapaListo(page)

    // La barra de pestañas puede desbordar el ancho: cada pestaña debe poder traerse a la vista.
    for (const pestana of ['tab-actual', 'tab-radar', 'tab-capas']) {
      const tab = page.getByTestId(pestana)
      await tab.scrollIntoViewIfNeeded()
      const caja = await tab.boundingBox()
      expect(caja, `${pestana} tiene caja`).not.toBeNull()
      expect(caja!.x).toBeGreaterThanOrEqual(0)
      expect(caja!.x + caja!.width).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth))
    }

    await page.getByTestId('tab-capas').click()
    await expect(page.getByTestId('panel-capas')).toBeVisible()
    await page.getByTestId('tab-actual').click()
    await expect(page.getByTestId('pestana-mapa')).toBeVisible()
  })

  test('flujo: buscar por CUE, vista previa con el nombre, ficha completa y volver al mapa', async ({ page }) => {
    await page.goto('/mapas/infraestructura#actual')
    await esperarMapaListo(page)

    await page.getByRole('button', { name: 'Buscar escuela o CUE' }).first().click()
    await page.getByTestId('filtros-busqueda-input').fill(CUE_OPERADOR)
    await expect(page.getByTestId('filtros-sugerencia')).toHaveAttribute('data-cue', CUE_OPERADOR)
    await page.getByTestId('filtros-sugerencia').click()

    await expect(page.getByTestId('vista-previa-escuela')).toBeVisible()
    await expect(page.getByTestId('preview-nombre')).toHaveText(ESCUELA_OPERADOR.nombre)

    await page.getByTestId('abrir-ficha-completa').click()
    await expect(page.getByTestId('volver-al-mapa')).toBeVisible({ timeout: 30_000 })
    await expect(page).toHaveURL(new RegExp(CUE_OPERADOR))

    await page.getByTestId('volver-al-mapa').click()
    await expect(page.getByTestId('pestana-mapa')).toBeVisible({ timeout: 30_000 })
    await esperarMapaListo(page)
  })

  test('la barra de pestañas es un scroller horizontal intencional', async ({ page }) => {
    await page.goto('/mapas/infraestructura#actual')
    await esperarMapaListo(page)

    // La barra desborda 390px a propósito: .ui-tabs-list tiene overflow-x auto (map-header.module.css),
    // así que su contenido queda dentro de ese scroller y el escáner de desborde lo excluye.
    const tablist = page.getByRole('tablist', { name: 'Modos y vistas de ENOS 2026' })
    const estado = await tablist.evaluate((el) => ({
      overflowX: getComputedStyle(el).overflowX,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }))
    expect(['auto', 'scroll'], `overflow-x del tablist: ${estado.overflowX}`).toContain(estado.overflowX)
    expect(estado.scrollWidth, 'el tablist tiene contenido que se desplaza').toBeGreaterThan(estado.clientWidth)

    const caja = await tablist.boundingBox()
    expect(caja, 'tablist tiene caja').not.toBeNull()
    expect(caja!.x + caja!.width).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth))
  })

  test('sin desborde horizontal en el mapa y en el panel de capas', async ({ page }) => {
    await page.goto('/mapas/infraestructura#actual')
    await esperarMapaListo(page)
    await expectSinDesbordeHorizontal(page, 'mapa')

    await page.getByTestId('tab-capas').click()
    await expect(page.getByTestId('panel-capas')).toBeVisible()
    await expectSinDesbordeHorizontal(page, 'panel de capas')
  })
})
