import type { Page } from '@playwright/test'
import { cuentaPorClave } from '../cuentas-qa'
import { ESCUELAS, ESPERADOS } from '../seed/esperados'
import { esperarMapaListo, expect, test } from '../fixtures/base'

test.use({ storageState: cuentaPorClave('admin').storageStatePath })

const ESCUELA_BUSCADA = ESCUELAS.find((escuela) => escuela.cueAnexo === '1800117-00')!

async function abrirEstadisticas(page: Page): Promise<void> {
  await page.goto('/mapas/infraestructura')
  await esperarMapaListo(page)
  await page.getByRole('tab', { name: 'Estadísticas' }).click()
}

/** Suma la columna "Escuelas" de la tabla de Estadísticas (agrupada por departamento). */
async function escuelasSegunEstadisticas(page: Page): Promise<number> {
  if (await page.getByText('No hay escuelas con estos filtros.').count() > 0) return 0
  const celdas = await page.locator('table.map-est__tabla tbody tr > td:nth-of-type(1)').allInnerTexts()
  return celdas.reduce((total, texto) => total + Number(texto.replace(/\D/g, '')), 0)
}

async function abrirFiltro(page: Page, clave: string): Promise<void> {
  const chip = page.getByTestId(`filtro-chip-${clave}`)
  if (await chip.count() > 0 && await chip.isVisible()) {
    await chip.click()
    return
  }
  await page.getByTestId('filtros-mas').click()
}

async function alternarOpcion(page: Page, clave: string, valor: string): Promise<void> {
  await abrirFiltro(page, clave)
  await page.getByTestId(`filtro-opcion-${clave}-${valor}`).click()
  await page.keyboard.press('Escape')
}

async function alternarInterruptor(page: Page, clave: string): Promise<void> {
  const interruptor = page.getByTestId(`filtro-interruptor-${clave}`)
  if (await interruptor.count() > 0 && await interruptor.isVisible()) {
    await interruptor.click()
    return
  }
  await page.getByTestId('filtros-mas').click()
  await page.getByTestId(`filtro-mas-switch-${clave}`).click()
  await page.keyboard.press('Escape')
}

async function centroActual(page: Page): Promise<{ lon: number; lat: number; zoom: number }> {
  return page.evaluate(() => (window as unknown as { __mapaE2E: { centro(): { lon: number; lat: number; zoom: number } } }).__mapaE2E.centro())
}

