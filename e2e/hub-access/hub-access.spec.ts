import { expect, test, type BrowserContext, type Page } from '@playwright/test'

const adminEmail = 't7b-admin@example.test'
const infraEmail = 't7b-infra@example.test'
const adminPassword = process.env.T7B_ADMIN_PASSWORD!
const infraPassword = process.env.T7B_INFRA_PASSWORD!
const errors: string[] = []

/** Console resource errors the tests assert directly; anything else is a real browser error. */
function isExpectedResourceError(text: string, url: string) {
  // Deliberate wrong-password attempts (401) and Better Auth's shared-IP rate limit (429) on sign-in.
  if (url.includes('/api/auth/sign-in') && /status of (401|429) /.test(text)) return true
  // The infrastructure test probes the catalog directly and asserts its 403 (hubRead).
  if (new URL(url, 'http://localhost').pathname === '/api/hub' && /status of 403 /.test(text)) return true
  // The departamentos dataset is unpublished in this throwaway database, so the API answers 503 by design.
  if (url.endsWith('/api/mapas/infraestructura/datasets/departamentos') && /status of 503 /.test(text)) return true
  return false
}

function collectBrowserErrors(page: Page) {
  const localErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const url = message.location().url
    if (isExpectedResourceError(message.text(), url)) return
    localErrors.push(`console.error: ${message.text()} @ ${url}`)
  })
  page.on('pageerror', (error) => localErrors.push(`pageerror: ${error.message}`))
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText ?? 'unknown'
    if (!reason.includes('net::ERR_ABORTED')) localErrors.push(`requestfailed: ${request.url()} (${reason})`)
  })
  return localErrors
}

async function isolateExternalCalls(context: BrowserContext) {
  const blocked: string[] = []
  const origin = new URL(process.env.HUB_E2E_BASE_URL ?? 'http://127.0.0.1:3101').origin
  await context.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin !== origin) {
      blocked.push(route.request().url())
      await route.fulfill({ status: 204, body: '' })
      return
    }
    await route.continue()
  })
  return blocked
}

async function login(page: Page, email: string, password: string, callbackUrl?: string, { expectSuccess = true } = {}) {
  await page.goto(callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : '/login')
  await page.getByLabel('Correo').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  // Better Auth limits /sign-in/* to 3 requests per 10 seconds per client IP. Every browser context here shares
  // 127.0.0.1, so a 429 is the server's rate limit (not an access decision): wait out the window and submit again.
  for (let attempt = 1; attempt <= 3; attempt++) {
    const signInResponse = page.waitForResponse((response) => response.url().includes('/api/auth/sign-in') && response.request().method() === 'POST', { timeout: 15_000 }).catch(() => null)
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    const response = await signInResponse
    if (!response) break
    // Diagnostic: status and error code only; a successful body carries a session token.
    const body = response.status() === 200 ? null : await response.json().catch(() => null) as { code?: string; message?: string } | null
    console.log(`T7b diagnostic: sign-in attempt ${attempt} for ${email} -> HTTP ${response.status()} code=${body?.code ?? 'none'}`)
    if (response.status() !== 429) break
    await page.waitForTimeout(10_500)
  }
  if (!expectSuccess) return
  try {
    await page.waitForURL((url) => url.pathname !== '/login', { timeout: 15_000 })
  } catch (error) {
    const alert = await page.getByRole('alert').allTextContents().catch(() => [])
    console.log(`T7b diagnostic: ${email} still at ${page.url()}; alerts=${JSON.stringify(alert)}`)
    throw error
  }
}

test('anonymous landing redirects to login without rendering or fetching the catalog', async ({ page }) => {
  const pageErrors = collectBrowserErrors(page)
  const hubRequests: string[] = []
  page.on('request', (request) => {
    if (request.url().includes('/api/hub')) hubRequests.push(request.url())
  })
  const response = await page.goto('/')
  expect(response?.status()).toBeLessThan(400)
  await expect(page).toHaveURL(/\/login(?:\?|$)/)
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
  await expect(page.getByText('Gestión del Hub')).toHaveCount(0)
  expect(hubRequests).toEqual([])
  expect(pageErrors).toEqual([])
  console.log('T7b evidence: anonymous / -> /login; no /api/hub request, no protected text flash, no browser/hydration errors.')
})

