import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test as base, expect, type Page } from '@playwright/test'

// Plan de pruebas 4.4: el mapa base sale de un estilo propio servido desde Playwright,
// nunca de tiles.openfreemap.org. Las peticiones que no son del origen de la app y que
// no atiende el estilo local se responden vacías y quedan registradas.
const ESTILO_LOCAL = readFileSync(path.join(__dirname, '..', 'estilo-prueba.json'), 'utf8')
const HOST_MAPA = 'https://tiles.openfreemap.org/**'
const RUTA_ESTILO = /^\/styles\//

type Fixtures = {
  /** Peticiones de terceros respondidas con 204 por el aislamiento genérico. */
  externasBloqueadas: string[]
  /** Peticiones a tiles.openfreemap.org atendidas localmente (estilo propio o 204). */
  estiloLocal: string[]
  aislarLlamadasExternas: void
}

export const test = base.extend<Fixtures>({
  externasBloqueadas: async ({}, usar) => {
    await usar([])
  },
  estiloLocal: async ({}, usar) => {
    await usar([])
  },
  aislarLlamadasExternas: [
    async ({ context, externasBloqueadas, estiloLocal }, usar, testInfo) => {
      const baseURL = testInfo.project.use.baseURL
      if (!baseURL) throw new Error('El proyecto de Playwright no define baseURL')
      const origen = new URL(baseURL).origin

      // Playwright prueba primero las rutas registradas al final. Por eso el aislamiento
      // genérico va después, y deja pasar el host del mapa para que lo atienda la ruta anterior.
      await context.route(HOST_MAPA, async (route) => {
        estiloLocal.push(route.request().url())
        if (RUTA_ESTILO.test(new URL(route.request().url()).pathname)) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: ESTILO_LOCAL })
          return
        }
        await route.fulfill({ status: 204, body: '' })
      })

      await context.route('**/*', async (route) => {
        const url = new URL(route.request().url())
        if (url.hostname === 'tiles.openfreemap.org') {
          await route.fallback()
          return
        }
        if (url.origin !== origen) {
          externasBloqueadas.push(route.request().url())
          await route.fulfill({ status: 204, body: '' })
          return
        }
        await route.continue()
      })

      await usar()
    },
    { auto: true },
  ],
})

export { expect }

/** Espera a que el gancho del mapa exista y que el canvas de MapLibre tenga tamaño. */
export async function esperarMapaListo(page: Page): Promise<void> {
  await page.waitForFunction(() => typeof (window as unknown as { __mapaE2E?: unknown }).__mapaE2E === 'object')
  const canvas = page.locator('.maplibregl-canvas')
  await canvas.waitFor({ state: 'visible' })
  await page.waitForFunction(() => {
    const el = document.querySelector<HTMLCanvasElement>('.maplibregl-canvas')
    return Boolean(el && el.width > 0 && el.height > 0)
  })
}
