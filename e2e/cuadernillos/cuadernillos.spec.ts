import { expect, test, type APIRequestContext, type Browser, type BrowserContext } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { login, type Who } from './session'

const fixture: {
  campaignId: string; productId: string; productExtraId: string; rejectedId: string
  headCue: string; recipientCue: string; criticalCues: string[]
} = JSON.parse(readFileSync(path.join(__dirname, '.results/fixture-state.json'), 'utf8'))

async function session(browser: Browser, who: Who): Promise<BrowserContext> {
  const context = await browser.newContext()
  await login(await context.newPage(), who)
  return context
}

test('isolated PGlite smoke loads every role surface and confines the school operator @pglite-smoke', async ({ browser }) => {
  const planning = await session(browser, 'planning')
  const planningPage = planning.pages()[0]
  await expect(planningPage.getByRole('heading', { name: 'Cuadernillos' })).toBeVisible()
  await expect(planningPage.getByRole('button', { name: 'Nuevo remito' })).toBeVisible()
  await planning.close()

  const cabecera = await session(browser, 'cabecera')
  await expect(cabecera.pages()[0].getByRole('heading', { name: 'Recepción de remitos' })).toBeVisible()
  await cabecera.close()

  const supervisor = await session(browser, 'supervisor')
  await expect(supervisor.pages()[0].getByRole('heading', { name: 'Control de remitos' })).toBeVisible()
  await supervisor.close()

  const operator = await session(browser, 'operator')
  const school = operator.pages()[0]
  await expect(school.getByRole('heading', { name: 'Recepción de cuadernillos' })).toBeVisible()
  await school.goto('/cuadernillos')
  await expect(school).not.toHaveURL(/\/cuadernillos(?:\?|$)/)
  const forbidden = await operator.request.get('/api/cuadernillos/remitos')
  expect(forbidden.status()).toBe(403)
  await operator.close()
})

type ControlItem = { productId: string; dispatched: number }
type ControlLine = { lineId: string; recipientCueAnexo: string; items: ControlItem[] }
type ControlRemito = { remitoId: string; hasShortfall: boolean; lines: ControlLine[] }
type Body = { remito?: { remitoId: string; status: string }; remitos?: ControlRemito[]; summary?: { planningToCabeceraShortfallUnits: number }; error?: string }

async function json(response: Awaited<ReturnType<APIRequestContext['get']>>) {
  return response.json() as Promise<Body>
}

