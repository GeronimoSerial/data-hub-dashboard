import { readFileSync } from 'node:fs'
import path from 'node:path'
import { guardarVersion } from '@/lib/infraestructura/datasets/repositorio'

// Datasets de referencia que el mapa de infraestructura pide para montar. Sin departamentos
// no hay límites provinciales y el componente no renderiza el canvas (ver limitesCorrientes);
// sin máscara, la provincia queda sin recorte. Localizaciones y estaciones hidrométricas
// se publican en otros pasos del seed.
// Departamentos: GeoJSON oficial de Georef versionado en el repo, filtrado a cuatro departamentos.
const DEPARTAMENTOS_E2E = ['Capital', 'Goya', 'Paso de los Libres', 'Santo Tomé']
const ARCHIVO_GEOREF = 'public/data/departamentos-corrientes-georef-2026-09-27.geojson'
// Máscara: el rectángulo del mundo con la provincia recortada como hueco (ver lib/mapas/departamentos.ts).
const ARCHIVO_MASCARA = 'public/data/mascara-corrientes.geojson'

type FeatureGeoref = { type: 'Feature'; properties: Record<string, unknown>; geometry: unknown }

// Puntos de consulta de caudal: el mismo archivo curado que publica el flujo de datos de
// producción (cauce IGN + validación GloFAS). Accesos y el cálculo de riesgo fallan con
// "Dataset sin publicar: puntos-rio" si falta.
const ARCHIVO_PUNTOS_RIO = 'docs/datos/puntos-rio-cauce-2026-10-18.json'

export async function publicarDatasetsMapa(): Promise<void> {
  await publicarDepartamentos()
  await publicarMascara()
  await publicarPuntosRio()
}

async function publicarPuntosRio(): Promise<void> {
  const curado = JSON.parse(readFileSync(path.join(process.cwd(), ARCHIVO_PUNTOS_RIO), 'utf8')) as {
    nombre: string
    revision: string
    fuente: string
    licencia: string
    fechaFuente: string
    clave: string
    datos: Record<string, unknown>[]
    metadatos: Record<string, unknown>
  }
  await guardarVersion({
    datasetId: 'puntos-rio',
    nombre: curado.nombre,
    revision: curado.revision,
    fuente: curado.fuente,
    licencia: curado.licencia,
    fechaFuente: curado.fechaFuente,
    formato: 'array',
    clave: curado.clave,
    metadatos: curado.metadatos,
    datos: curado.datos,
  })
}

async function publicarDepartamentos(): Promise<void> {
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

async function publicarMascara(): Promise<void> {
  const mascara = JSON.parse(readFileSync(path.join(process.cwd(), ARCHIVO_MASCARA), 'utf8')) as {
    type: 'FeatureCollection'
    features: unknown[]
  }
  await guardarVersion({
    datasetId: 'mascara',
    nombre: 'Máscara provincial',
    revision: 'public-data-mascara-corrientes',
    fuente: 'Máscara de Corrientes del repositorio (public/data), derivada de los departamentos de Georef',
    formato: 'features',
    datos: { type: 'FeatureCollection', features: mascara.features },
  })
}
