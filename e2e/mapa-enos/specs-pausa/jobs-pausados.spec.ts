import { cuentaPorClave } from '../cuentas-qa'
import { expect, test } from '../fixtures/base'

// Plan 9.4 (I8): con ENOS_JOBS_ENABLED=false el servidor de esta prueba tiene los jobs en pausa.
// Los jobs pausados cuentan como problema: el resumen no dice "Todos los datos al día".
test.use({ storageState: cuentaPorClave('admin').storageStatePath })

test.describe('Estado de los datos con jobs en pausa operativa', () => {
  test('jobs apagados: el resumen no dice Todos los datos al día y los jobs figuran como Pausado', async ({ page }) => {
    await page.goto('/situacion')

    const panel = page.getByTestId('estado-datos')
    await expect(panel.locator('summary')).not.toContainText('Todos los datos al día')
    await expect(panel.getByText('Pausado', { exact: true }).first()).toBeVisible()
  })
})
