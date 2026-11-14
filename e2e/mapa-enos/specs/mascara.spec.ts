import { cuentaPorClave } from '../cuentas-qa'
import { esperarMapaListo, expect, test } from '../fixtures/base'

test.use({ storageState: cuentaPorClave('admin').storageStatePath })

const CAPA_MASCARA = 'infra-mascara-provincia'
// Dataset publicado por seed/datasets.ts desde public/data/mascara-corrientes.geojson: un único
// MultiPolygon (el rectángulo del mundo con la provincia recortada como hueco), 107 polígonos.
const FEATURES_MASCARA = 1
const POLIGONOS_MASCARA = 107

type GanchoPresencia = { capaPresente(id: string): boolean }

test('la máscara provincial está dibujada y su dataset se publica como GeoJSON', async ({ page }) => {
  await page.goto('/mapas/infraestructura')
  await esperarMapaListo(page)

  await expect
    .poll(() => page.evaluate((id) => (window as unknown as { __mapaE2E: GanchoPresencia }).__mapaE2E.capaPresente(id), CAPA_MASCARA))
    .toBe(true)

  const respuesta = await page.request.get('/api/mapas/infraestructura/datasets/mascara')
  expect(respuesta.status()).toBe(200)
  const documento = (await respuesta.json()) as {
    type: string
    features: Array<{ geometry: { type: string; coordinates: unknown[] } }>
  }
  expect(documento.type).toBe('FeatureCollection')
  expect(documento.features).toHaveLength(FEATURES_MASCARA)
  expect(documento.features[0].geometry.type).toBe('MultiPolygon')
  expect(documento.features[0].geometry.coordinates).toHaveLength(POLIGONOS_MASCARA)
})
