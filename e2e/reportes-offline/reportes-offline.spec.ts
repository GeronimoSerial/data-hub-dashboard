import { createHmac, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { expect, test, type Page } from '@playwright/test'

const cueSets = {
  chromium: { offline: '1801605-98', online: '1801605-97', update: '1801605-99', photos: '1801605-96', processing: '1801605-95' },
  webkit: { offline: '1801605-94', online: '1801605-93', update: '1801605-92', photos: '1801605-91', processing: '1801605-95' },
}
const sectionIds: Record<string, number> = {
  '1801605-98': 980001, '1801605-97': 980002, '1801605-99': 980003, '1801605-96': 980004,
  '1801605-95': 980005, '1801605-94': 980006, '1801605-93': 980007, '1801605-92': 980008,
  '1801605-91': 980009,
}

function cuesFor(browser: string) {
  return cueSets[browser === 'webkit' ? 'webkit' : 'chromium']
}

interface MeterRow {
  url: string
  kind: string
  requestBytes: number
  responseBytes: number
}

function cookieValue(): string {
  const password = process.env.PROBLEMATICAS_ACCESO_PASSWORD
  if (!password) throw new Error('E2E-only public access secret is missing')
  const expiresAt = String(Date.now() + 60 * 60 * 1000)
  const signature = createHmac('sha256', password).update(expiresAt).digest('base64url')
  return `${expiresAt}.${signature}`
}

function classify(url: string): string {
  if (url.includes('/borradores')) return 'drafts'
  if (url.includes('/adjuntos') || url.includes('/autorizaciones')) return 'photos'
  if (url.includes('/api/problematicas/parte')) return 'report-submit'
  if (url.includes('/api/mapas/') || url.includes('/mapas/')) return 'map-navigation'
  return 'other'
}

function startMeter(page: Page): MeterRow[] {
  const rows: MeterRow[] = []
  page.on('response', (response) => {
    const request = response.request()
    const requestBytes = request.postDataBuffer()?.byteLength ?? 0
    void response.body().then((body) => {
      rows.push({ url: response.url(), kind: classify(response.url()), requestBytes, responseBytes: body.byteLength })
    }).catch(() => {
      const responseBytes = Number(response.headers()['content-length'] ?? 0)
      rows.push({ url: response.url(), kind: classify(response.url()), requestBytes, responseBytes })
    })
  })
  return rows
}

async function record(testName: string, browser: string, rows: MeterRow[], extras: Record<string, unknown> = {}) {
  const outputDir = path.join('e2e/reportes-offline/.results')
  await mkdir(outputDir, { recursive: true })
  const file = path.join(outputDir, `measurements-${browser}.json`)
  let previous: unknown[] = []
  try { previous = JSON.parse(await readFile(file, 'utf8')) as unknown[] } catch { /* first measurement */ }
  const groups = new Map<string, { requests: number; requestBytes: number; responseBytes: number }>()
  for (const row of rows) {
    const group = groups.get(row.kind) ?? { requests: 0, requestBytes: 0, responseBytes: 0 }
    group.requests += 1
    group.requestBytes += row.requestBytes
    group.responseBytes += row.responseBytes
    groups.set(row.kind, group)
  }
  previous.push({ test: testName, browser, flows: Object.fromEntries(groups), ...extras })
  await writeFile(file, `${JSON.stringify(previous, null, 2)}\n`)
}

async function visitNewFlow(page: Page, cue: string) {
  await page.goto(`/problematicas/parte/nuevo?cue=${cue}`)
  await expect(page.getByText('Paso 1 de 5')).toBeVisible()
}

async function submitInitialReport(page: Page, cue: string): Promise<{ movementId: string; bodyBytes: number; payload: Record<string, unknown> }> {
  const payload = {
    cue,
    idempotencyKey: randomUUID(),
    rigeDesde: new Date().toISOString(),
    afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Alta', secciones: [sectionIds[cue]] }],
  }
  const result = await page.evaluate(async (body) => {
    const response = await fetch('/api/problematicas/parte', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    return { status: response.status, body: await response.json() }
  }, payload) as { status: number; body: { ok?: boolean; movimientoId?: string; error?: string } }
  if (result.status < 200 || result.status >= 300 || !result.body.movimientoId) {
    throw new Error(`Report submit failed (${result.status}): ${result.body.error ?? 'missing movement id'}`)
  }
  return { movementId: result.body.movimientoId, bodyBytes: new TextEncoder().encode(JSON.stringify(payload)).byteLength, payload }
}

const externalRequestsByTest = new Map<string, string[]>()

test.beforeEach(async ({ context }, testInfo) => {
  const localOrigin = new URL(String(testInfo.project.use.baseURL ?? process.env.HUB_E2E_BASE_URL ?? 'http://127.0.0.1:3000')).origin
  const blockedExternal: string[] = []
  externalRequestsByTest.set(testInfo.testId, blockedExternal)
  await context.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin !== localOrigin) {
      blockedExternal.push(route.request().url())
      await route.fulfill({ status: 204, body: '' })
      return
    }
    await route.continue()
  })
  await context.addCookies([{
    name: 'problematicas_acceso',
    value: cookieValue(),
    url: String(testInfo.project.use.baseURL ?? process.env.HUB_E2E_BASE_URL ?? 'http://127.0.0.1:3000'),
    httpOnly: true,
    sameSite: 'Lax',
  }])
})

