import { cuentaPorClave } from '../cuentas-qa'
import { expect, test } from '../fixtures/base'
import {
  type EscenarioPlausibilidad,
  prepararLecturasSanas,
  prepararSensorTrabado,
  prepararValorAtipico,
} from '../seed/escenarios-plausibilidad'

// I4 (plausibilidad de lecturas): el panel "Estado de los datos" muestra la fila "Plausibilidad de lecturas"
// con el aviso de sensor trabado o de valor atípico, y el texto sano cuando no hay ninguno. Cada escenario
// se restaura en afterEach.
test.use({ storageState: cuentaPorClave('admin').storageStatePath })

test.describe('Centro de Situación: plausibilidad de lecturas', () => {
  let escenario: EscenarioPlausibilidad | undefined

  test.afterEach(async () => {
    await escenario?.restaurar()
    escenario = undefined
  })

  test('doce lecturas idénticas seguidas: la fila dice que el sensor puede estar trabado', async ({ page }) => {
    escenario = await prepararSensorTrabado()

    await page.goto('/situacion')

    const item = page.getByTestId('estado-datos-item').filter({ hasText: 'Plausibilidad de lecturas' })
    await expect(item).toContainText('Sin datos')
    await expect(item).toContainText(`Posible sensor trabado en ${escenario.estacion}: 12 lecturas idénticas.`)
    await expect(page.getByTestId('estado-datos')).toHaveAttribute('data-problemas', 'true')
  })

  test('última lectura fuera del rango de 365 días: la fila dice que el valor es atípico', async ({ page }) => {
    escenario = await prepararValorAtipico()

    await page.goto('/situacion')

    const item = page.getByTestId('estado-datos-item').filter({ hasText: 'Plausibilidad de lecturas' })
    await expect(item).toContainText('Sin datos')
    await expect(item).toContainText(`${escenario.estacion}: valor atípico 6.8 m, fuera de 1–6.5 m de los últimos 365 días.`)
  })

  test('control sano: lecturas variadas y sin rango de 365 días: la fila dice que no hay lecturas trabadas', async ({
    page,
  }) => {
    escenario = await prepararLecturasSanas()

    await page.goto('/situacion')

    const item = page.getByTestId('estado-datos-item').filter({ hasText: 'Plausibilidad de lecturas' })
    await expect(item).toContainText('Sin lecturas trabadas')
    await expect(item).not.toContainText('trabado')
    await expect(item).not.toContainText('atípico')
  })
})