test('maps-, reports-, and dashboards-only destinations resolve without redirect loops', async ({ browser }) => {
  const destinations = [
    { email: 't7b-maps@example.test', password: process.env.T7B_MAPS_PASSWORD!, path: '/mapas', denied: '/reportes' },
    { email: 't7b-reports@example.test', password: process.env.T7B_REPORTS_PASSWORD!, path: '/reportes', denied: '/tableros' },
    { email: 't7b-dashboards@example.test', password: process.env.T7B_DASHBOARDS_PASSWORD!, path: '/tableros', denied: '/mapas' },
  ]
  for (const destination of destinations) {
    const context = await browser.newContext()
    const blockedExternal = await isolateExternalCalls(context)
    const page = await context.newPage()
    const pageErrors = collectBrowserErrors(page)
    await login(page, destination.email, destination.password)
    await expect(page).toHaveURL(new RegExp(`${destination.path.replaceAll('/', '\\/')}(?:\\?|$)`))
    await page.goto('/')
    await expect(page).toHaveURL(new RegExp(`${destination.path.replaceAll('/', '\\/')}(?:\\?|$)`))
    await page.goto(destination.denied)
    await expect(page).toHaveURL(/\/(?:mapas|reportes|tableros|forbidden)(?:\?|$)/)
    expect(new URL(page.url()).pathname).not.toBe(destination.denied)
    expect(pageErrors).toEqual([])
    console.log(`T7b evidence: ${destination.path}-only login and landing fallback -> ${destination.path}; denied ${destination.denied} resolved safely; external requests stubbed=${blockedExternal.length}.`)
    await context.close()
  }
})

test('admin creates and edits an infrastructure-only account with an assigned password', async ({ browser }) => {
  // The database is shared by both projects, so each run creates its own account email.
  const createdEmail = `browser-created-${crypto.randomUUID().slice(0, 8)}@example.test`
  const adminContext = await browser.newContext()
  const adminBlockedExternal = await isolateExternalCalls(adminContext)
  const adminPage = await adminContext.newPage()
  const adminErrors = collectBrowserErrors(adminPage)
  await login(adminPage, adminEmail, adminPassword)
  await adminPage.goto('/admin/usuarios')
  await expect(adminPage.getByRole('table', { name: 'Usuarios' })).toBeVisible()
  await adminPage.getByRole('button', { name: 'Nuevo usuario' }).click()
  const dialog = adminPage.getByRole('dialog')
  await expect(adminPage.getByRole('heading', { name: 'Nuevo usuario' })).toBeVisible()
  // Required labels render as "Nombre*"; the dialog textboxes expose the plain accessible names.
  await dialog.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Infraestructura T7b')
  await dialog.getByRole('textbox', { name: 'Correo', exact: true }).fill(createdEmail)
  const createdPassword = process.env.T7B_CREATED_PASSWORD!
  await dialog.getByLabel('Contraseña').fill(createdPassword)
  await dialog.getByRole('checkbox', { name: 'Infraestructura', exact: true }).check()
  const destination = adminPage.getByRole('combobox', { name: 'Destino inicial' })
  await expect(destination).toBeEnabled()
  await destination.click()
  await adminPage.getByRole('option', { name: 'ENOS Corrientes' }).click()
  const createResponsePromise = adminPage.waitForResponse((response) =>
    response.url().endsWith('/api/usuarios') && response.request().method() === 'POST',
  )
  await adminPage.getByRole('button', { name: 'Guardar' }).click()
  const createResponse = await createResponsePromise
  const createBody = await createResponse.json().catch(() => null)
  expect(createResponse.status(), `POST /api/usuarios response: ${JSON.stringify(createBody)}`).toBe(201)
  const newUserRow = adminPage.getByRole('row').filter({ hasText: createdEmail })
  await expect(newUserRow).toContainText('Infraestructura')
  await expect(newUserRow).toContainText('Inicio no permitido')

  const createdContext = await browser.newContext()
  await isolateExternalCalls(createdContext)
  const createdPage = await createdContext.newPage()
  const createdErrors = collectBrowserErrors(createdPage)
  await login(createdPage, createdEmail, createdPassword)
  await expect(createdPage).toHaveURL(/\/mapas\/infraestructura(?:\?|$)/)
  expect(createdErrors).toEqual([])
  console.log('T7b evidence: newly created account authenticated using the administrator-assigned password and entered its configured infrastructure destination.')
  await createdContext.close()

  await newUserRow.getByRole('button', { name: 'Editar' }).click()
  await expect(adminPage.getByRole('heading', { name: 'Editar usuario' })).toBeVisible()
  await adminPage.getByRole('dialog').getByRole('textbox', { name: 'Nombre', exact: true }).fill('Infraestructura T7b editada')
  await adminPage.getByRole('button', { name: 'Guardar' }).click()
  await expect(newUserRow).toContainText('Infraestructura T7b editada')
  expect(adminErrors).toEqual([])
  console.log(`T7b evidence: admin clicked Nuevo usuario, selected only Infraestructura + assigned password + authorized destination, saved, edited name, and observed persisted row; external requests stubbed=${adminBlockedExternal.length}.`)
  await adminContext.close()
})