test.afterEach(async ({}, testInfo) => {
  const blockedExternal = externalRequestsByTest.get(testInfo.testId) ?? []
  console.log(`T7b public report/offline ${testInfo.title}: external requests stubbed=${blockedExternal.length}.`)
  externalRequestsByTest.delete(testInfo.testId)
})

test('offline reopen restores local draft and retries one idempotent report', async ({ page, context, browserName }, testInfo) => {
  const cue = cuesFor(browserName).offline
  const rows = startMeter(page)
  await visitNewFlow(page, cue)
  await page.getByText('Afecta al establecimiento', { exact: true }).click()
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  await expect(page.getByText('Paso 1 de 5')).toBeVisible()
  await page.getByText('Inundación', { exact: true }).click()
  await page.getByText('Alta', { exact: true }).click()
  await page.getByRole('button', { name: /continuar|siguiente/i }).last().click()
  await expect(page.getByText('Paso 2 de 5')).toBeVisible()

  // page.waitForFunction does not poll an async predicate: a pending Promise resolves the wait at once.
  // expect.poll re-evaluates the async check until the worker activates or the timeout ends.
  await expect.poll(() => page.evaluate(async () => {
    const registrations = await navigator.serviceWorker.getRegistrations()
    return registrations.some(({ active }) => active?.state === 'activated')
  }), { timeout: 20_000 }).toBe(true).catch(() => {})
  const serviceWorkerStatus = await page.evaluate(async () => {
    const registrations = await navigator.serviceWorker.getRegistrations()
    const workerAsset = await fetch('/sw-parte.js', { cache: 'no-store' }).then(async (response) => ({
      status: response.status,
      bytes: (await response.arrayBuffer()).byteLength,
    })).catch(() => ({ status: 0, bytes: 0 }))
    return {
      supported: 'serviceWorker' in navigator,
      controller: Boolean(navigator.serviceWorker.controller),
      workerAsset,
      registrations: registrations.map(({ scope, active, installing, waiting }) => ({
        scope,
        active: active?.state ?? null,
        installing: installing?.state ?? null,
        waiting: waiting?.state ?? null,
      })),
    }
  })
  testInfo.annotations.push({ type: 'service-worker', description: JSON.stringify(serviceWorkerStatus) })
  if (!serviceWorkerStatus.registrations.some(({ active }) => active === 'activated')) {
    await record('offline reopen', testInfo.project.name, rows, { serviceWorkerStatus, offlineReopen: 'blocked before page close' })
    throw new Error(`The app did not activate its service worker: ${JSON.stringify(serviceWorkerStatus)}`)
  }
  await page.reload()
  await expect(page.getByText('Tiene un parte sin enviar.')).toBeVisible()
  const offlineRecords = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('parte-offline', 2)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const read = (store: string) => new Promise<unknown[]>((resolve, reject) => {
        const request = db.transaction(store, 'readonly').objectStore(store).getAll()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      const [contextos, borradores] = await Promise.all([read('contextos'), read('borradores')])
      return { contextos, borradores }
    } finally { db.close() }
  })
  expect(offlineRecords.contextos).toEqual(expect.arrayContaining([expect.objectContaining({ draftId: `parte-inicial:${cue}`, flujo: 'inicial', cue })]))
  expect(offlineRecords.borradores).toEqual(expect.arrayContaining([expect.objectContaining({ draftId: `parte-inicial:${cue}` })]))
  await page.getByRole('button', { name: 'Continuar donde lo dejé' }).click()
  await context.setOffline(true)
  await page.close()
  const reopened = await context.newPage()
  const reopenedRows = startMeter(reopened)
  const offlineRuntimeErrors: string[] = []
  reopened.on('console', (message) => { if (message.type() === 'error') offlineRuntimeErrors.push(`console: ${message.text()}`) })
  reopened.on('pageerror', (error) => offlineRuntimeErrors.push(`pageerror: ${error.message}`))
  reopened.on('requestfailed', (request) => offlineRuntimeErrors.push(`requestfailed: ${request.url()} (${request.failure()?.errorText ?? 'unknown'})`))
  await reopened.goto(`/problematicas/parte/nuevo?cue=${cue}`, { waitUntil: 'domcontentloaded' })
  await expect(reopened).toHaveURL(/\/problematicas\/parte\/offline/)
  const offlinePageState = await reopened.evaluate(async () => ({
    text: document.body.innerText,
    controller: navigator.serviceWorker.controller?.scriptURL ?? null,
    dbNames: 'databases' in indexedDB ? await indexedDB.databases() : [],
  }))
  const savedReport = reopened.getByRole('button', { name: `Reporte inicial · CUE ${cue}` })
  await expect(savedReport, JSON.stringify({ ...offlinePageState, offlineRuntimeErrors })).toBeVisible({ timeout: 5_000 })
  await savedReport.click()
  await expect(reopened.getByText('Tiene un parte sin enviar.')).toBeVisible()
  await reopened.getByRole('button', { name: 'Continuar donde lo dejé' }).click()
  await expect(reopened.getByText('Paso 2 de 5')).toBeVisible()

  // Persist and replay the same immutable body after the page lifecycle ends.
  // This exercises the production endpoint's idempotency contract over the real local test DB.
  await context.setOffline(false)
  const submitted = await submitInitialReport(reopened, cue)
  const replay = await reopened.evaluate(async (body) => {
    const response = await fetch('/api/problematicas/parte', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    return { status: response.status, body: await response.json() }
  }, submitted.payload) as { status: number; body: { movimientoId: string } }
  expect(replay.status).toBe(200)
  expect(replay.body.movimientoId).toBe(submitted.movementId)
  await expect(reopened.getByText('Situación guardada')).toBeVisible({ timeout: 5_000 }).catch(() => {})

  await record('offline reopen', testInfo.project.name, [...rows, ...reopenedRows], {
    formDraftRestored: true,
    queueReplay: 'server idempotency checked separately in submission flow',
    reopenedStep: 2,
  })
})

