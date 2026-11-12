import { test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

// Visual review captures. Never fails for a missing element: every step is logged and skipped.
const fixture: { headCue: string; recipientCue: string; criticalCues: string[] } =
  JSON.parse(readFileSync(path.join(__dirname, '.results/fixture-state.json'), 'utf8'))

const outDir = process.env.T8_SCREENS_DIR ?? ''
const missing: string[] = []
const VIEWPORTS = [{ width: 1280, height: 800 }, { width: 390, height: 844 }]

type Capability = 'planning' | 'cabecera' | 'supervisor' | 'admin'

async function login(page: Page, who: Capability) {
  const email = `t8-fixture-${who}@example.test`
  const password = process.env[`T8_${who.toUpperCase()}_PASSWORD`]
  if (!password) throw new Error(`Missing isolated credential for ${who}`)
  await page.goto('/login?callbackUrl=%2Fcuadernillos')
  await page.getByLabel('Correo').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const responsePromise = page.waitForResponse((response) => response.url().includes('/api/auth/sign-in') && response.request().method() === 'POST', { timeout: 15_000 }).catch(() => null)
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    const response = await responsePromise
    if (!response || response.status() !== 429) break
    await page.waitForTimeout(10_500)
  }
  await page.waitForURL(/\/cuadernillos(?:\?|$)/, { timeout: 15_000 })
}

async function dismissUnderDevelopment(page: Page) {
  const dialog = page.getByRole('dialog').filter({ hasText: /en desarrollo/i }).first()
  if (!(await dialog.isVisible().catch(() => false))) return
  const close = dialog.getByRole('button', { name: /entendido|cerrar|aceptar|continuar/i }).first()
  if (await close.isVisible().catch(() => false)) await close.click()
  else await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached', timeout: 3_000 }).catch(() => undefined)
}

async function step(label: string, action: () => Promise<unknown>) {
  try {
    await action()
  } catch (error) {
    const reason = error instanceof Error ? error.message.split('\n')[0] : String(error)
    missing.push(`${label}: ${reason}`)
    console.log(`[screens] skipped ${label}: ${reason}`)
  }
}

async function shot(page: Page, name: string, width: number) {
  await step(`screenshot ${name}`, async () => {
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
    await page.screenshot({ path: path.join(outDir, `${name}-${width}.png`), fullPage: true })
  })
}

async function openContext(browser: Browser, width: number, height: number): Promise<BrowserContext> {
  return browser.newContext({ viewport: { width, height } })
}

for (const { width, height } of VIEWPORTS) {
  test(`visual captures at ${width}x${height} @screens`, async ({ browser }) => {
    test.setTimeout(240_000)
    missing.length = 0
    mkdirSync(outDir, { recursive: true })

    // Cabecera: initial, CUE search with results, school selected with quantities.
    {
      const context = await openContext(browser, width, height)
      const page = await context.newPage()
      await login(page, 'cabecera')
      await dismissUnderDevelopment(page)
      await shot(page, 'cabecera-initial', width)
      await step('cabecera search by CUE', async () => {
        await page.getByPlaceholder('Ej. 180123').fill(fixture.criticalCues[0])
        await page.getByRole('button', { name: 'Buscar escuela' }).click()
        await page.getByRole('button', { name: new RegExp(`Elegir .*CUE ${fixture.criticalCues[0]}`) }).waitFor({ timeout: 10_000 })
      })
      await shot(page, 'cabecera-search', width)
      await step('cabecera select school and quantities', async () => {
        await page.getByRole('button', { name: new RegExp(`Elegir .*CUE ${fixture.criticalCues[0]}`) }).click()
        await page.getByLabel(/Cantidad · Cuadernillo de prueba/).first().fill('3')
      })
      await shot(page, 'cabecera-selected', width)
      await context.close()
    }

    // Supervisor: inbox list, detail panel, approve confirmation open (not confirmed).
    {
      const context = await openContext(browser, width, height)
      const page = await context.newPage()
      await login(page, 'supervisor')
      await dismissUnderDevelopment(page)
      // Campaign buttons render only when several campaigns are active; a single campaign is selected by the server.
      await step('supervisor select campaign', async () => {
        const campaign = page.getByRole('button', { name: /Campaña de prueba aislada/ })
        if (await campaign.isVisible().catch(() => false)) await campaign.click()
      })
      await shot(page, 'supervisor-list', width)
      // Each inbox row is a whole-row button whose accessible name carries the dashed CUE (1801234-00).
      await step('supervisor open detail', async () => {
        await page.getByRole('button', { name: /CUE \d{7}-\d{2}/ }).first().click()
      })
      await shot(page, 'supervisor-detail', width)
      await step('supervisor open approve confirmation', async () => {
        await page.getByRole('button', { name: 'Aprobar' }).click()
        await page.getByRole('button', { name: 'Confirmar aprobación' }).waitFor({ timeout: 5_000 })
      })
      await shot(page, 'supervisor-approve-confirm', width)
      await context.close()
    }

    // Planning home.
    {
      const context = await openContext(browser, width, height)
      const page = await context.newPage()
      await login(page, 'planning')
      await dismissUnderDevelopment(page)
      await shot(page, 'planning-home', width)
      await context.close()
    }

    // Admin: configuration, then "Ver como" active.
    {
      const context = await openContext(browser, width, height)
      const page = await context.newPage()
      await login(page, 'admin')
      await dismissUnderDevelopment(page)
      await step('admin open configuration', async () => {
        await page.getByRole('button', { name: 'Configuración' }).first().click()
      })
      await shot(page, 'admin-configuration', width)
      await step('admin open Ver como', async () => {
        await page.getByRole('button', { name: 'Ver como' }).first().click()
        await page.getByPlaceholder('Nombre o correo').fill('t8-fixture-cabecera')
      })
      // View-as candidates are links, not buttons.
      await step('admin pick cabecera account', async () => {
        await page.getByRole('link', { name: /t8-fixture-cabecera|Fixture cabecera/ }).first().click()
      })
      await shot(page, 'admin-viewas-active', width)
      await context.close()
    }

    if (missing.length > 0 && outDir) {
      writeFileSync(path.join(outDir, `skipped-${width}.txt`), missing.join('\n') + '\n', 'utf8')
    }
  })
}
