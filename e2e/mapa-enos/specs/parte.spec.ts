import path from 'node:path'
import { expect, test } from '../contratos/base'
import { cuentaPorClave } from '../cuentas-qa'
import { CUE_ANEXO_OPERADOR, ESCUELAS } from '../seed/esperados'

// Raíz del repositorio: este archivo vive en <raiz>/e2e/mapa-enos/specs.
const RAIZ = path.resolve(__dirname, '..', '..', '..')

// Plan 5.6: lectura del recorrido de actualización del parte del operador. Las pruebas que escriben
// el parte viven en specs-escritura/ y corren después de todas las de lectura.

const RUTA_ACTUALIZAR = `/problematicas/parte/actualizar?cue=${CUE_ANEXO_OPERADOR}`
const MOTIVO_OPERADOR = 'Inundación'
const GRAVEDAD_SEMBRADA = 'Media'
const NOMBRE_ESCUELA_OPERADOR = ESCUELAS.find((escuela) => escuela.cueAnexo === CUE_ANEXO_OPERADOR)?.nombre ?? ''

test.describe('parte del operador', () => {
  test.use({ storageState: path.resolve(RAIZ, cuentaPorClave('operador').storageStatePath) })

  test(`el recorrido de actualización carga la escuela y su ${MOTIVO_OPERADOR} en gravedad ${GRAVEDAD_SEMBRADA}`, async ({ page }) => {
    await page.goto(RUTA_ACTUALIZAR)

    await expect(page.getByText(NOMBRE_ESCUELA_OPERADOR, { exact: true })).toBeVisible()
    const situacion = page.getByRole('region', { name: 'Situación principal' })
    await expect(situacion.locator('.entrada-actualizar__motivo')).toContainText(MOTIVO_OPERADOR)
    await expect(situacion.locator('.entrada-actualizar__motivo')).toContainText(GRAVEDAD_SEMBRADA)
    await expect(page.getByRole('button', { name: 'Actualizar el parte' })).toBeVisible()
  })

  test('continuar sin indicar cómo sigue la situación muestra el error y no envía el parte', async ({ page }) => {
    const envios: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/problematicas/parte') && request.method() === 'POST') envios.push(request.url())
    })

    await page.goto(RUTA_ACTUALIZAR)
    await page.getByRole('button', { name: 'Actualizar el parte' }).click()
    await page.getByRole('button', { name: 'Continuar', exact: true }).click()

    await expect(page.locator('#revisar-situacion-error')).toHaveText('Indique cómo sigue esta situación.')
    await expect(page.getByRole('radio', { name: 'Cambió' })).not.toBeChecked()
    expect(envios).toHaveLength(0)
  })
})
