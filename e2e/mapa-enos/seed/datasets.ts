import { readFileSync } from 'node:fs'
import path from 'node:path'
import { guardarVersion } from '@/lib/infraestructura/datasets/repositorio'

// Los datasets que el mapa necesita para montar. Por ahora solo departamentos: sin
// límites provinciales el componente no renderiza el canvas (ver limitesCorrientes).
// Usa el GeoJSON oficial de Georef versionado en el repo, filtrado a cuatro departamentos.
const DEPARTAMENTOS_E2E = ['Capital', 'Goya', 'Paso de los Libres', 'Santo Tomé']
const ARCHIVO_GEOREF = 'public/data/departamentos-corrientes-georef-2026-09-27.geojson'

type FeatureGeoref = { type: 'Feature'; properties: Record<string, unknown>; geometry: unknown }

export async function publicarDatasetsMapa(): Promise<void> {
  const raiz = process.cwd()
  const fuente = JSON.parse(readFileSync(path.join(raiz, ARCHIVO_GEOREF), 'utf8')) as {
    type: 'FeatureCollection'
    features: FeatureGeoref[]
  }
  const features = DEPARTAMENTOS_E2E.map((nombre) => {
    const hallada = fuente.features.find((feature) => feature.properties.nombre === nombre)
    if (!hallada) throw new Error(`Departamento ausente en el GeoJSON de Georef: ${nombre}`)
    const { id, nombre: nombreOficial, centroide } = hallada.properties as {
      id: string
      nombre: string
      centroide: { lat: number; lon: number }
    }
    return {
      type: 'Feature' as const,
      properties: { id, nombre: nombreOficial, centroide: { lat: centroide.lat, lon: centroide.lon } },
      geometry: hallada.geometry,
    }
  })

  await guardarVersion({
    datasetId: 'departamentos',
    nombre: 'Departamentos de Corrientes',
    revision: 'georef-2026-09-27',
    fuente: 'Georef Argentina (IGN), filtrado a cuatro departamentos para e2e',
    fechaFuente: '2026-09-27',
    formato: 'features',
    clave: 'properties.id',
    datos: { type: 'FeatureCollection', features },
  })
}
