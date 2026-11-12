import { expect, test, type Cookie } from '@playwright/test'
import { conPagina, cookiesDeSesion } from './sesion'

// Same image with REGION unset: the default region must still be Corrientes.
test.describe.configure({ mode: 'serial' })

let cookies: Cookie[] = []

test.beforeAll(async ({ browser, baseURL }) => {
  cookies = await cookiesDeSesion(browser, baseURL!)
})

test('health is ok', async ({ request }) => {
  const response = await request.get('/api/health')
  expect(response.status()).toBe(200)
  expect(await response.json()).toEqual({ ok: true })
})

test('map shows the Corrientes tablist and no language selector', async ({ browser, baseURL }) => {
  await conPagina(browser, baseURL!, cookies, async (page) => {
    await page.goto('/mapas/infraestructura')
    await expect(page.locator('canvas.maplibregl-canvas').first()).toBeVisible({ timeout: 60_000 })
    await expect(page.getByRole('tablist', { name: 'Modos y vistas de ENOS Corrientes', exact: true })).toBeVisible()
    await expect(page.getByTestId('selector-idioma')).toHaveCount(0)
  })
})