test('isolated remito flow dispatches, receipts with a shortfall, and keeps history @pglite-smoke @postgres-workflow', async ({ browser }) => {
  const [schoolA, schoolB] = fixture.criticalCues
  const planning = await session(browser, 'planning')
  const cabecera = await session(browser, 'cabecera')
  const supervisor = await session(browser, 'supervisor')
  const operator = await session(browser, 'operator')
  const operatorOther = await session(browser, 'operatorOther')

  // S3/S4: planning dispatches one remito and stock is debited immediately.
  const dispatch = await planning.request.post('/api/cuadernillos/remitos', {
    data: {
      campaignId: fixture.campaignId, cabeceraCueAnexo: fixture.headCue, idempotencyKey: 't8-remito-dispatch',
      lines: [
        { recipientCueAnexo: schoolA, items: [{ productId: fixture.productId, quantity: 10 }, { productId: fixture.productExtraId, quantity: 5 }] },
        { recipientCueAnexo: schoolB, items: [{ productId: fixture.productId, quantity: 6 }] },
      ],
    },
  })
  expect(dispatch.status()).toBe(201)
  const { remito } = await json(dispatch) as { remito: { remitoId: string; status: string } }
  expect(remito.status).toBe('dispatched')
  const stock = await planning.request.get(`/api/cuadernillos/overview?capability=planning&campaignId=${encodeURIComponent(fixture.campaignId)}`)
  const stockText = JSON.stringify(await stock.json())
  expect(stock.status()).toBe(200)
  expect(stockText).toContain('84')

  // Supervisor control exposes the line ids (the dispatch response carries none).
  const control = await supervisor.request.get(`/api/cuadernillos/control?campaignId=${encodeURIComponent(fixture.campaignId)}`)
  expect(control.status()).toBe(200)
  const controlRemito = (await json(control)).remitos?.find((entry) => entry.remitoId === remito.remitoId)
  if (!controlRemito) throw new Error('remito missing from supervisor control')
  const lineOf = (cue: string) => {
    const found = controlRemito.lines.find((line) => line.recipientCueAnexo.replaceAll('-', '') === cue)
    if (!found) throw new Error(`line for ${cue} missing`)
    return found
  }
  const lineA = lineOf(schoolA)
  const lineB = lineOf(schoolB)

  // S7: the school cannot sign before the cabecera.
  const early = await operator.request.post(`/api/cuadernillos/remito-lineas/${lineA.lineId}/recibir`, {
    data: { idempotencyKey: 't8-school-early', items: [{ productId: fixture.productId, receivedQuantity: 10 }, { productId: fixture.productExtraId, receivedQuantity: 5 }] },
  })
  expect(early.status()).toBe(409)
  await expect(json(early)).resolves.toMatchObject({ error: 'cabecera_receipt_pending' })

  // S5/S6: cabecera signs the whole remito with one shortfall and its reason.
  const cabeceraReceipt = await cabecera.request.post(`/api/cuadernillos/remitos/${remito.remitoId}/recibir`, {
    data: {
      idempotencyKey: 't8-cabecera-receipt',
      lines: [
        { lineId: lineA.lineId, items: [{ productId: fixture.productId, receivedQuantity: 8 }, { productId: fixture.productExtraId, receivedQuantity: 5 }], shortfallReason: 'Caja dañada en el traslado' },
        { lineId: lineB.lineId, items: [{ productId: fixture.productId, receivedQuantity: 6 }] },
      ],
    },
  })
  expect(cabeceraReceipt.status()).toBe(200)

  // S7: another school's operator cannot sign this line; the owner signs what the cabecera confirmed.
  const otherAttempt = await operatorOther.request.post(`/api/cuadernillos/remito-lineas/${lineA.lineId}/recibir`, {
    data: { idempotencyKey: 't8-school-other', items: [{ productId: fixture.productId, receivedQuantity: 8 }, { productId: fixture.productExtraId, receivedQuantity: 5 }] },
  })
  expect(otherAttempt.status()).toBe(403)
  const schoolReceipt = await operator.request.post(`/api/cuadernillos/remito-lineas/${lineA.lineId}/recibir`, {
    data: { idempotencyKey: 't8-school-receipt', items: [{ productId: fixture.productId, receivedQuantity: 8 }, { productId: fixture.productExtraId, receivedQuantity: 5 }] },
  })
  expect(schoolReceipt.status()).toBe(200)

  // S9: supervisor sees the shortfall on the Planeamiento -> Cabecera leg and may only observe.
  const after = await json(await supervisor.request.get(`/api/cuadernillos/control?campaignId=${encodeURIComponent(fixture.campaignId)}`))
  const seen = after.remitos?.find((entry) => entry.remitoId === remito.remitoId)
  if (!seen) throw new Error('remito missing after receipts')
  expect(seen.hasShortfall).toBe(true)
  const shortItem = seen.lines.flatMap((line) => line.items).find((item) => item.productId === fixture.productId && item.dispatched === 10)
  expect(shortItem).toMatchObject({ planningToCabeceraShortfall: 2, cabeceraToSchoolShortfall: 0 })
  expect(after.summary?.planningToCabeceraShortfallUnits).toBe(2)
  const observation = await supervisor.request.post(`/api/cuadernillos/remitos/${remito.remitoId}/observaciones`, {
    data: { body: 'Seguimiento posterior del faltante' },
  })
  expect(observation.status()).toBe(201)

  // S1/S11: the request flow is retired for writes while history stays readable.
  const retired = await cabecera.request.post('/api/cuadernillos/requests', {
    data: { campaignId: fixture.campaignId, recipientCueAnexo: schoolA, lines: [{ productId: fixture.productId, quantity: 3 }], idempotencyKey: 't8-retired' },
  })
  expect(retired.status()).toBe(410)
  await expect(json(retired)).resolves.toMatchObject({ error: 'flow_retired' })
  const history = await supervisor.request.get(`/api/cuadernillos/requests?campaignId=${encodeURIComponent(fixture.campaignId)}`)
  expect(history.status()).toBe(200)
  expect(JSON.stringify(await history.json())).toContain(fixture.rejectedId)

  await Promise.all([planning, cabecera, supervisor, operator, operatorOther].map((context) => context.close()))
})
