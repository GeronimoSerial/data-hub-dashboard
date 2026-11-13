import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type Cookie } from '@playwright/test'
import { captura, conPagina, cookiesDeSesion } from './sesion'

// Runs after the empty-database specs of the `manaos` project (see the project order in playwright.config.ts):
// it publishes the committed Manaos datasets with `region:cargar` and checks the map and the Situation Center.
const MAPA = '/mapas/infraestructura'
const raiz = process.cwd()
const leer = (relativa: string) => JSON.parse(readFileSync(path.join(raiz, relativa), 'utf8'))
const localizaciones = leer('data/regiones/manaos/localizaciones.json')
const resumen = localizaciones.metadatos.resumen as { total: number; conCoordenadas: number; sinCoordenadas: number }
const conCoordenadas = (localizaciones.datos as Array<{ cueAnexo: string; departamento: string; lat: number | null; lon: number | null }>).filter((f) => f.lat !== null)
const sinCoordenadas = (localizaciones.datos as Array<{ cueAnexo: string; lat: number | null }>).filter((f) => f.lat === null)

test.describe.configure({ mode: 'serial' })

let cookies: Cookie[] = []

test.beforeAll(async ({ browser, baseURL }) => {
  cookies = await cookiesDeSesion(browser, baseURL!)
})

interface Padron {
  escuelas: Array<{ cueAnexo: string; lat: number; lon: number; estado: string }>
  sinUbicacion: Array<{ cueAnexo: string }>
  totalPadron: number
}

test('(1) the Manaos database starts without schools', async ({ browser, baseURL }) => {
  await conPagina(browser, baseURL!, cookies, async (page) => {
    const body = (await (await page.request.get('/api/mapas/infraestructura/escuelas')).json()) as Padron
    expect(body.totalPadron, 'this spec must run after the empty-database specs').toBe(0)
  })
})

test('(2) region:cargar publishes the Manaos datasets (schools, municipalities, mask, river stations) and repeating it creates no new version', () => {
  const url = process.env.REGION_PROOF_MANAOS_DATABASE_URL
  expect(url, 'REGION_PROOF_MANAOS_DATABASE_URL is set by run.mjs').toBeTruthy()
  const cargar = () => spawnSync(process.execPath, ['scripts/region-cargar.mjs', 'manaos'], {
    cwd: raiz,
    env: { ...process.env, DATABASE_URL: url!, REGION: 'manaos' },
    encoding: 'utf8',
    timeout: 120_000,
  })
  const primera = cargar()
  expect(primera.status, primera.stderr).toBe(0)
  const lineas = primera.stdout.trim().split('\n')
  expect(lineas.map((l) => l.replace(/ version [0-9a-f]{64}$/, ''))).toEqual(['dataset localizaciones:', 'dataset departamentos:', 'dataset mascara:', 'dataset estacoes-ana:'])
  expect(cargar().stdout).toBe(primera.stdout)
})

test('(3) the school API counts every school and returns coordinates only for the confident ones', async ({ browser, baseURL }) => {
  await conPagina(browser, baseURL!, cookies, async (page) => {
    const respuesta = await page.request.get('/api/mapas/infraestructura/escuelas')
    expect(respuesta.status()).toBe(200)
    const body = (await respuesta.json()) as Padron
    expect(body.totalPadron).toBe(resumen.total)
    expect(body.escuelas).toHaveLength(resumen.conCoordenadas)
    expect(body.sinUbicacion).toHaveLength(resumen.sinCoordenadas)
    const dibujada = conCoordenadas[0]
    expect(body.escuelas.find((e) => e.cueAnexo === dibujada.cueAnexo)).toMatchObject({ lat: dibujada.lat, lon: dibujada.lon, estado: 'sin_afectacion_reportada' })
    const sinPunto = sinCoordenadas[0]
    expect(body.sinUbicacion.map((e) => e.cueAnexo)).toContain(sinPunto.cueAnexo)
    expect(body.escuelas.map((e) => e.cueAnexo)).not.toContain(sinPunto.cueAnexo)
  })
})

test('(3b) the totals count the schools without coordinates in their municipality', async ({ browser, baseURL }) => {
  await conPagina(browser, baseURL!, cookies, async (page) => {
    const respuesta = await page.request.get('/api/mapas/infraestructura/totales')
    expect(respuesta.status()).toBe(200)
    const body = (await respuesta.json()) as {
      departamentos: Array<{ departamento: string; totalEscuelas: number; escuelasAfectadas: number }>
      provincia: { totalEscuelas: number; escuelasAfectadas: number }
    }
    expect(body.provincia).toMatchObject({ totalEscuelas: resumen.total, escuelasAfectadas: 0 })
    const manaus = (localizaciones.datos as Array<{ departamento: string }>).filter((f) => f.departamento === 'Manaus').length
    expect(body.departamentos.find((d) => d.departamento === 'MANAUS')).toMatchObject({ totalEscuelas: manaus, escuelasAfectadas: 0 })
    expect(body.departamentos.reduce((suma, d) => suma + d.totalEscuelas, 0)).toBe(resumen.total)
  })
})

test('(4) the municipality layer and the mask come from the published Manaos datasets', async ({ browser, baseURL }) => {
  await conPagina(browser, baseURL!, cookies, async (page) => {
    const departamentos = await page.request.get('/api/mapas/infraestructura/datasets/departamentos')
    expect(departamentos.status()).toBe(200)
    expect(((await departamentos.json()) as { features: unknown[] }).features).toHaveLength(12)
    const estatico = await page.request.get('/data/municipios-manaos.geojson')
    expect(estatico.status()).toBe(200)
    expect(((await estatico.json()) as { features: unknown[] }).features).toHaveLength(12)
    expect((await page.request.get('/data/mascara-manaos.geojson')).status()).toBe(200)
  })
})

test('(5) the Manaos map draws without errors and the Situation Center still reports the missing river data', async ({ browser, baseURL }) => {
  await conPagina(browser, baseURL!, cookies, async (page) => {
    const errores: string[] = []
    page.on('pageerror', (error) => errores.push(error.message))
    await page.goto(MAPA)
    await expect(page.locator('canvas.maplibregl-canvas').first()).toBeVisible({ timeout: 60_000 })
    // The statistics table lists the schools drawn on the map per municipality; the rest are counted only in the totals.
    await page.getByRole('tab', { name: 'Estatísticas' }).click()
    const dibujadasManaus = conCoordenadas.filter((f) => f.departamento === 'Manaus').length
    const fila = page.getByRole('row').filter({ hasText: 'Manaus' }).first()
    await expect(fila.getByRole('rowheader')).toHaveText('Manaus')
    await expect(fila.getByRole('cell').nth(0)).toHaveText(String(dibujadasManaus))
    await captura(page, 'manaos-mapa-escuelas')
    expect(errores).toEqual([])
    await page.goto('/situacion')
    await expect(page.getByRole('heading', { name: 'Centro de Situação', level: 1 })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText('Sem dados', { exact: true }).first()).toBeVisible()
    // The resource card of the map carries the region name, not the Corrientes one (recurso-seed.ts).
    expect(await page.locator('body').innerText()).not.toContain('Corrientes')
    await captura(page, 'manaos-situacion-escuelas')
  })
})