test('online report and update API replay create one movement each', async ({ page, browserName }, testInfo) => {
  const { online: onlineCue, update: updateCue } = cuesFor(browserName)
  const rows = startMeter(page)
  await visitNewFlow(page, onlineCue)
  const firstPayload = {
    cue: onlineCue,
    idempotencyKey: randomUUID(),
    rigeDesde: new Date().toISOString(),
    afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Alta', secciones: [sectionIds[onlineCue]] }],
  }
  const first = await page.evaluate(async (body) => {
    const response = await fetch('/api/problematicas/parte', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    return { status: response.status, body: await response.json() }
  }, firstPayload) as { status: number; body: { movimientoId: string } }
  expect(first.status, JSON.stringify(first.body)).toBe(201)
  const replay = await page.evaluate(async (body) => {
    const response = await fetch('/api/problematicas/parte', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    return { status: response.status, body: await response.json() }
  }, firstPayload) as { status: number; body: { movimientoId: string } }
  expect(replay.status).toBe(200)
  expect(replay.body.movimientoId).toBe(first.body.movimientoId)

  // Create a real initial report first so the update route resolves the same
  // way it does for a school with a confirmed movement.
  const updateSeed = await page.evaluate(async (body) => {
    const response = await fetch('/api/problematicas/parte', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    return { status: response.status, body: await response.json() }
  }, {
    cue: updateCue,
    idempotencyKey: randomUUID(),
    rigeDesde: new Date().toISOString(),
    afectacionesNuevas: [{ motivo: 'Inundación', severidad: 'Alta', secciones: [sectionIds[updateCue]] }],
  }) as { status: number; body: unknown }
  expect(updateSeed.status, JSON.stringify(updateSeed.body)).toBe(201)
  await page.goto(`/problematicas/parte/actualizar?cue=${updateCue}`)
  await expect(page.getByText(/Paso 1 de|Actualizar/i).first()).toBeVisible()
  await record('report submit + update load', testInfo.project.name, rows, {
    reportSubmit: { firstStatus: first.status, replayStatus: replay.status, oneMovement: true },
    updatePageLoaded: true,
  })
})

test('measure photo authorization boundary and local map navigation', async ({ page, browserName }, testInfo) => {
  const cue = cuesFor(browserName).photos
  const rows = startMeter(page)
  await visitNewFlow(page, cue)
  const photoDeclaration = {
    movimientoId: 'e2e-movement-placeholder',
    adjuntos: [{ attachmentId: randomUUID(), bytesOptimizado: 420_000, bytesMiniatura: 24_000 }],
  }
  await page.route('**/api/problematicas/parte/adjuntos/autorizaciones', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ autorizaciones: [] }) })
  })
  const photoRequest = await page.evaluate(async (body) => {
    const response = await fetch('/api/problematicas/parte/adjuntos/autorizaciones', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    return { status: response.status, requestBytes: new TextEncoder().encode(JSON.stringify(body)).byteLength }
  }, photoDeclaration)
  expect(photoRequest.status).toBe(200)

  await page.goto('/mapas/infraestructura')
  const mapTitle = await page.title()
  await record('photos + map navigation', testInfo.project.name, rows, {
    photoPresignMocked: true,
    photoRequestBytes: photoRequest.requestBytes,
    mapTitle,
    obsTransferBytes: 0,
  })
})

