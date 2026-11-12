import { cuentaPorClave } from '../cuentas-qa'
import { expect, test } from '../fixtures/base'

test.use({ storageState: cuentaPorClave('admin').storageStatePath })

// CA5: con el radar apagado, #radar no abre una pestaña inexistente: queda la actual.
// La prueba mira la pestaña seleccionada (role=tab, aria-selected). El panel activo no
// tiene data-testid propio; falta el de B3a.1.
test('radar apagado: #radar muestra la pestaña Situación actual', async ({ page }) => {
  await page.goto('/mapas/infraestructura#radar')

  await expect(page.getByRole('tab', { name: /^Situación actual/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tab', { name: 'Radar' })).toHaveCount(0)
})
