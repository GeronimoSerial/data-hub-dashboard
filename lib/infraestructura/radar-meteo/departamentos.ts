import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GRID_VERSION } from './grilla'

export const VERSION_GEOGRAFIA = 'ign-corrientes-2026-09-27'
type Punto = [number, number]
type Anillo = Punto[]
type Poligono = Anillo[]
type Geometria = Poligono[]
type Feature = { properties: { id?: string | number; nombre?: string }; geometry: { type: string; coordinates: unknown } }
export type Departamento = { id: string; nombre: string; geometria: Geometria; centro: Punto }
export type AsignacionCelda = { celdaId: string; departamentoId: string; peso: number; fallback: boolean; gridVersion: string; geoVersion: string }
let departamentosCache: Departamento[] | undefined
let asignacionCache: Map<string, AsignacionCelda> | undefined

function geometriaPoligonos(tipo: string, coords: unknown): Geometria {
  if (tipo === 'Polygon') return [coords as Poligono]
  if (tipo === 'MultiPolygon') return coords as Geometria
  return []
}
function contiene(lon: number, lat: number, anillo: Anillo): boolean {
  let dentro = false
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i], [xj, yj] = anillo[j]
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro
  }
  return dentro
}
function distanciaSegmentoKm(lon: number, lat: number, a: Punto, b: Punto): number {
  const escalaX = 111.32 * Math.cos((lat * Math.PI) / 180)
  const ax = (a[0] - lon) * escalaX, ay = (a[1] - lat) * 110.574
  const bx = (b[0] - lon) * escalaX, by = (b[1] - lat) * 110.574
  const dx = bx - ax, dy = by - ay
  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(ax + t * dx, ay + t * dy)
}
function distanciaGeometriaKm(lon: number, lat: number, depto: Departamento): number {
  if (dentroDepartamento(lon, lat, depto)) return 0
  let minima = Infinity
  for (const poligono of depto.geometria) for (const anillo of poligono) {
    for (let i = 0; i < anillo.length; i++) minima = Math.min(minima, distanciaSegmentoKm(lon, lat, anillo[i], anillo[(i + 1) % anillo.length]))
  }
  return minima
}
function dentroDepartamento(lon: number, lat: number, depto: Departamento): boolean {
  return depto.geometria.some((poligono) => contiene(lon, lat, poligono[0]) && !poligono.slice(1).some((h) => contiene(lon, lat, h)))
}
function cargarDepartamentos(): Departamento[] {
  if (departamentosCache) return departamentosCache
  const archivo = join(process.cwd(), 'public/data/departamentos-corrientes-georef-2026-09-27.geojson')
  const geo = JSON.parse(readFileSync(archivo, 'utf8')) as { features: Feature[] }
  departamentosCache = geo.features.map((f, i) => {
    const geometria = geometriaPoligonos(f.geometry.type, f.geometry.coordinates)
    const centroDato = (f.properties as Feature['properties'] & { centroide?: { lon: number; lat: number } }).centroide
    const todos = geometria.flat(2) as Punto[]
    const centro: Punto = centroDato ? [centroDato.lon, centroDato.lat] : [todos.reduce((s, p) => s + p[0], 0) / todos.length, todos.reduce((s, p) => s + p[1], 0) / todos.length]
    return { id: String(f.properties.id ?? i), nombre: f.properties.nombre ?? `Departamento ${i + 1}`, geometria, centro }
  })
  return departamentosCache
}
export function listarDepartamentos(): Departamento[] {
  return cargarDepartamentos()
}
export function obtenerDepartamento(nombre: string): Departamento | undefined {
  return cargarDepartamentos().find((d) => d.nombre.toLocaleLowerCase('es') === nombre.toLocaleLowerCase('es'))
}
export function departamentoQueContienePunto(lat: number, lon: number): Departamento | null {
  return cargarDepartamentos().find((departamento) => dentroDepartamento(lon, lat, departamento)) ?? null
}
export function asignarCeldasADepartamentos(celdas: Array<{ id: string; latModelo?: number; lonModelo?: number; lat: number; lon: number }>): AsignacionCelda[] {
  if (!asignacionCache) asignacionCache = new Map()
  const deptos = cargarDepartamentos()
  const nuevas = celdas.filter((c) => !asignacionCache!.has(c.id))
  const asignadas = nuevas.map((celda) => {
    const lon = celda.lonModelo ?? celda.lon, lat = celda.latModelo ?? celda.lat
    const candidatas = deptos.filter((d) => dentroDepartamento(lon, lat, d))
    const departamento = candidatas[0] ?? deptos.reduce((mejor, d) => distanciaGeometriaKm(lon, lat, d) < distanciaGeometriaKm(lon, lat, mejor) ? d : mejor)
    return { celdaId: celda.id, departamentoId: departamento.id, peso: 1, fallback: candidatas.length === 0, gridVersion: GRID_VERSION, geoVersion: VERSION_GEOGRAFIA }
  })
  for (const fila of asignadas) asignacionCache.set(fila.celdaId, fila)
  const filas = celdas.map((c) => asignacionCache!.get(c.id)!)
  const cantidad = new Map<string, number>()
  for (const fila of filas) cantidad.set(fila.departamentoId, (cantidad.get(fila.departamentoId) ?? 0) + 1)
  return filas.map((fila) => ({ ...fila, peso: 1 / (cantidad.get(fila.departamentoId) ?? 1) }))
}