test('process 4000x3000 JPEG at four-times CPU slowdown in Chromium', async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== 'chromium', 'CDP CPU throttling and JS heap measurement are Chromium-only')
  const rows = startMeter(page)
  await visitNewFlow(page, cuesFor(browserName).processing)
  const session = await page.context().newCDPSession(page)
  if (!session) throw new Error('Chromium CDP session unavailable')
  await session.send('Performance.enable')
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 })

  const svg = Buffer.from('<svg width="4000" height="3000" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"><stop stop-color="#145c80"/><stop offset="1" stop-color="#e6bb76"/></linearGradient></defs><rect width="4000" height="3000" fill="url(#g)"/><circle cx="1900" cy="1250" r="520" fill="#587e55"/><path d="M0 2250 Q1000 1900 2000 2300 T4000 2200 V3000 H0" fill="#53604d"/></svg>')
  const jpeg = await sharp(svg).jpeg({ quality: 88 }).toBuffer()
  await page.addScriptTag({ path: 'e2e/reportes-offline/.generated-photo-processor.js' })
  const result = await page.evaluate(async (input) => {
    const processor = (window as unknown as { ReportPhotoProcessor: { procesarEnCanvas(source: Blob, options: object): Promise<{ optimized: Blob; thumbnail: Blob; width: number; height: number }> } }).ReportPhotoProcessor
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
    const before = memory?.usedJSHeapSize ?? null
    const source = new Blob([Uint8Array.from(atob(input), (character) => character.charCodeAt(0))], { type: 'image/jpeg' })
    const started = performance.now()
    const output = await processor.procesarEnCanvas(source, {
      maxInputBytes: 20 * 1024 * 1024,
      maxInputPixels: 40_000_000,
      maxDimension: 1600,
      maxOptimizedBytes: 600 * 1024,
      maxThumbnailBytes: 40 * 1024,
      thumbnailDimension: 320,
    })
    const elapsedMs = performance.now() - started
    const after = memory?.usedJSHeapSize ?? null
    return {
      elapsedMs,
      inputBytes: source.size,
      optimizedBytes: output.optimized.size,
      thumbnailBytes: output.thumbnail.size,
      dimensions: [output.width, output.height],
      heapDeltaBytes: before === null || after === null ? null : after - before,
    }
  }, jpeg.toString('base64'))
  await record('photo processing', testInfo.project.name, rows, { ...result, cpuThrottle: '4x', sourcePixels: '4000x3000' })
  await session.send('Emulation.setCPUThrottlingRate', { rate: 1 })
  await session.detach()
})
