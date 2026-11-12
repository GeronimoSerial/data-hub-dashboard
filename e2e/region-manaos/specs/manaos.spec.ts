import { expect, test, type Cookie } from '@playwright/test'
import { captura, conPagina, cookiesDeSesion } from './sesion'

// Empty Manaos database, same image as Corrientes. Only DOM and API: the image has no E2E hooks (NEXT_PUBLIC_E2E unset).
const TABLA_PT = 'Modos e visualizações de ENOS Manaos'
const TABLA_ES = 'Modos y vistas de ENOS Manaos'
const MAPA = '/mapas/infraestructura'

test.describe.configure({ mode: 'serial' })

let cookies: Cookie[] = []

test.beforeAll(async ({ browser, baseURL }) => {
  cookies = await cookiesDeSesion(browser, baseURL!)
})

test('(1) GET /api/health is ok', async ({ request }) => {
  const response = await request.get('/api/health')
  expect(response.status()).toBe(200)
  expect(await response.json()).toEqual({ ok: true })
})

test('(2) map loads in Portuguese with the language selector set to Português', async ({ browser, baseURL }) => {
  await conPagina(browser, baseURL!, cookies, async (page) => {
    await page.goto(MAPA)
    await expect(page.locator('canvas.maplibregl-canvas').first()).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('tablist', { name: TABLA_PT, exact: true })).toBeVisible()
    const selector = page.getByTestId('selector-idioma')
    await expect(selector).toBeVisible()
    await expect(selector.getByRole('button', { name: 'Português', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await captura(page, 'manaos-mapa-pt')
  })
})

test('(3) switching to Español persists across reload and switches back', async ({ browser, baseURL }) => {
  await conPagina(browser, baseURL!, cookies, async (page) => {
    await page.goto(MAPA)
    await expect(page.getByRole('tablist', { name: TABLA_PT, exact: true })).toBeVisible({ timeout: 60_000 })

    const guardado = page.waitForResponse((r) => r.url().includes('/api/usuario/idioma') && r.request().method() === 'PATCH')
    await page.getByTestId('selector-idioma').getByRole('button', { name: 'Español', exact: true }).click()
    expect((await guardado).status()).toBe(200)
    await expect(page.getByRole('tablist', { name: TABLA_ES, exact: true })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('tablist', { name: TABLA_ES, exact: true })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByTestId('selector-idioma').getByRole('button', { name: 'Español', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await captura(page, 'manaos-mapa-es')

    const vuelta = page.waitForResponse((r) => r.url().includes('/api/usuario/idioma') && r.request().method() === 'PATCH')
    await page.getByTestId('selector-idioma').getByRole('button', { name: 'Português', exact: true }).click()
    expect((await vuelta).status()).toBe(200)
    await expect(page.getByRole('tablist', { name: TABLA_PT, exact: true })).toBeVisible()
  })
})

test('(4) school API returns zero schools with status 200', async ({ browser, baseURL }) => {
  await conPagina(browser, baseURL!, cookies, async (page) => {
    const response = await page.request.get('/api/mapas/infraestructura/escuelas')
    expect(response.status()).toBe(200)
    const body = (await response.json()) as { escuelas: unknown[]; totalPadron: number }
    expect(body.escuelas).toEqual([])
    expect(body.totalPadron).toBe(0)
  })
})

test('(5) Situation Center shows an honest no-data state, not a healthy one', async ({ browser, baseURL }) => {
  await conPagina(browser, baseURL!, cookies, async (page) => {
    await page.goto('/situacion')
    await expect(page.getByRole('heading', { name: 'Centro de Situación', level: 1 })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText('Estado de los datos', { exact: true })).toBeVisible()
    // Jobs never ran in an empty database: the panel reports "Sin datos" with the motivo from clasificar.ts.
    await expect(page.getByText('Sin datos', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Nunca corrió.').first()).toBeVisible()
    // The "chain verified" line is shown only when the probe is ok (situacion-client.tsx). It must be absent here.
    await expect(page.getByTestId('situacion-cadena-verificada')).toHaveCount(0)
    await captura(page, 'manaos-situacion')
  })
})

test('(6) the Corrientes name does not leak into the Manaos map', async ({ browser, baseURL }) => {
  await conPagina(browser, baseURL!, cookies, async (page) => {
    await page.goto(MAPA)
    await expect(page.locator('canvas.maplibregl-canvas').first()).toBeVisible({ timeout: 60_000 })
    const texto = await page.locator('body').innerText()
    // TODO(parent): not yet run. If a legitimate leak appears, list its exact current text here instead of weakening the assertion.
    expect(texto).not.toContain('Corrientes')
  })
})
