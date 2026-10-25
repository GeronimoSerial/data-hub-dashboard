import '@testing-library/jest-dom/vitest'
import { webcrypto } from 'node:crypto'

// jsdom provides randomUUID but not SubtleCrypto; photo tests hash real persisted bytes.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
}

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
}

class DOMRectStub {
  x = 0
  y = 0
  width = 0
  height = 0
  top = 0
  right = 0
  bottom = 0
  left = 0
  toJSON() {
    return {}
  }
}

if (typeof globalThis.DOMRect === 'undefined') {
  globalThis.DOMRect = DOMRectStub as unknown as typeof DOMRect
}
// Fixtures de referencia sólo para tests puros. Producción carga versiones
// publicadas de la DB; no hay fallback a archivos en los lectores reales.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { estadoReferencias } from './lib/infraestructura/datasets/memoria'
import estacionesFixture from './lib/infraestructura/datasets/__fixtures__/estaciones.json'
const geoFixture = JSON.parse(readFileSync(path.join(process.cwd(), 'public/data/departamentos-corrientes-georef-2026-09-27.geojson'), 'utf8'))
const referenciasFixture = estadoReferencias().referencias
referenciasFixture.set('departamentos', { versionId: 'ign-corrientes-2026-09-27', revision: 'ign-corrientes-2026-09-27', documento: geoFixture })
referenciasFixture.set('estaciones-prefectura', { versionId: 'estaciones-prefectura-v2', revision: 'estaciones-prefectura-v2', documento: estacionesFixture.prefectura })
referenciasFixture.set('estaciones-synop', { versionId: 'synop-v1', revision: 'synop-v1', documento: estacionesFixture.synop })
referenciasFixture.set('georef-departamentos', { versionId: 'georef-v1', revision: 'georef-v1', documento: { departamentos: geoFixture.features.map((f: { properties: { id: string; nombre: string } }) => ({ id: f.properties.id, nombre: f.properties.nombre })) } })

estadoReferencias().cargadoEn = Date.now()

import hidrografiaFixture from './lib/infraestructura/datasets/__fixtures__/hidrografia.json'
referenciasFixture.set('tramos-prefectura', { versionId: 'tramos-prefectura-v2', revision: 'v2', documento: hidrografiaFixture.tramos })
referenciasFixture.set('localidades-riberenas-dudosas', { versionId: 'dudosas-v1', revision: 'v1', documento: hidrografiaFixture.dudosas })
referenciasFixture.set('puntos-rio', { versionId: 'puntos-rio-v1', revision: 'v1', documento: hidrografiaFixture.puntos })
for (const estacion of estacionesFixture.prefectura) Object.assign(estacion, { represaAguasArriba: estacion.estacionId === 'pna-ituzaingo' })
