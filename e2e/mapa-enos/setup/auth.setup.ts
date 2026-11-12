import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { CUENTAS_QA, type CuentaQa } from '../cuentas-qa'

// Repository root: this file lives in <root>/e2e/mapa-enos/setup.
const RAIZ = path.resolve(__dirname, '..', '..', '..')

// Better Auth allows 3 requests to /sign-in/* per 10 seconds per client IP, and every account signs in from
// 127.0.0.1. A 429 therefore means the window is full, not a wrong password. The only way past it is to wait out
// the window, so this is a documented backoff: the single fixed wait in this file, used only inside the retry
// helper. Everything else waits on a network response.
const VENTANA_LIMITE_MS = 10_500
const INTENTOS_MAXIMOS = 3

async function esperarVentanaDeLimite(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, VENTANA_LIMITE_MS))
}

async function iniciarSesion(page: Page, cuenta: CuentaQa): Promise<number> {
  await page.goto('/login')
  await page.getByLabel('Correo').fill(cuenta.email)
  await page.getByLabel('Contraseña').fill(cuenta.password)
  for (let intento = 1; ; intento++) {
    const respuesta = page.waitForResponse(
      (response) => response.url().includes('/api/auth/sign-in') && response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    const status = (await respuesta).status()
    if (status !== 429 || intento === INTENTOS_MAXIMOS) return status
    await esperarVentanaDeLimite()
  }
}

// One test per account so a failure names the account. Accounts that the map denies still get a session
// (Better Auth sets the cookie on sign-in), so the state is saved here regardless of the map's access decision.
for (const cuenta of CUENTAS_QA) {
  test(`inicia sesión y guarda storageState: ${cuenta.clave}`, async ({ page }) => {
    const status = await iniciarSesion(page, cuenta)
    expect(status, `respuesta de sign-in para ${cuenta.clave}`).toBe(200)

    const estado = await page.context().storageState()
    const tieneSesion = estado.cookies.some((cookie) => /session_token/.test(cookie.name) && cookie.value.length > 0)
    expect(tieneSesion, `cookie de sesion para ${cuenta.clave}`).toBe(true)

    const ruta = path.resolve(RAIZ, cuenta.storageStatePath)
    fs.mkdirSync(path.dirname(ruta), { recursive: true })
    await page.context().storageState({ path: ruta })
  })
}
