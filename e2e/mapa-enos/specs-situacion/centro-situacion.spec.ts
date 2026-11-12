import { cuentaPorClave } from '../cuentas-qa'
import { expect, test } from '../fixtures/base'
import { prepararCorteFresco, prepararRunDesactualizada, type Restaurar } from '../seed/escenarios-falla'

// Plan 9.4: el indicador tiene que ponerse en rojo cuando el dato está mal. Este proyecto corre después
// de todas las pruebas de lectura y de escritura. Cada escenario se restaura en afterEach.
test.use({ storageState: cuentaPorClave('admin').storageStatePath })

test.describe('Centro de Situación: indicadores se ponen en rojo', () => {
  let restaurar: Restaurar | undefined

  test.afterEach(async () => {
    await restaurar?.()
    restaurar = undefined
  })

  test('control sano: corte nuevo sobre una corrida de hoy no marca Desactualizado', async ({ page }) => {
    restaurar = await prepararCorteFresco()

    await page.goto('/situacion')

    const encabezado = page.locator('.situacion-page__generado')
    await expect(encabezado).toContainText('Corte generado el ')
    await expect(encabezado).not.toContainText('Desactualizado')
    await expect(encabezado).not.toContainText('No verificable')
  })

  test('corrida de riesgo de hace 7 días con corte nuevo: el encabezado dice Desactualizado', async ({ page }) => {
    restaurar = await prepararRunDesactualizada(7)

    await page.goto('/situacion')

    await expect(page.locator('.situacion-page__generado')).toHaveText(/^Corte generado el .+ — Desactualizado$/)
  })
})
