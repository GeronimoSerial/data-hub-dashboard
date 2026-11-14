import type { Page } from '@playwright/test'
import { cuentaPorClave } from '../cuentas-qa'
import { esperarMapaListo, expect, test } from '../fixtures/base'

// Plan 5.5: popup (vista previa) de una escuela, navegación a la ficha y secciones de la ficha.
// Valores literales tomados del seed (seed/escuelas.ts, seed/partes.ts, seed/esperados.ts).

test.use({ storageState: cuentaPorClave('admin').storageStatePath })

// Escuela del operador (CUE_ANEXO_OPERADOR): con coordenadas, parte vigente "Inundación" de gravedad Media.
const CUE_CON_PARTE = '1800554-00'
const NOMBRE_CON_PARTE = 'ESCUELA NORMAL "DR.JUAN GREGORIO PUJOL"'
const MOTIVO_CON_PARTE = 'Inundación'

// Escuela con coordenadas sin parte visible (solucionada hace 3 días, fuera de la ruta de situaciones abiertas).
const CUE_SIN_SITUACIONES = '1801644-00'
const NOMBRE_SIN_SITUACIONES = 'ESCUELA TECNICA "CARMEN M. DE LLANO"'

// Escuela del roster sin coordenadas: la ficha se muestra, el mapa no la puede señalar.
const CUE_SIN_UBICACION = '1801176-01'

// Escuela con parte vigente y marcada "sin actualizar" (4 escuelas en el seed).
const CUE_SIN_ACTUALIZAR = '1801477-00'

// Coordenadas del roster (seed/escuelas.ts) de CUE_CON_PARTE.
const COORD_CON_PARTE = { lat: -27.4714939, lon: -58.836627 }

async function abrirMapa(page: Page): Promise<void> {
  await page.goto('/mapas/infraestructura')
  await esperarMapaListo(page)
}

async function centroActual(page: Page): Promise<{ lon: number; lat: number; zoom: number }> {
  return page.evaluate(() => (window as unknown as { __mapaE2E: { centro(): { lon: number; lat: number; zoom: number } } }).__mapaE2E.centro())
}

async function seleccionarPorBusqueda(page: Page, texto: string, cue: string): Promise<void> {
  await page.getByRole('tab', { name: /Situación actual/ }).click()
  await page.getByRole('button', { name: 'Buscar escuela o CUE' }).click()
  await page.getByTestId('filtros-busqueda-input').fill(texto)
  await expect(page.getByTestId('filtros-sugerencia')).toHaveCount(1)
  await expect(page.getByTestId('filtros-sugerencia')).toHaveAttribute('data-cue', cue)
  await page.getByTestId('filtros-sugerencia').click()
}

test.describe('popup de escuela (vista previa)', () => {
  test.beforeEach(async ({ page }) => {
    await abrirMapa(page)
  })

  test(`buscar ${CUE_CON_PARTE} abre el popup con nombre "${NOMBRE_CON_PARTE}" y CUE ${CUE_CON_PARTE}`, async ({ page }) => {
    await seleccionarPorBusqueda(page, CUE_CON_PARTE, CUE_CON_PARTE)
    await expect(page.getByTestId('vista-previa-escuela')).toBeVisible()
    await expect(page.getByTestId('preview-nombre')).toHaveText(NOMBRE_CON_PARTE)
    await expect(page.getByTestId('preview-cue')).toContainText(`CUE ${CUE_CON_PARTE}`)
    await expect(page.getByTestId('preview-bloque-situacion')).toContainText(MOTIVO_CON_PARTE)
    await expect(page.getByTestId('preview-bloque-situacion')).toContainText('Gravedad Media')
    await expect(page.getByTestId('chip-vigente')).toBeVisible()
    await expect(page.getByTestId('chip-sin-actualizar')).toHaveCount(0)
  })

  test('cerrar el popup lo quita de la pantalla', async ({ page }) => {
    await seleccionarPorBusqueda(page, CUE_CON_PARTE, CUE_CON_PARTE)
    await expect(page.getByTestId('vista-previa-escuela')).toBeVisible()
    await page.getByTestId('cerrar-preview').click()
    await expect(page.getByTestId('vista-previa-escuela')).toHaveCount(0)
  })

  test(`${CUE_SIN_SITUACIONES} sin situaciones abiertas muestra "Sin situaciones abiertas reportadas"`, async ({ page }) => {
    await seleccionarPorBusqueda(page, CUE_SIN_SITUACIONES, CUE_SIN_SITUACIONES)
    await expect(page.getByTestId('preview-nombre')).toHaveText(NOMBRE_SIN_SITUACIONES)
    await expect(page.getByTestId('preview-sin-situaciones')).toHaveText('Sin situaciones abiertas reportadas')
  })

  test(`${CUE_SIN_ACTUALIZAR} sin actualizar muestra el chip "sin actualizar" y no el "vigente"`, async ({ page }) => {
    await seleccionarPorBusqueda(page, CUE_SIN_ACTUALIZAR, CUE_SIN_ACTUALIZAR)
    await expect(page.getByTestId('vista-previa-escuela')).toBeVisible()
    await expect(page.getByTestId('chip-sin-actualizar')).toBeVisible()
    await expect(page.getByTestId('chip-vigente')).toHaveCount(0)
  })

  test(`"Abrir ficha completa" lleva a la ficha de ${CUE_CON_PARTE}`, async ({ page }) => {
    await seleccionarPorBusqueda(page, CUE_CON_PARTE, CUE_CON_PARTE)
    await page.getByTestId('abrir-ficha-completa').click()
    await expect(page).toHaveURL(new RegExp(`/mapas/infraestructura/escuelas/${CUE_CON_PARTE}(\\?.*)?$`))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(NOMBRE_CON_PARTE)
  })
})

