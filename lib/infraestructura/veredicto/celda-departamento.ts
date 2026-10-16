import { referencia, versionReferencia } from '@/lib/infraestructura/datasets/memoria'
// Asignación de celdas 0.1° (ver lib/infraestructura/riesgo/celda.ts) a
// departamentos de Corrientes. La clave de celda es `lat_lon` con 1 decimal, así
// que la clave ya es el centro de la celda: ese punto es el que se testea
// contra los polígonos.
//
// Geometría: ray-casting (par/impar) sobre los anillos de cada polígono, sin
// dependencias. Con el criterio par/impar sumado a TODOS los anillos de un
// polígono (exterior y huecos), un punto dentro de un hueco queda fuera.

import { normalizarNombreDepartamento } from '@/lib/mapas/normalizar-departamento'


type Posicion = [number, number] // [lon, lat]
type Anillo = Posicion[]
type Poligono = Anillo[]

export type FeatureCollectionDepartamentos = {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    properties: { nombre: string }
    geometry:
      | { type: 'Polygon'; coordinates: Poligono }
      | { type: 'MultiPolygon'; coordinates: Poligono[] }
  }>
}

type DepartamentoGeo = { id: string; poligonos: Poligono[] }

let cacheVersion = ''
let cacheDepartamentos: DepartamentoGeo[] | null = null

function cruzaRayo(lon: number, lat: number, anillo: Anillo): boolean {
  let dentro = false
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i]!
    const [xj, yj] = anillo[j]!
    const cruza = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (cruza) dentro = !dentro
  }
  return dentro
}

function dentroDePoligono(lon: number, lat: number, poligono: Poligono): boolean {
  let cruces = false
  for (const anillo of poligono) {
    if (cruzaRayo(lon, lat, anillo)) cruces = !cruces
  }
  return cruces
}

function indexarDepartamentos(coleccion: FeatureCollectionDepartamentos): DepartamentoGeo[] {
  return coleccion.features.map((feature) => ({
    id: normalizarNombreDepartamento(feature.properties.nombre),
    poligonos:
      feature.geometry.type === 'Polygon'
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates,
  }))
}

function departamentoEnIndice(
  departamentos: DepartamentoGeo[],
  lat: number,
  lon: number,
): string | null {
  for (const departamento of departamentos) {
    if (departamento.poligonos.some((poligono) => dentroDePoligono(lon, lat, poligono))) {
      return departamento.id
    }
  }
  return null
}

function coordenadasDeCelda(geometryRef: string): { lat: number; lon: number } | null {
  const partes = geometryRef.split('_')
  if (partes.length !== 2) return null
  const lat = Number(partes[0])
  const lon = Number(partes[1])
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  return { lat, lon }
}

function cargarDepartamentos(): DepartamentoGeo[] {
  const version = versionReferencia('departamentos')
  if (cacheDepartamentos === null || version !== cacheVersion) {
    const coleccion = referencia<FeatureCollectionDepartamentos>('departamentos')
    cacheVersion = version
    cacheDepartamentos = indexarDepartamentos(coleccion)
  }
  return cacheDepartamentos
}

/** Variante pura: id normalizado del departamento que contiene el punto, o null. */
export function departamentoDeCoordenadaEn(
  coleccion: FeatureCollectionDepartamentos,
  lat: number,
  lon: number,
): string | null {
  return departamentoEnIndice(indexarDepartamentos(coleccion), lat, lon)
}

/** Variante pura sobre una colección: departamento de la celda `geometryRef`, o null. */
export function departamentoDeCeldaEn(
  coleccion: FeatureCollectionDepartamentos,
  geometryRef: string,
): string | null {
  const punto = coordenadasDeCelda(geometryRef)
  if (punto === null) return null
  return departamentoDeCoordenadaEn(coleccion, punto.lat, punto.lon)
}

/** Ids normalizados de todos los departamentos del dataset departamental publicado, únicos y ordenados. */
export function listarDepartamentos(): string[] {
  return [...new Set(cargarDepartamentos().map((departamento) => departamento.id))].sort()
}

/** Departamento (id normalizado) que contiene el punto, usando el dataset departamental publicado. */
export function departamentoDeCoordenada(lat: number, lon: number): string | null {
  return departamentoEnIndice(cargarDepartamentos(), lat, lon)
}

/** Departamento de una celda `geometryRef` (`lat_lon`, 0.1°), usando el dataset departamental publicado. */
export function departamentoDeCelda(geometryRef: string): string | null {
  const punto = coordenadasDeCelda(geometryRef)
  if (punto === null) return null
  return departamentoDeCoordenada(punto.lat, punto.lon)
}
