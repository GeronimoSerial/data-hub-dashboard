import { describe, expect, it } from 'vitest'
import { normalizeUploadedMapHtml } from '@/lib/html-map-tiles'

const esri =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'

describe('normalizeUploadedMapHtml', () => {
  it.each([
    'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
  ])('rewrites unsupported raster endpoint %s', (url) => {
    expect(normalizeUploadedMapHtml(`<script>L.tileLayer('${url}')</script>`)).toContain(esri)
  })

  it('updates the common OSM attribution when a tile URL changes', () => {
    const html =
      "L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'})"
    const result = normalizeUploadedMapHtml(html)
    expect(result).toContain('Tiles &copy; Esri')
    expect(result).not.toContain("attribution:'© OpenStreetMap'")
  })

  it('leaves unrelated HTML byte-for-byte unchanged', () => {
    const html = '<h1>Informe sin mapa</h1>'
    expect(normalizeUploadedMapHtml(html)).toBe(html)
  })
})
