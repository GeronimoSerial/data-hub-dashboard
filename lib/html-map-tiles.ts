const ESRI_WORLD_STREETS =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'

const ESRI_ATTRIBUTION =
  'Tiles &copy; Esri &mdash; Sources: Esri, TomTom, Garmin, FAO, NOAA, USGS, OpenStreetMap contributors, and the GIS User Community'

const OSM_RASTER_URL =
  /https?:\/\/(?:\{s\}\.|[abc]\.)?tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/gi

const CARTO_RASTER_URL =
  /https?:\/\/(?:\{s\}\.|[abcd]\.)?basemaps\.cartocdn\.com\/(?:rastertiles\/)?(?:voyager|light_all|dark_all)\/\{z\}\/\{x\}\/\{y\}(?:@2x)?\.png/gi

/**
 * Keeps uploaded, self-contained Leaflet reports usable when a public tile
 * endpoint is blocked or starts requiring credentials. This runs both when an
 * HTML file is uploaded and when an existing HTML file is served.
 */
export function normalizeUploadedMapHtml(html: string) {
  const rewritten = html
    .replace(OSM_RASTER_URL, ESRI_WORLD_STREETS)
    .replace(CARTO_RASTER_URL, ESRI_WORLD_STREETS)

  if (rewritten === html) return html

  return rewritten
    .replace(/(?:©|&copy;)\s*OpenStreetMap(?:\s+contributors)?/gi, ESRI_ATTRIBUTION)
    .replace(
      /&copy;\s*<a[^>]+openstreetmap\.org\/copyright[^>]*>OpenStreetMap<\/a>(?:\s+contributors)?(?:\s*&copy;\s*<a[^>]+carto\.com\/attributions[^>]*>CARTO<\/a>)?/gi,
      ESRI_ATTRIBUTION,
    )
}