test('infrastructure-only login, route denial, password recovery, logout, and browser session expiry work', async ({ browser }) => {
  const userContext = await browser.newContext()
  const userBlockedExternal = await isolateExternalCalls(userContext)
  const page = await userContext.newPage()
  const pageErrors = collectBrowserErrors(page)
  const attemptedHubApi: number[] = []
  page.on('response', (response) => {
    if (response.url().endsWith('/api/hub')) attemptedHubApi.push(response.status())
  })
  const deepLink = '/mapas/infraestructura?source=t7b'
  await login(page, infraEmail, infraPassword, deepLink)
  await expect(page).toHaveURL(new RegExp('/mapas/infraestructura\\?source=t7b$'))
  await expect(page.getByRole('main')).toBeVisible()

  const deniedDestinations = ['/explorar', '/reportes', '/mapas', '/tableros']
  for (const path of deniedDestinations) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/(?:mapas\/infraestructura|forbidden)(?:\?|$)/)
    expect(new URL(page.url()).pathname).not.toBe(path)
  }
  await page.goto('/')
  await expect(page).toHaveURL(/\/mapas\/infraestructura(?:\?|$)/)
  await page.goto(deepLink)
  await expect(page).toHaveURL(new RegExp('/mapas/infraestructura\\?source=t7b$'))
  await page.goBack()
  await expect(page).toHaveURL(/\/mapas\/infraestructura(?:\?|$)/)

  const nav = page.getByRole('navigation', { name: 'Navegación principal' })
  for (const href of ['/', '/explorar', '/reportes', '/mapas', '/tableros', '/situacion']) {
    await expect(nav.locator(`a[href="${href}"]`)).toHaveCount(0)
  }
  if (test.info().project.name === 'mobile-chromium') {
    // The main nav is collapsed behind the mobile menu on phone widths; the menu is covered by the section-only mobile test.
    await page.getByRole('button', { name: 'Abrir navegación' }).click()
    await expect(page.getByRole('menu').getByRole('menuitem', { name: 'ENOS Corrientes' })).toBeVisible()
    await page.keyboard.press('Escape')
  } else {
    await expect(nav.locator('a[href="/mapas/infraestructura"]')).toBeVisible()
  }
  const hubRead = await page.evaluate(async () => {
    const response = await fetch('/api/hub', { cache: 'no-store' })
    return { status: response.status, body: await response.json() }
  })
  expect(hubRead.status).toBe(403)
  expect(JSON.stringify(hubRead.body)).not.toMatch(/Exploración|Reportes|Tableros|mapas\/matricula/i)
  expect(attemptedHubApi.every((status) => status === 403)).toBe(true)

  await page.getByRole('button', { name: 'Menú de cuenta' }).click()
  await page.getByRole('menuitem', { name: 'Cambiar contraseña' }).click()
  await expect(page).toHaveURL(/\/cuenta$/)
  const changedPassword = `Changed-${crypto.randomUUID()}-Aa9!`
  await page.getByLabel('Contraseña actual').fill(infraPassword)
  await page.getByLabel('Nueva contraseña', { exact: true }).fill(changedPassword)
  await page.getByLabel('Repita la nueva contraseña').fill(changedPassword)
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click()
  await expect(page.getByRole('status')).toContainText(/contraseña/i)
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await login(page, infraEmail, infraPassword, undefined, { expectSuccess: false })
  await expect(page.getByRole('alert').filter({ hasText: 'No se pudo iniciar sesión' })).toBeVisible()
  await login(page, infraEmail, changedPassword)
  await expect(page).toHaveURL(/\/mapas\/infraestructura(?:\?|$)/)

  // Restore the shared infrastructure fixture password so the mobile project's login starts from the same state.
  await page.goto('/cuenta')
  await page.getByLabel('Contraseña actual').fill(changedPassword)
  await page.getByLabel('Nueva contraseña', { exact: true }).fill(infraPassword)
  await page.getByLabel('Repita la nueva contraseña').fill(infraPassword)
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click()
  await expect(page.getByRole('status')).toContainText(/contraseña/i)

  // Simulate browser-side expiry of the real Better Auth session cookie.
  // The server-side database clock expiry path is not simulated here.
  const sessionCookie = (await userContext.cookies()).find((cookie) => cookie.name.includes('session_token'))
  expect(sessionCookie).toBeDefined()
  await userContext.addCookies([{ ...sessionCookie!, expires: Math.floor(Date.now() / 1000) - 10 }])
  await page.goto('/mapas/infraestructura')
  await expect(page).toHaveURL(/\/login(?:\?|$)/)
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible()
  expect(pageErrors).toEqual([])
  console.log(`T7b evidence: allowed deep link kept query; landing and ${deniedDestinations.join(', ')} denied without loops; disabled chrome and catalog metadata hidden (/api/hub=${hubRead.status}); password changed, old credential rejected, new credential accepted; logout and expired browser session cookie returned login; external requests stubbed=${userBlockedExternal.length}; no browser/hydration errors. Server database-clock expiry remains unverified.`)
  await userContext.close()
})

