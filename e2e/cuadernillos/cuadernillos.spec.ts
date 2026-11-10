import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const fixture: { campaignId: string; productId: string; requestId: string; headCue: string; recipientCue: string } =
  JSON.parse(readFileSync(path.join(__dirname, '.results/fixture-state.json'), 'utf8'))

async function login(page: Page, capability: 'planning' | 'cabecera' | 'supervisor') {
  const email = `t8-fixture-${capability}@example.test`
  const password = process.env[`T8_${capability.toUpperCase()}_PASSWORD`]
  if (!password) throw new Error(`Missing isolated credential for ${capability}`)
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

test('isolated PGlite public smoke shows balances, own requests, and fail-closed individual decisions @pglite-smoke', async ({ browser }) => {
  const planning = await browser.newPage()
  await login(planning, 'planning')
  await expect(planning.getByRole('heading', { name: 'Cuadernillos' })).toBeVisible()
  await expect(planning.getByRole('rowheader', { name: 'Cuadernillo de prueba' })).toBeVisible()
  await expect(planning.getByRole('cell', { name: /Escuela Cabecera de prueba/ })).toBeVisible()
  await planning.close()

  const supervisor = await browser.newPage()
  await login(supervisor, 'supervisor')
  await expect(supervisor.getByText('Escuela Anexo de prueba').first()).toBeVisible()
  await expect(supervisor.getByText('Pendiente', { exact: true }).first()).toBeVisible()
  await supervisor.getByLabel(/Confirmo la decisión individual/).check()
  await supervisor.getByRole('button', { name: 'Confirmar aprobación' }).click()
  await expect(supervisor.locator('p[role="alert"]')).toContainText('No se modificó la solicitud')
  await expect(supervisor.getByText('Pendiente', { exact: true }).first()).toBeVisible()
  await supervisor.reload()
  await expect(supervisor.getByText('Pendiente', { exact: true }).first()).toBeVisible()
  await supervisor.close()

  const cabecera = await browser.newPage()
  await login(cabecera, 'cabecera')
  await expect(cabecera.getByText('No aprobado en esta solicitud:')).toBeVisible()
  await expect(cabecera.getByText(/no es un saldo disponible/i)).toBeVisible()
  await cabecera.getByRole('button', { name: 'Consultar disponibilidad de remanente' }).click()
  await expect(cabecera.getByText('Disponible para proponer')).toBeVisible()
  await expect(cabecera.getByLabel('Cantidad propuesta · Cuadernillo de prueba')).toHaveValue('4')
  await cabecera.getByRole('button', { name: 'Solicitar remanente' }).click()
  await expect(cabecera.locator('p[role="alert"]')).toContainText('no está disponible')
  await expect(cabecera.getByText('Aprobada').first()).toBeVisible()
  await cabecera.close()
})

test('isolated PostgreSQL public flow approves, reserves remainder, rejects without deduction, and persists balances @postgres-workflow', async ({ browser }) => {
  const planning = await browser.newPage()
  await login(planning, 'planning')
  const initialBalance = planning.getByRole('row').filter({ has: planning.getByRole('rowheader', { name: 'Cuadernillo de prueba' }) })
  await expect(initialBalance).toContainText('100')
  await expect(initialBalance).toContainText('50')
  await planning.close()

  const supervisor = await browser.newPage()
  await login(supervisor, 'supervisor')
  await expect(supervisor.getByText('Pendiente', { exact: true }).first()).toBeVisible()
  await supervisor.getByLabel('Cantidad aprobada · Cuadernillo de prueba').fill('8')
  await supervisor.getByLabel(/Confirmo la decisión individual/).check()
  const approvalResponsePromise = supervisor.waitForResponse((response) =>
    response.url().includes(`/api/cuadernillos/requests/${encodeURIComponent(fixture.requestId)}/approve`)
      && response.request().method() === 'POST')
  await supervisor.getByRole('button', { name: 'Confirmar aprobación' }).click()
  const approvalResponse = await approvalResponsePromise
  expect(approvalResponse.status()).toBe(200)
  await expect(supervisor.getByText('Aprobada', { exact: true }).first()).toBeVisible()
  await expect(supervisor.getByText('No aprobado en esta solicitud:').first()).toBeVisible()

  const cabecera = await browser.newPage()
  await login(cabecera, 'cabecera')
  await expect(cabecera.getByText('No aprobado en esta solicitud:').first()).toBeVisible()
  await expect(cabecera.getByText(/no es un saldo disponible/i)).toBeVisible()
  await cabecera.getByRole('button', { name: 'Consultar disponibilidad de remanente' }).click()
  await expect(cabecera.getByText('Disponible para proponer')).toBeVisible()
  await expect(cabecera.getByLabel('Cantidad propuesta · Cuadernillo de prueba')).toHaveValue('4')
  const remainderResponsePromise = cabecera.waitForResponse((response) =>
    response.url().includes(`/api/cuadernillos/requests/${encodeURIComponent(fixture.requestId)}/remainder`)
      && response.request().method() === 'POST')
  await cabecera.getByRole('button', { name: 'Solicitar remanente' }).click()
  const remainderResponse = await remainderResponsePromise
  expect(remainderResponse.status()).toBe(201)
  const chainResponse = await cabecera.request.get(`/api/cuadernillos/requests/${encodeURIComponent(fixture.requestId)}/remainder`)
  expect(chainResponse.status()).toBe(200)
  await expect(chainResponse.json()).resolves.toMatchObject({
    rootRequestId: fixture.requestId,
    requested: [{ productId: fixture.productId, quantity: 12 }],
    approved: [{ productId: fixture.productId, quantity: 8 }],
    remaining: [{ productId: fixture.productId, quantity: 4 }],
    availableRemainder: [],
  })

  const rejectionRequestResponse = await cabecera.request.post('/api/cuadernillos/requests', {
    data: {
      campaignId: fixture.campaignId, recipientCueAnexo: fixture.recipientCue,
      lines: [{ productId: fixture.productId, quantity: 3 }], submit: true,
      idempotencyKey: 't8-rejection-create-fixture',
    },
  })
  expect(rejectionRequestResponse.status()).toBe(201)
  const rejectionRequest = await rejectionRequestResponse.json()
  const rejectedRequestId = rejectionRequest.request.requestId as string
  const rejectionResponse = await supervisor.request.post(`/api/cuadernillos/requests/${encodeURIComponent(rejectedRequestId)}/reject`, {
    data: { reason: 'Fixture rejection; no inventory deduction expected.', idempotencyKey: 't8-rejection-fixture' },
  })
  expect(rejectionResponse.status()).toBe(200)
  const requestPageResponse = await supervisor.request.get(`/api/cuadernillos/requests?campaignId=${encodeURIComponent(fixture.campaignId)}`)
  expect(requestPageResponse.status()).toBe(200)
  const requestPage = await requestPageResponse.json()
  expect(requestPage.requests).toContainEqual(expect.objectContaining({ requestId: rejectedRequestId, status: 'rejected' }))

  const finalPlanning = await browser.newPage()
  await login(finalPlanning, 'planning')
  const finalBalance = finalPlanning.getByRole('row').filter({ has: finalPlanning.getByRole('rowheader', { name: 'Cuadernillo de prueba' }) })
  await expect(finalBalance).toContainText('92')
  await expect(finalBalance).toContainText('42')
  await finalPlanning.close()
  await cabecera.close()
  await supervisor.close()
})
