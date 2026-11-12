import fs from 'node:fs'
import path from 'node:path'
import type { Browser, Cookie, Page } from '@playwright/test'

// Better Auth allows 3 sign-in requests per 10 s per client IP, so a 429 means the window is full.
const VENTANA_LIMITE_MS = 10_500
const INTENTOS_MAXIMOS = 3

// Admin credentials come from the image's first-admin bootstrap (ADMIN_EMAIL / ADMIN_PASSWORD in run.mjs).
function credenciales(): { email: string; password: string } {
  const email = process.env.REGION_PROOF_ADMIN_EMAIL
  const password = process.env.REGION_PROOF_ADMIN_PASSWORD
  if (!email || !password) throw new Error('REGION_PROOF_ADMIN_EMAIL and REGION_PROOF_ADMIN_PASSWORD are required')
  return { email, password }
}

// Signs in once through the real login form and returns the session cookies.
// Each test opens its own context with these cookies, so the sign-in rate limit is hit at most once per project.
export async function cookiesDeSesion(browser: Browser, baseURL: string): Promise<Cookie[]> {
  const { email, password } = credenciales()
  const context = await browser.newContext({ baseURL })
  try {
    const page = await context.newPage()
    await page.goto('/login')
    await page.getByLabel('Correo').fill(email)
    await page.getByLabel('Contraseña').fill(password)
    for (let intento = 1; ; intento++) {
      const respuesta = page.waitForResponse(
        (response) => response.url().includes('/api/auth/sign-in') && response.request().method() === 'POST',
      )
      await page.getByRole('button', { name: 'Iniciar sesión' }).click()
      const status = (await respuesta).status()
      if (status === 200) break
      if (status !== 429 || intento === INTENTOS_MAXIMOS) throw new Error(`sign-in returned ${status}`)
      await new Promise((resolve) => setTimeout(resolve, VENTANA_LIMITE_MS))
    }
    return await context.cookies()
  } finally {
    await context.close()
  }
}

export async function conPagina(
  browser: Browser,
  baseURL: string,
  cookies: Cookie[],
  usar: (page: Page) => Promise<void>,
): Promise<void> {
  const context = await browser.newContext({ baseURL })
  try {
    await context.addCookies(cookies)
    await usar(await context.newPage())
  } finally {
    await context.close()
  }
}

export async function captura(page: Page, nombre: string): Promise<void> {
  const dir = process.env.REGION_PROOF_SHOTS
  if (!dir) throw new Error('REGION_PROOF_SHOTS is required')
  fs.mkdirSync(dir, { recursive: true })
  await page.screenshot({ path: path.join(dir, `${nombre}.png`), fullPage: true })
}
