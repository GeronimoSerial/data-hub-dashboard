import { cuentaPorClave } from '../cuentas-qa'
import { expect, test } from '../fixtures/base'
import { prepararEstadoSano, type Restaurar } from '../seed/escenarios-falla'

// Plan 9.4 / I2 en la página de operación: la columna "Filas" muestra las filas recibidas de la última
// corrida completada (el contador declarado del job), y una fila bajo su mínimo queda resaltada.
// Cada escenario parte del seed sano y se restaura en afterEach.
test.use({ storageState: cuentaPorClave('admin').storageStatePath })

// Columnas de la tabla de jobs: tipo, estado, intento, Filas (índice 3).
const COLUMNA_FILAS = 3

test.describe('Operación: columna Filas', () => {
  let restaurar: Restaurar | undefined

  test.afterEach(async () => {
    await restaurar?.()
    restaurar = undefined
  })

  test('job completado con 0 filas: la celda Filas muestra 0 y la fila queda resaltada', async ({ page }) => {
    restaurar = await prepararEstadoSano({ contadores: { 'sync-hazard-pronostico-caudal': { filas: 0 } } })

    await page.goto('/admin/operacion')

    const fila = page.locator('tr').filter({ hasText: 'sync-hazard-pronostico-caudal' })
    await expect(fila.locator('td').nth(COLUMNA_FILAS)).toHaveText('0')
    await expect(fila.locator('td').first()).toHaveClass(/is-danger/)
  })

  test('Prefectura con lecturas duplicadas: Filas muestra las 3 recibidas y la fila no se resalta', async ({ page }) => {
    restaurar = await prepararEstadoSano()

    await page.goto('/admin/operacion')

    const fila = page.locator('tr').filter({ hasText: 'sync-prefectura-alturas' })
    await expect(fila.locator('td').nth(COLUMNA_FILAS)).toHaveText('3')
    await expect(fila.locator('td').first()).not.toHaveClass(/is-danger/)
  })
})
