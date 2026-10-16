import { referencia } from '@/lib/infraestructura/datasets/memoria'
// Centroides derivados de la versión publicada de departamentos en la DB.
// Se mantiene una sola fuente para polígonos y puntos de consulta estacional.
export interface CentroideDepartamento {
  departamento: string
  lat: number
  lon: number
}

export function obtenerCentroidesDepartamentos(): CentroideDepartamento[] {
  const geo = referencia<{ features: Array<{ properties: { nombre: string; centroide: { lat: number; lon: number } } }> }>('departamentos')
  return geo.features.map(({ properties: p }) => ({ departamento: p.nombre, lat: p.centroide.lat, lon: p.centroide.lon }))
}
