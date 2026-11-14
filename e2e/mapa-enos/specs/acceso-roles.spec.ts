import { cuentaPorClave } from '../cuentas-qa'
import { esperarMapaListo, expect, test } from '../fixtures/base'
import { ESPERADOS } from '../seed/esperados'

// Plan 5.1: alcance por rol, enlace nominal y acceso anónimo. Las landings por cuenta ya están en
// storage-state-acceso.spec.ts; acá se afirma lo que hay dentro del mapa y de la ficha.

const RUTA_MAPA = '/mapas/infraestructura'
const RUTA_API_ESCUELAS = '/api/mapas/infraestructura/escuelas'
// Escuela del seed con parte vigente y una afectación (sembrarParteVigente en seed/partes.ts).
const CUE_CON_AFECTACION = '1800554-00'

// Ventana del límite de sign-in (3 por 10 s por IP): mismo backoff documentado que setup/auth.setup.ts.
const VENTANA_LIMITE_MS = 10_500
const INTENTOS_MAXIMOS = 3

async function esperarVentanaDeLimite(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, VENTANA_LIMITE_MS))
}

const FILAS_TABLA_ESTADISTICAS = '[data-testid="map-est-tabla"] tbody tr'

// Suma la columna "Escuelas" de la tabla de estadísticas (agrupada por departamento).
async function escuelasEnEstadisticas(page: import('@playwright/test').Page): Promise<number> {
  return page.locator(FILAS_TABLA_ESTADISTICAS).evaluateAll((filas) =>
    filas.reduce((total, fila) => {
      const celda = fila.querySelector('td')
      return total + Number((celda?.textContent ?? '0').replace(/\D/g, ''))
    }, 0),
  )
}

test.describe('director_nivel: alcance del mapa', () => {
  test.use({ storageState: cuentaPorClave('director-nivel').storageStatePath })

  test(`la tabla de estadísticas cuenta ${ESPERADOS.alcanceDirectorNivel.escuelas} escuelas (solo su nivel)`, async ({ page }) => {
    // La pestaña de estadísticas oculta el canvas del mapa, así que no se usa esperarMapaListo.
    await page.goto(`${RUTA_MAPA}#estadisticas`)
    await expect(page.getByTestId('map-est-tabla')).toBeVisible()
    await expect.poll(() => escuelasEnEstadisticas(page)).toBe(ESPERADOS.alcanceDirectorNivel.escuelas)
  })
})

test.describe('admin: alcance del mapa y enlace nominal', () => {
  test.use({ storageState: cuentaPorClave('admin').storageStatePath })

  test(`la tabla de estadísticas cuenta ${ESPERADOS.escuelas.conCoordenadas} escuelas con coordenadas (las que el mapa presenta)`, async ({ page }) => {
    // La pestaña de estadísticas oculta el canvas del mapa, así que no se usa esperarMapaListo.
    await page.goto(`${RUTA_MAPA}#estadisticas`)
    await expect(page.getByTestId('map-est-tabla')).toBeVisible()
    await expect.poll(() => escuelasEnEstadisticas(page)).toBe(ESPERADOS.escuelas.conCoordenadas)
  })

  test('la ficha de una escuela con afectación muestra el enlace "Ver alumnos alcanzados"', async ({ page }) => {
    await page.goto(`${RUTA_MAPA}/escuelas/${CUE_CON_AFECTACION}`)
    await expect(page.getByText('Panorama', { exact: true }).first()).toBeVisible()
    await expect(page.locator('[data-testid^="ver-alumnos-"]')).toHaveCount(1)
  })
})

test.describe('consulta sin nominal: enlace ausente', () => {
  test.use({ storageState: cuentaPorClave('consulta-infra').storageStatePath })

  test('la ficha de la misma escuela no muestra "Ver alumnos alcanzados"', async ({ page }) => {
    await page.goto(`${RUTA_MAPA}/escuelas/${CUE_CON_AFECTACION}`)
    await expect(page).toHaveURL(new RegExp(`/mapas/infraestructura/escuelas/${CUE_CON_AFECTACION}$`))
    await expect(page.getByText('Panorama', { exact: true }).first()).toBeVisible()
    // Control positivo: la afectación se ve en la sección de situaciones; el enlace falta por el permiso nominal.
    await expect(page.getByTestId('ficha-incidente').getByText('Alcanzados por la situación')).toBeVisible()
    await expect(page.locator('[data-testid^="ver-alumnos-"]')).toHaveCount(0)
  })
})

test.describe('operador: API de escuelas denegada', () => {
  test.use({ storageState: cuentaPorClave('operador').storageStatePath })

  test(`${RUTA_API_ESCUELAS} responde 403 al operador`, async ({ request }) => {
    const respuesta = await request.get(RUTA_API_ESCUELAS)
    expect(respuesta.status()).toBe(403)
  })
})

test.describe('anónimo: redirección al login y vuelta al mapa', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('el mapa redirige a /login con callbackUrl y tras iniciar sesión vuelve al mapa', async ({ page }) => {
    await page.goto(RUTA_MAPA)
    const enLogin = new URL(page.url())
    expect(enLogin.pathname).toBe('/login')
    expect(new URL(enLogin.searchParams.get('callbackUrl') ?? '', 'http://localhost').pathname).toBe(RUTA_MAPA)

    const cuenta = cuentaPorClave('admin')
    await page.getByLabel('Correo').fill(cuenta.email)
    await page.getByLabel('Contraseña').fill(cuenta.password)
    // Mismo reintento que setup/auth.setup.ts: Better Auth limita /sign-in a 3 por 10 s por IP.
    for (let intento = 1; ; intento++) {
      const respuesta = page.waitForResponse(
        (response) => response.url().includes('/api/auth/sign-in') && response.request().method() === 'POST',
      )
      await page.getByRole('button', { name: 'Iniciar sesión' }).click()
      const status = (await respuesta).status()
      if (status !== 429) {
        expect(status, 'respuesta de sign-in del admin').toBe(200)
        break
      }
      expect(intento, 'intentos de sign-in agotados por límite de tasa').toBeLessThan(INTENTOS_MAXIMOS)
      await esperarVentanaDeLimite()
    }

    await expect(page).toHaveURL((url) => url.pathname === RUTA_MAPA)
    await esperarMapaListo(page)
  })
})