test.describe('ficha de escuela', () => {
  test(`la ficha de ${CUE_CON_PARTE} muestra nombre, situación vigente y secciones`, async ({ page }) => {
    await page.goto(`/mapas/infraestructura/escuelas/${CUE_CON_PARTE}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(NOMBRE_CON_PARTE)
    await expect(page.locator('#panorama')).toBeVisible()
    await expect(page.locator('#situaciones').getByTestId('ficha-incidente').locator('h2')).toHaveText(MOTIVO_CON_PARTE)
    await expect(page.getByTestId('ficha-chip-vigente')).toBeVisible()
    await expect(page.getByTestId('ficha-chip-sin-actualizar')).toHaveCount(0)
    await expect(page.locator('#territorio')).toBeVisible()
  })

  test(`la ficha de ${CUE_SIN_SITUACIONES} muestra "Sin situaciones abiertas reportadas"`, async ({ page }) => {
    await page.goto(`/mapas/infraestructura/escuelas/${CUE_SIN_SITUACIONES}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(NOMBRE_SIN_SITUACIONES)
    await expect(page.getByTestId('ficha-sin-situaciones')).toHaveText('Sin situaciones abiertas reportadas')
  })

  test(`la ficha de ${CUE_SIN_UBICACION} (sin coordenadas) muestra el aviso de sin ubicación`, async ({ page }) => {
    await page.goto(`/mapas/infraestructura/escuelas/${CUE_SIN_UBICACION}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('INSTITUTO SUPERIOR "CARMEN MOLINA DE LLANO" (ANEXO)')
    await expect(page.getByTestId('ficha-sin-ubicacion')).toBeVisible()
  })

  test(`"volver al mapa" desde la ficha de ${CUE_CON_PARTE} regresa al mapa`, async ({ page }) => {
    await page.goto(`/mapas/infraestructura/escuelas/${CUE_CON_PARTE}`)
    await page.getByTestId('volver-al-mapa').click()
    await expect(page).toHaveURL(/\/mapas\/infraestructura/)
    await expect(page.getByTestId('volver-al-mapa')).toHaveCount(0)
    await esperarMapaListo(page)
    await expect.poll(async () => {
      const centro = await centroActual(page)
      return Math.abs(centro.lat - COORD_CON_PARTE.lat) < 0.0005 && Math.abs(centro.lon - COORD_CON_PARTE.lon) < 0.0005 && Math.abs(centro.zoom - 14) < 0.005
    }).toBe(true)
    const centro = await centroActual(page)
    expect(centro.lat).toBeCloseTo(COORD_CON_PARTE.lat, 3)
    expect(centro.lon).toBeCloseTo(COORD_CON_PARTE.lon, 3)
    expect(centro.zoom).toBeCloseTo(14, 2)
  })
})
