import { test, type Browser, type BrowserContext, type Page, type Request } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

// Visual review captures. Never fails for a missing element: every step is logged and skipped.
const fixture: { headCue: string; recipientCue: string; criticalCues: string[] } =
  JSON.parse(readFileSync(path.join(__dirname, '.results/fixture-state.json'), 'utf8'))

const outDir = process.env.T8_SCREENS_DIR ?? ''
const missing: string[] = []
const networkLog: string[] = []
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

const pending = new Map<Request, { label: string; started: number }>()

function track(page: Page, label: string) {
  page.on('request', (request) => {
    if (request.url().includes('/api/cuadernillos/')) pending.set(request, { label, started: Date.now() })
  })
  page.on('response', (response) => {
    if (!response.url().includes('/api/cuadernillos/')) return
    const entry = pending.get(response.request())
    pending.delete(response.request())
    const duration = entry ? Date.now() - entry.started : -1
    networkLog.push(`${new Date().toISOString()} [${label}] RESPONSE ${response.status()} ${duration}ms ${response.request().method()} ${response.url()}`)
  })
  page.on('requestfailed', (request) => {
    const entry = pending.get(request)
    pending.delete(request)
    const duration = entry ? Date.now() - entry.started : -1
    networkLog.push(`${new Date().toISOString()} [${label}] REQUESTFAILED ${duration}ms ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') networkLog.push(`${new Date().toISOString()} [${label}] CONSOLE_ERROR ${message.text()}`)
  })
  page.on('pageerror', (error) => {
    networkLog.push(`${new Date().toISOString()} [${label}] PAGEERROR ${error.message}`)
  })
}

function flushNetworkLog(width: number) {
  if (!outDir) return
  writeFileSync(path.join(outDir, `network-${width}.log`), networkLog.join('\n') + '\n', 'utf8')
}

async function shot(page: Page, name: string, width: number) {
  await step(`screenshot ${name}`, async () => {
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
    const settled = await page.waitForFunction(() => ![...document.querySelectorAll('body *')].some((element) => {
      const rect = element.getBoundingClientRect()
      return element.childElementCount === 0 && /Cargando/.test(element.textContent ?? '') && rect.width > 0 && rect.height > 0
    }), undefined, { timeout: 20_000 }).then(() => true, () => false)
    networkLog.push(`${new Date().toISOString()} [${name}] LOADING_SETTLED=${settled}`)
    for (const [request, entry] of pending) {
      networkLog.push(`${new Date().toISOString()} [${name}] PENDING ${entry.label} age=${Date.now() - entry.started}ms ${request.method()} ${request.url()}`)
    }
    if (width === 390) {
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        innerWidth: window.innerWidth,
      }))
      networkLog.push(`${new Date().toISOString()} [${name}] SCROLL scrollWidth=${metrics.scrollWidth} clientWidth=${metrics.clientWidth} innerWidth=${metrics.innerWidth} overflow=${metrics.scrollWidth > metrics.clientWidth}`)
    }
    flushNetworkLog(width)
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
    networkLog.length = 0
    mkdirSync(outDir, { recursive: true })

    // Cabecera: initial, CUE search with results, school selected with quantities.
    {
      const context = await openContext(browser, width, height)
      const page = await context.newPage()
      track(page, 'cabecera')
      await login(page, 'cabecera')
      await dismissUnderDevelopment(page)
      await shot(page, 'cabecera-initial', width)
      await step('cabecera search by CUE', async () => {
        await page.getByLabel('CUE de la escuela').fill(fixture.criticalCues[0])
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
      track(page, 'supervisor')
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
      track(page, 'planning')
      await login(page, 'planning')
      await dismissUnderDevelopment(page)
      await shot(page, 'planning-home', width)
      await context.close()
    }

    flushNetworkLog(width)
    if (missing.length > 0 && outDir) {
      writeFileSync(path.join(outDir, `skipped-${width}.txt`), missing.join('\n') + '\n', 'utf8')
    }
  })
}
