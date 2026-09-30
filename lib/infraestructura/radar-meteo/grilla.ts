import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const GRID_VERSION = 'corrientes-0.2-v1'
export type CeldaRadar = { id: string; row: number; col: number; lat: number; lon: number }
type Punto = [number, number]
type Anillo = Punto[]
type Poligono = Anillo[]

function enAnillo(lon: number, lat: number, anillo: Anillo): boolean {
  let dentro = false
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i], [xj, yj] = anillo[j]
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro
  }
  return dentro
}

function distanciaSegmentoKm(lon: number, lat: number, a: Punto, b: Punto): number {
  const x = (v: number) => v * 111.32 * Math.cos((lat * Math.PI) / 180)
  const y = (v: number) => v * 110.574
  const ax = x(a[0] - lon), ay = y(a[1] - lat), bx = x(b[0] - lon), by = y(b[1] - lat)
  const dx = bx - ax, dy = by - ay
  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(ax + t * dx, ay + t * dy)
}

function enGeometria(lon: number, lat: number, poligonos: Poligono[], bufferKm: number): boolean {
  for (const poligono of poligonos) {
    const dentro = enAnillo(lon, lat, poligono[0]) && !poligono.slice(1).some((h) => enAnillo(lon, lat, h))
    if (dentro) return true
    if (bufferKm > 0 && poligono.some((anillo) => anillo.some((p, i) => distanciaSegmentoKm(lon, lat, p, anillo[(i + 1) % anillo.length]) <= bufferKm))) return true
  }
  return false
}

function cargarPoligonos(): Poligono[] {
  const archivo = join(process.cwd(), 'public/data/departamentos-corrientes-georef-2026-09-27.geojson')
  const geo = JSON.parse(readFileSync(archivo, 'utf8')) as { features: Array<{ geometry: { type: string; coordinates: unknown } }> }
  const salida: Poligono[] = []
  for (const f of geo.features) {
    const g = f.geometry
    if (g.type === 'Polygon') salida.push(g.coordinates as Poligono)
    else if (g.type === 'MultiPolygon') salida.push(...(g.coordinates as Poligono[]))
  }
  return salida
}

export function generarGrilla(opts: { espaciado?: number; bufferKm?: number } = {}): CeldaRadar[] {
  const espaciado = opts.espaciado ?? 0.2
  const bufferKm = opts.bufferKm ?? 10
  if (!(espaciado > 0)) throw new Error('El espaciado debe ser positivo')
  const poligonos = cargarPoligonos()
  const todos = poligonos.flat(2)
  const minLon = Math.min(...todos.map((p) => p[0])), maxLon = Math.max(...todos.map((p) => p[0]))
  const minLat = Math.min(...todos.map((p) => p[1])), maxLat = Math.max(...todos.map((p) => p[1]))
  const celdas: CeldaRadar[] = []
  for (let row = Math.floor(minLat / espaciado) - 1; row <= Math.ceil(maxLat / espaciado) + 1; row++) {
    for (let col = Math.floor(minLon / espaciado) - 1; col <= Math.ceil(maxLon / espaciado) + 1; col++) {
      const lat = row * espaciado, lon = col * espaciado
      if (enGeometria(lon, lat, poligonos, bufferKm)) celdas.push({ id: `r${row}c${col}`, row, col, lat, lon })
    }
  }
  return celdas
}
