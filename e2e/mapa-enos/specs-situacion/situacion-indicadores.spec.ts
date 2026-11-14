import { cuentaPorClave } from '../cuentas-qa'
import { expect, test } from '../contratos/base'
import { type Restaurar, prepararCorteFresco } from '../seed/escenarios-falla'
import {
  prepararCoberturaVigente,
  prepararFuenteDegradada,
  prepararSinRunVigente,
} from '../seed/escenarios-situacion'

// Indicadores del Centro de Situación en rojo cuando el dato está mal (plan 9.4, I6, I7 e I9).
// Cada escenario se restaura en afterEach. Los controles usan el seed tal como queda y comprueban
// que la app no muestra la falla cuando no existe.
test.use({ storageState: cuentaPorClave('admin').storageStatePath })

const KPI_RIESGO_ALTO = 'Escuelas con riesgo alto o muy alto (24 h)'
const KPI_FUENTES = 'Fuentes vencidas'

test.describe('Centro de Situación: indicadores de cobertura, fuentes y corrida', () => {
  let restaurar: Restaurar | undefined

  test.afterEach(async () => {
    await restaurar?.()
    restaurar = undefined
  })

  test('Cobertura 20%: con 1 de 5 escuelas con evidencia el KPI de riesgo alto lo muestra', async ({ page }) => {
    restaurar = await prepararCoberturaVigente(5, 1)

    await page.goto('/situacion')

    await expect(page.getByTestId(`situacion-kpi-${KPI_RIESGO_ALTO}`)).toContainText('Cobertura 20%')
  })

  test('control Cobertura sembrada: la corrida del seed muestra Cobertura 100%', async ({ page }) => {
    restaurar = await prepararCorteFresco()

    await page.goto('/situacion')

    await expect(page.getByTestId(`situacion-kpi-${KPI_RIESGO_ALTO}`)).toContainText('Cobertura 100%')
  })

  test('Fuentes vencidas: una fuente degradada dentro de su TTL suma 1 y el panel de estado la marca', async ({ page }) => {
    restaurar = await prepararFuenteDegradada('open-meteo-ensemble')

    await page.goto('/situacion')

    await expect(page.getByTestId(`situacion-kpi-${KPI_FUENTES}`).locator('.situacion-kpi__valor')).toHaveText('1')
    const panel = page.getByTestId('estado-datos')
    await expect(panel).toHaveAttribute('data-problemas', 'true')
    await expect(panel.getByTestId('estado-datos-item').filter({ hasText: 'Fuente open-meteo-ensemble' })).toContainText('Falló')
  })

  test('sin corrida de riesgo vigente: las prioridades dicen Sin cálculo de riesgo disponible', async ({ page, apiAdmin }) => {
    restaurar = await prepararSinRunVigente()

    await page.goto('/situacion')

    await expect(page.getByText('Sin cálculo de riesgo disponible')).toBeVisible()
    await expect(page.getByText('Sin escuelas en riesgo alto')).toHaveCount(0)

    const respuesta = await apiAdmin.get('/api/infraestructura/situacion')
    expect(respuesta.status()).toBe(200)
    expect(((await respuesta.json()) as { sinRun: boolean }).sinRun).toBe(true)
  })

  test('control con corrida vigente: la API informa sinRun false, no hay falta de corrida', async ({ apiAdmin }) => {
    const respuesta = await apiAdmin.get('/api/infraestructura/situacion')
    expect(respuesta.status()).toBe(200)
    expect(((await respuesta.json()) as { sinRun: boolean }).sinRun).toBe(false)
  })
})
