// Geometría pura (point-in-polygon + distancia punto-contorno), sin
// dependencias externas (nada de turf: son ~60 líneas de ray-casting y
// distancia punto-segmento, no ameritan una dependencia nueva). Usado por
// sanearCoordenadasFueraDeLimites (lib/mapas/natalidad.ts, T5 corrección
// 2026-09-25) para reemplazar el chequeo de bounding box, que dejaba pasar
// puntos lejos de cualquier departamento con tal de caer dentro del
// rectángulo que envuelve a toda la provincia.
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson'

/** [lon, lat], mismo orden que GeoJSON. */
export type Punto = [number, number]

/** Un anillo de polígono: array de [lon,lat], geométricamente cerrado o no (no importa acá). */
type Anillo = Punto[]

/**
 * Ray-casting clásico (even-odd rule) sobre un anillo. Funciona igual para el
 * anillo exterior que para un hueco: quien llama decide la semántica (dentro
 * del exterior Y fuera de todos los huecos == dentro del polígono).
 */
function puntoEnAnillo(punto: Punto, anillo: Anillo): boolean {
  const [px, py] = punto
  let dentro = false
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i]
    const [xj, yj] = anillo[j]
    const cruza = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    if (cruza) dentro = !dentro
  }
  return dentro
}

/** Anillo exterior (rings[0]) menos los huecos (rings[1..]) — semántica GeoJSON estándar. */
function puntoEnPoligono(punto: Punto, anillos: Anillo[]): boolean {
  if (anillos.length === 0) return false
  if (!puntoEnAnillo(punto, anillos[0])) return false
  for (let i = 1; i < anillos.length; i++) {
    if (puntoEnAnillo(punto, anillos[i])) return false // cae en un hueco
  }
  return true
}

/** Point-in-polygon sobre la UNIÓN de todos los features de un FeatureCollection de Polygon/MultiPolygon (con huecos). */
export function puntoDentroDeFeatureCollection(
  punto: Punto,
  fc: FeatureCollection<Polygon | MultiPolygon, unknown>,
): boolean {
  for (const feature of fc.features) {
    const geom = feature.geometry
    if (geom.type === 'Polygon') {
      if (puntoEnPoligono(punto, geom.coordinates as Anillo[])) return true
    } else if (geom.type === 'MultiPolygon') {
      for (const poligono of geom.coordinates as Anillo[][]) {
        if (puntoEnPoligono(punto, poligono)) return true
      }
    }
  }
  return false
}

const RADIO_TIERRA_KM = 6371

function aRadianes(grados: number): number {
  return (grados * Math.PI) / 180
}

/**
 * Proyección equirectangular local (centrada en la latitud del punto de
 * consulta): suficientemente precisa para distancias de unos pocos km dentro
 * de Corrientes (la provincia abarca ~2.5° de latitud, el error de esta
 * aproximación a esa escala es despreciable frente a la tolerancia de 1 km
 * que usa sanearCoordenadasFueraDeLimites).
 */
function proyectarKm(punto: Punto, latRef: number): [number, number] {
  const [lon, lat] = punto
  return [RADIO_TIERRA_KM * aRadianes(lon) * Math.cos(aRadianes(latRef)), RADIO_TIERRA_KM * aRadianes(lat)]
}

/** Distancia (km) de un punto a un segmento [a,b], en el plano proyectado. */
function distanciaPuntoASegmentoKm(punto: Punto, a: Punto, b: Punto): number {
  const latRef = punto[1]
  const [px, py] = proyectarKm(punto, latRef)
  const [ax, ay] = proyectarKm(a, latRef)
  const [bx, by] = proyectarKm(b, latRef)
  const dx = bx - ax
  const dy = by - ay
  const largoAlCuadrado = dx * dx + dy * dy
  const t = largoAlCuadrado > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / largoAlCuadrado)) : 0
  const cx = ax + t * dx
  const cy = ay + t * dy
  return Math.hypot(px - cx, py - cy)
}

function distanciaMinimaAlAnillo(punto: Punto, anillo: Anillo): number {
  let minimo = Infinity
  for (let i = 0; i < anillo.length; i++) {
    const a = anillo[i]
    const b = anillo[(i + 1) % anillo.length]
    minimo = Math.min(minimo, distanciaPuntoASegmentoKm(punto, a, b))
  }
  return minimo
}

/**
 * Distancia (km) de un punto al contorno más cercano (exterior o hueco) de
 * CUALQUIER polígono del FeatureCollection — no la distancia a un punto
 * interior, sino al borde: un punto ya adentro también puede estar a pocos
 * metros del límite. Se usa sólo para puntos que dieron `false` en
 * puntoDentroDeFeatureCollection, para decidir si el hueco es de la
 * geometría simplificada (línea de costa) y no de la escuela.
 */
export function distanciaMinimaAlContorno(
  punto: Punto,
  fc: FeatureCollection<Polygon | MultiPolygon, unknown>,
): number {
  let minimo = Infinity
  for (const feature of fc.features) {
    const geom = feature.geometry
    const poligonos: Anillo[][] = geom.type === 'Polygon' ? [geom.coordinates as Anillo[]] : (geom.coordinates as Anillo[][])
    for (const anillos of poligonos) {
      for (const anillo of anillos) {
        minimo = Math.min(minimo, distanciaMinimaAlAnillo(punto, anillo))
      }
    }
  }
  return minimo
}

/** Bounding box `[[oeste, sur], [este, norte]]` of a Polygon/MultiPolygon, or null when empty. */
export function bboxGeometria(geom: Polygon | MultiPolygon | null): [Punto, Punto] | null {
  if (!geom) return null
  const poligonos = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
  let oeste = Infinity, sur = Infinity, este = -Infinity, norte = -Infinity
  for (const anillos of poligonos) {
    for (const [lon, lat] of anillos[0] ?? []) {
      if (lon < oeste) oeste = lon
      if (lon > este) este = lon
      if (lat < sur) sur = lat
      if (lat > norte) norte = lat
    }
  }
  return Number.isFinite(oeste) ? [[oeste, sur], [este, norte]] : null
}
