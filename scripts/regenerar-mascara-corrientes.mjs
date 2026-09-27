// Script de un solo uso: regenera `public/data/mascara-corrientes.geojson` a
// partir del GeoJSON oficial de Georef (`public/data/departamentos-corrientes-georef-2026-09-27.geojson`),
// en vez de la geometría vieja/no oficial (`public/data/departamentos-corrientes.geojson`,
// prototipo de E2, conservada sin usar).
//
// Qué hace:
//   1. Disuelve (union) los 25 departamentos en un solo contorno de la
//      provincia.
//   2. Simplifica ese contorno con una tolerancia fija (documentada abajo)
//      para no arrastrar los ~1744 vértices originales a un overlay
//      puramente decorativo.
//   3. Resta ese contorno de un rectángulo que cubre el mundo
//      (-180/-85 a 180/85, mismo rectángulo que ya usaba la máscara vieja),
//      dejando la provincia como "agujero" — el mismo patrón que ya
//      documenta `lib/mapas/departamentos.ts` (antes generado con mapshaper
//      `-dissolve` + `-rectangle` + `-erase`; acá se resuelve con las
//      operaciones booleanas de Turf porque mapshaper no está instalado).
//
// Uso: node scripts/regenerar-mascara-corrientes.mjs
// (no se ejecuta en build/CI; el resultado ya versionado en
// public/data/mascara-corrientes.geojson es lo que consume la app).
//
// Dependencias: @turf/union, @turf/difference, @turf/helpers — agregadas
// como devDependencies sólo para este script (no se usan en runtime; el
// bundle de la app no las importa).
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { union } from '@turf/union'
import { difference } from '@turf/difference'
import { featureCollection, polygon } from '@turf/helpers'

const ENTRADA = path.resolve(
  process.cwd(),
  'public/data/departamentos-corrientes-georef-2026-09-27.geojson',
)
const SALIDA = path.resolve(process.cwd(), 'public/data/mascara-corrientes.geojson')

// Tolerancia de simplificación, en grados de longitud/latitud (~ metros a
// esta latitud: 1° ≈ 111 km, así que 0.0015° ≈ 165 m). Se aplica con un
// Douglas-Peucker casero (sin agregar otra dependencia) sólo sobre el
// contorno ya disuelto, nunca sobre los departamentos originales que sigue
// usando `lib/mapas/departamentos.ts` para el coroplético. Elegida para que
// el archivo resultante quede varias veces más chico que el original sin
// perder la silueta reconocible de la provincia (los tests de
// `departamentos.test.ts` — "deja destapadas las ciudades" / "tapa todo lo
// que está fuera" — verifican que el resultado siga siendo correcto).
const TOLERANCIA_SIMPLIFICACION_GRADOS = 0.0015

const RECTANGULO_MUNDO = polygon([
  [
    [-180, -85],
    [180, -85],
    [180, 85],
    [-180, 85],
    [-180, -85],
  ],
])

function distanciaPuntoSegmento(p, a, b) {
  const [px, py] = p
  const [ax, ay] = a
  const [bx, by] = b
  const dx = bx - ax
  const dy = by - ay
  if (dx === 0 && dy === 0) {
    return Math.hypot(px - ax, py - ay)
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  const projX = ax + t * dx
  const projY = ay + t * dy
  return Math.hypot(px - projX, py - projY)
}

// Douglas-Peucker estándar, aplicado a un anillo (array de [lon, lat],
// cerrado: primer punto === último). Mantiene el primer y último punto.
function simplificarAnillo(anillo, tolerancia) {
  if (anillo.length <= 4) return anillo // triángulo cerrado: nada que simplificar

  function recursivo(puntos) {
    if (puntos.length <= 2) return puntos
    let distMax = 0
    let indiceMax = 0
    const inicio = puntos[0]
    const fin = puntos[puntos.length - 1]
    for (let i = 1; i < puntos.length - 1; i++) {
      const d = distanciaPuntoSegmento(puntos[i], inicio, fin)
      if (d > distMax) {
        distMax = d
        indiceMax = i
      }
    }
    if (distMax > tolerancia) {
      const izquierda = recursivo(puntos.slice(0, indiceMax + 1))
      const derecha = recursivo(puntos.slice(indiceMax))
      return [...izquierda.slice(0, -1), ...derecha]
    }
    return [inicio, fin]
  }

  const sinCerrar = anillo.slice(0, -1)
  const simplificado = recursivo([...sinCerrar, anillo[anillo.length - 1]])
  // Garantiza que el anillo siga cerrado.
  const primero = simplificado[0]
  const ultimo = simplificado[simplificado.length - 1]
  if (primero[0] !== ultimo[0] || primero[1] !== ultimo[1]) {
    simplificado.push(primero)
  }
  return simplificado
}

function simplificarGeometria(geometry, tolerancia) {
  if (geometry.type === 'Polygon') {
    return { ...geometry, coordinates: geometry.coordinates.map((r) => simplificarAnillo(r, tolerancia)) }
  }
  if (geometry.type === 'MultiPolygon') {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((poly) => poly.map((r) => simplificarAnillo(r, tolerancia))),
    }
  }
  throw new Error(`Tipo de geometría inesperado: ${geometry.type}`)
}

function main() {
  const geojson = JSON.parse(readFileSync(ENTRADA, 'utf8'))
  const features = geojson.features.filter((f) => f.geometry)

  if (features.length === 0) {
    throw new Error(`No se encontraron features con geometría en ${ENTRADA}`)
  }

  // Disuelve los 25 departamentos en un solo contorno, uniendo de a uno.
  let disuelto = features[0]
  for (let i = 1; i < features.length; i++) {
    const feature = features[i]
    const resultado = union(featureCollection([disuelto, feature]))
    if (!resultado) {
      throw new Error(`union() devolvió null al fusionar el departamento #${i} (${feature.properties?.nombre})`)
    }
    disuelto = resultado
  }

  const contornoSimplificado = simplificarGeometria(disuelto.geometry, TOLERANCIA_SIMPLIFICACION_GRADOS)
  const featureSimplificada = { type: 'Feature', properties: {}, geometry: contornoSimplificado }

  const mascara = difference(featureCollection([RECTANGULO_MUNDO, featureSimplificada]))
  if (!mascara) {
    throw new Error('difference() devolvió null al recortar la provincia del rectángulo mundial')
  }

  const salida = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: mascara.geometry }],
  }

  writeFileSync(SALIDA, JSON.stringify(salida))
  console.log(`Escrito ${SALIDA}`)
  console.log(`Tamaño: ${(JSON.stringify(salida).length / 1024).toFixed(1)} KB`)
}

main()
