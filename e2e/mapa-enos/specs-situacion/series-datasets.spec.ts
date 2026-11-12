import { cuentaPorClave } from '../cuentas-qa'
import { expect, test } from '../fixtures/base'
import type { Restaurar } from '../seed/escenarios-falla'
import { horasTranscurridasDelDiaImerg, prepararPublicacionAntigua, prepararSerieImergDeHoy } from '../seed/escenarios-series'

// Series y vigencia del Centro de Situación (I5, I11). La lógica tiene sus casos completos en
// clasificar.test.ts; acá se prueba qué fila y qué texto muestra el panel "Estado de los datos".
// Cada escenario se restaura en afterEach.
test.use({ storageState: cuentaPorClave('admin').storageStatePath })

const HORAS_MINIMAS_PARA_HUECO = 4

test.describe('Centro de Situación: series IMERG y vigencia de datasets', () => {
  let restaurar: Restaurar | undefined

  test.afterEach(async () => {
    await restaurar?.()
    restaurar = undefined
  })

  test('hueco de 3 h en la serie IMERG de hoy: la fila lo muestra con las horas de Buenos Aires', async ({ page }) => {
    test.skip(
      horasTranscurridasDelDiaImerg(new Date()) < HORAS_MINIMAS_PARA_HUECO,
      'Antes de las 04:00 de Buenos Aires el día no tiene 4 h para armar una serie con un hueco de 3 h.',
    )
    restaurar = await prepararSerieImergDeHoy(true)

    await page.goto('/situacion')

    const item = page.getByTestId('estado-datos-item').filter({ hasText: 'Huecos en la serie IMERG' })
    await expect(item).toContainText('Huecos en la serie IMERG de hoy: 3 h sin gránulos entre 01:00 y 04:00.')
    await expect(page.getByTestId('estado-datos')).toHaveAttribute('data-problemas', 'true')
  })

  test('control sano: gránulos IMERG de hoy cada 30 min no marcan huecos', async ({ page }) => {
    test.skip(
      horasTranscurridasDelDiaImerg(new Date()) < HORAS_MINIMAS_PARA_HUECO,
      'Antes de las 04:00 de Buenos Aires el día no tiene 4 h de gránulos para el control.',
    )
    restaurar = await prepararSerieImergDeHoy(false)

    await page.goto('/situacion')

    const item = page.getByTestId('estado-datos-item').filter({ hasText: 'Huecos en la serie IMERG' })
    await expect(item).toContainText('Serie IMERG de hoy sin huecos.')
    await expect(page.getByTestId('estado-datos')).not.toContainText('Huecos en la serie IMERG de hoy: ')
  })

  test('dataset departamentos publicado hace 800 días: la fila dice que pasó la vigencia de 730 días', async ({ page }) => {
    restaurar = await prepararPublicacionAntigua('departamentos', 800)

    await page.goto('/situacion')

    const item = page.getByTestId('estado-datos-item').filter({ hasText: 'Publicado hace 800 días' })
    await expect(item).toContainText('Publicado hace 800 días (vigencia esperada: 730 días).')
  })

  test('control sano: los datasets recién sembrados no muestran vigencia vencida', async ({ page }) => {
    await page.goto('/situacion')

    const panel = page.getByTestId('estado-datos')
    await expect(panel).toBeVisible()
    await expect(panel).not.toContainText('vigencia esperada')
  })
})
