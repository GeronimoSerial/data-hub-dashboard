import { cuentaPorClave } from '../cuentas-qa'
import { expect, test } from '../fixtures/base'
import {
  prepararCorteFresco,
  prepararEstadoSano,
  prepararRunDesactualizada,
  type Restaurar,
} from '../seed/escenarios-falla'

// Plan 9.4: el indicador tiene que ponerse en rojo cuando el dato está mal. Este proyecto corre después
// de todas las pruebas de lectura y de escritura. Cada escenario se restaura en afterEach.
//
// Límite: el panel "Estado de los datos" se prueba acá de punta a punta (qué texto y qué fila muestra).
// La lógica de clasificación (qué cuenta como sin_datos o fallido, cuándo degrada una fuente) tiene sus
// casos completos en clasificar.test.ts y salud-fuente.test.ts. El e2e usa las mismas funciones de
// escritura que la app (generarCorte, actualizarSaludFuente), así que prueba que el Centro lo muestra.
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

  test('control sano: todo al día con jobs y fuentes sanos, IMERG sin celdas nuevas y Prefectura duplicada', async ({ page }) => {
    restaurar = await prepararEstadoSano()

    await page.goto('/situacion')

    const panel = page.getByTestId('estado-datos')
    await expect(panel).toHaveAttribute('data-problemas', 'false')
    await expect(panel.locator('summary')).toContainText('Todos los datos al día')
  })

  test('job completado con 0 filas bajo su mínimo: Pronóstico de caudal queda Sin datos con "0 filas"', async ({ page }) => {
    restaurar = await prepararEstadoSano({ contadores: { 'sync-hazard-pronostico-caudal': { filas: 0 } } })

    await page.goto('/situacion')

    const item = page.getByTestId('estado-datos-item').filter({ hasText: 'Pronóstico de caudal' })
    await expect(item).toContainText('Sin datos')
    await expect(item).toContainText('Última corrida completada con 0 filas; se esperan al menos 1.')
    await expect(page.getByTestId('estado-datos')).toContainText('1 fuente con problemas')
  })

  test('fuente degradada por no recibir filas: open-meteo-ensemble queda con problema y el error guardado', async ({ page }) => {
    restaurar = await prepararEstadoSano({ fuentesSinFilas: ['open-meteo-ensemble'] })

    await page.goto('/situacion')

    const item = page.getByTestId('estado-datos-item').filter({ hasText: 'Fuente open-meteo-ensemble' })
    await expect(item).toContainText('Falló')
    await expect(item).toContainText('no rows received from source')
    await expect(page.getByTestId('estado-datos')).toContainText('1 fuente con problemas')
  })
})