test.describe('filtros y búsqueda del mapa de infraestructura', () => {
  test.beforeEach(async ({ page }) => {
    await abrirEstadisticas(page)
    await expect.poll(() => escuelasSegunEstadisticas(page)).toBe(ESPERADOS.escuelas.conCoordenadas)
  })

  test('departamento: cada opción deja las escuelas con coordenadas del manifiesto', async ({ page }) => {
    for (const [departamento, esperado] of Object.entries(ESPERADOS.escuelas.porDepartamentoConCoordenadas)) {
      await alternarOpcion(page, 'departamentos', departamento)
      await expect.poll(() => escuelasSegunEstadisticas(page)).toBe(esperado)
      await alternarOpcion(page, 'departamentos', departamento)
      await expect.poll(() => escuelasSegunEstadisticas(page)).toBe(ESPERADOS.escuelas.conCoordenadas)
    }
  })

  test('dirección: cada nivel jurisdiccional deja sus escuelas con coordenadas', async ({ page }) => {
    for (const [nivel, esperado] of Object.entries(ESPERADOS.escuelas.porNivelConCoordenadas)) {
      await alternarOpcion(page, 'direcciones', nivel)
      await expect.poll(() => escuelasSegunEstadisticas(page)).toBe(esperado)
      await alternarOpcion(page, 'direcciones', nivel)
      await expect.poll(() => escuelasSegunEstadisticas(page)).toBe(ESPERADOS.escuelas.conCoordenadas)
    }
  })

  test('gravedad: cada nivel de gravedad del manifiesto deja sus escuelas', async ({ page }) => {
    for (const [gravedad, esperado] of Object.entries(ESPERADOS.partes.visibles.porGravedad)) {
      await alternarOpcion(page, 'gravedades', gravedad)
      await expect.poll(() => escuelasSegunEstadisticas(page)).toBe(esperado)
      await alternarOpcion(page, 'gravedades', gravedad)
      await expect.poll(() => escuelasSegunEstadisticas(page)).toBe(ESPERADOS.escuelas.conCoordenadas)
    }
  })

  test('clase: normal deja 25 escuelas y cada clase con parte deja su cantidad', async ({ page }) => {
    // Normal: 30 con coordenadas menos las 5 con clases alteradas (2 sin clases, 2 evacuado, 1 centro).
    const porClase = { normal: 25, sin: ESPERADOS.partes.visibles.porClase.sin, evacuado: ESPERADOS.partes.visibles.porClase.evacuado, centro: ESPERADOS.partes.visibles.porClase.centro }
    for (const [clase, esperado] of Object.entries(porClase)) {
      await alternarOpcion(page, 'clases', clase)
      await expect.poll(() => escuelasSegunEstadisticas(page)).toBe(esperado)
      await alternarOpcion(page, 'clases', clase)
      await expect.poll(() => escuelasSegunEstadisticas(page)).toBe(ESPERADOS.escuelas.conCoordenadas)
    }
  })

  test('clase parcial no tiene escuelas en el seed: el mapa queda vacío', async ({ page }) => {
    await alternarOpcion(page, 'clases', 'parcial')
    await expect.poll(() => escuelasSegunEstadisticas(page)).toBe(ESPERADOS.partes.visibles.porClase.parcial)
    await expect(page.getByText('No hay escuelas con estos filtros.')).toBeVisible()
  })

  test('apoyo: cada opción de asistencia pedagógica deja su cantidad del manifiesto', async ({ page }) => {
    for (const [apoyo, esperado] of Object.entries(ESPERADOS.partes.visibles.porApoyo)) {
      await alternarOpcion(page, 'apoyo', apoyo)
      await expect.poll(() => escuelasSegunEstadisticas(page)).toBe(esperado)
      await alternarOpcion(page, 'apoyo', apoyo)
      await expect.poll(() => escuelasSegunEstadisticas(page)).toBe(ESPERADOS.escuelas.conCoordenadas)
    }
  })

  test('sin actualizar deja las escuelas con parte sin actualizar del manifiesto', async ({ page }) => {
    await alternarInterruptor(page, 'sinActualizar')
    await expect.poll(() => escuelasSegunEstadisticas(page)).toBe(ESPERADOS.partes.sinActualizar.total)
    await alternarInterruptor(page, 'sinActualizar')
    await expect.poll(() => escuelasSegunEstadisticas(page)).toBe(ESPERADOS.escuelas.conCoordenadas)
  })

  test('solucionadas en los últimos 15 días deja las 2 escuelas del seed', async ({ page }) => {
    await alternarInterruptor(page, 'solucionadasRecientes')
    await expect.poll(() => escuelasSegunEstadisticas(page)).toBe(ESPERADOS.partes.solucionadasRecientes.total)
    await alternarInterruptor(page, 'solucionadasRecientes')
    await expect.poll(() => escuelasSegunEstadisticas(page)).toBe(ESPERADOS.escuelas.conCoordenadas)
  })

  test('con comedor deja las 5 escuelas con comedor de la planilla', async ({ page }) => {
    await alternarInterruptor(page, 'conComedor')
    await expect.poll(() => escuelasSegunEstadisticas(page)).toBe(ESPERADOS.comedor.total)
    await alternarInterruptor(page, 'conComedor')
    await expect.poll(() => escuelasSegunEstadisticas(page)).toBe(ESPERADOS.escuelas.conCoordenadas)
  })

  test('departamento Goya + con comedor deja 3 escuelas (intersección)', async ({ page }) => {
    // Con comedor en Goya: 1801016-00, 1800939-00 y 1801608-03.
    await alternarOpcion(page, 'departamentos', 'Goya')
    await expect.poll(() => escuelasSegunEstadisticas(page)).toBe(ESPERADOS.escuelas.porDepartamentoConCoordenadas.Goya)
    await alternarInterruptor(page, 'conComedor')
    await expect.poll(() => escuelasSegunEstadisticas(page)).toBe(3)
  })

  test('dirección Nivel 1 + departamento Capital deja 4 escuelas (intersección)', async ({ page }) => {
    await alternarOpcion(page, 'direcciones', '1')
    await alternarOpcion(page, 'departamentos', 'Capital')
    await expect.poll(() => escuelasSegunEstadisticas(page)).toBe(4)
  })

  test('sin actualizar + con comedor deja 1 escuela (1800939-00)', async ({ page }) => {
    await alternarInterruptor(page, 'sinActualizar')
    await alternarInterruptor(page, 'conComedor')
    await expect.poll(() => escuelasSegunEstadisticas(page)).toBe(1)
  })

  test('limpiar filtros vuelve al total de 30', async ({ page }) => {
    await alternarOpcion(page, 'departamentos', 'Goya')
    await alternarInterruptor(page, 'sinActualizar')
    await expect.poll(() => escuelasSegunEstadisticas(page)).toBe(1)
    await page.getByTestId('filtros-mas').click()
    await page.getByTestId('filtros-limpiar').click()
    await page.keyboard.press('Escape')
    await expect.poll(() => escuelasSegunEstadisticas(page)).toBe(ESPERADOS.escuelas.conCoordenadas)
  })

  test('buscar por nombre muestra la escuela y centra el mapa en ella', async ({ page }) => {
    await page.getByRole('tab', { name: /Situación actual/ }).click()
    await page.getByRole('button', { name: 'Buscar escuela o CUE' }).click()
    await page.getByTestId('filtros-busqueda-input').fill('HUMANISTICO')
    await expect(page.getByTestId('filtros-sugerencia')).toHaveCount(1)
    await expect(page.getByTestId('filtros-sugerencia')).toHaveAttribute('data-cue', '1800117-00')
    await page.getByTestId('filtros-sugerencia').click()
    await expect.poll(async () => {
      const centro = await centroActual(page)
      return Math.abs(centro.lat - ESCUELA_BUSCADA.lat!) < 0.0005 && Math.abs(centro.lon - ESCUELA_BUSCADA.lon!) < 0.0005 && Math.abs(centro.zoom - 14) < 0.005
    }).toBe(true)
    const centro = await centroActual(page)
    expect(centro.zoom).toBeCloseTo(14, 2)
    expect(centro.lat).toBeCloseTo(ESCUELA_BUSCADA.lat!, 3)
    expect(centro.lon).toBeCloseTo(ESCUELA_BUSCADA.lon!, 3)
  })

  test('buscar por CUE devuelve la misma escuela y centra el mapa en ella', async ({ page }) => {
    await page.getByRole('tab', { name: /Situación actual/ }).click()
    await page.getByRole('button', { name: 'Buscar escuela o CUE' }).click()
    await page.getByTestId('filtros-busqueda-input').fill('1800117-00')
    await expect(page.getByTestId('filtros-sugerencia')).toHaveCount(1)
    await expect(page.getByTestId('filtros-sugerencia')).toHaveAttribute('data-cue', '1800117-00')
    await page.getByTestId('filtros-sugerencia').click()
    await expect.poll(async () => {
      const centro = await centroActual(page)
      return Math.abs(centro.lat - ESCUELA_BUSCADA.lat!) < 0.0005 && Math.abs(centro.lon - ESCUELA_BUSCADA.lon!) < 0.0005 && Math.abs(centro.zoom - 14) < 0.005
    }).toBe(true)
    const centro = await centroActual(page)
    expect(centro.zoom).toBeCloseTo(14, 2)
  })
})