test('section-only mobile navigation and keyboard controls stay within the allowed section', async ({ browser, isMobile }) => {
  test.skip(!isMobile, 'Mobile layout is exercised in the dedicated mobile Chromium project.')
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const blockedExternal = await isolateExternalCalls(context)
  const page = await context.newPage()
  const pageErrors = collectBrowserErrors(page)
  await login(page, 't7b-mobile@example.test', process.env.T7B_MOBILE_PASSWORD!)
  await expect(page).toHaveURL(/\/mapas\/infraestructura(?:\?|$)/)
  const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width)

  const mobileNavButton = page.getByRole('button', { name: 'Abrir navegación' })
  await expect(mobileNavButton).toBeVisible()
  const target = await mobileNavButton.boundingBox()
  expect(target).not.toBeNull()
  expect(target!.width).toBeGreaterThanOrEqual(44)
  expect(target!.height).toBeGreaterThanOrEqual(44)
  await mobileNavButton.focus()
  await page.keyboard.press('Enter')
  const menu = page.getByRole('menu')
  await expect(menu.getByRole('menuitem', { name: 'ENOS Corrientes' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await mobileNavButton.click()
  await expect(menu.getByRole('menuitem', { name: 'ENOS Corrientes' })).toBeVisible()
  for (const text of ['Inicio', 'Explorar', 'Reportes', 'Mapas', 'Tableros', 'Centro de Situación']) {
    await expect(menu.getByRole('menuitem', { name: text, exact: true })).toHaveCount(0)
  }
  await menu.getByRole('menuitem', { name: 'ENOS Corrientes' }).click()
  await expect(page).toHaveURL(/\/mapas\/infraestructura(?:\?|$)/)
  // Closing the menu returns focus to its trigger once the menu item unmounts. A Tab sent before that
  // restore landed on BODY in the failing runs, so wait for the restore instead of racing it.
  await expect(mobileNavButton).toBeFocused()
  await page.keyboard.press('Tab')
  const focused = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement
    const style = getComputedStyle(el)
    return {
      tag: el.tagName,
      className: el.className,
      label: el.getAttribute('aria-label'),
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
    }
  })
  // Inputs and menu items mark focus with an inset box-shadow instead of an outline.
  const hasOutline = focused.outlineStyle !== 'none' && parseFloat(focused.outlineWidth) > 0
  expect(hasOutline || focused.boxShadow !== 'none', JSON.stringify(focused)).toBe(true)
  expect(pageErrors).toEqual([])
  console.log(`T7b evidence: mobile 390x844 no horizontal overflow (${dimensions.scrollWidth}/${dimensions.width}); menu click showed only infrastructure, navigated successfully; keyboard focus ${JSON.stringify(focused)}; external requests stubbed=${blockedExternal.length}; no console/hydration errors.`)
  await context.close()
})
