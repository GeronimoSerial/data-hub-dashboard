import type { CruceAccesoOsm, RutaGeoJson } from '@/lib/db/schema'
import type { ExposicionRutaRespuesta } from '@/lib/infraestructura/exposicion-ruta'
import type { GeometriaAccesoRespuesta } from '@/lib/infraestructura/territorio-mapa'

export interface LineasAcceso {
  via: string | null
  cruces: string
  riesgo: 'Bajo' | 'Medio' | 'Alto' | null
}

const RADIO_TIERRA_KM = 6371.0088
const FORMATO_KM_DECIMAL = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })
const FORMATO_KM_ENTERO = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })

function distanciaKm(ruta: RutaGeoJson): number | null {
  if (ruta.coordinates.length < 2) return null

  let distancia = 0
  for (let indice = 1; indice < ruta.coordinates.length; indice += 1) {
    const [lon1, lat1] = ruta.coordinates[indice - 1]
    const [lon2, lat2] = ruta.coordinates[indice]
    const diferenciaLat = (lat2 - lat1) * Math.PI / 180
    const diferenciaLon = (lon2 - lon1) * Math.PI / 180
    const senoLat = Math.sin(diferenciaLat / 2)
    const senoLon = Math.sin(diferenciaLon / 2)
    const a = senoLat * senoLat
      + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * senoLon * senoLon
    distancia += 2 * RADIO_TIERRA_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  return distancia
}

function etiquetaKm(distancia: number): string {
  const kilometros = Math.max(1, distancia)
  const formato = kilometros < 10 ? FORMATO_KM_DECIMAL : FORMATO_KM_ENTERO
  return `${formato.format(kilometros)} km`
}

function contarCruces(geometria: GeometriaAccesoRespuesta): number {
  if (geometria.resumen) return geometria.resumen.vado + geometria.resumen.sinEvidencia
  return (geometria.cruces ?? []).filter((cruce: CruceAccesoOsm) => cruce.clasificacion !== 'puente').length
}

function nivelRiesgo(exposicion: ExposicionRutaRespuesta | null): LineasAcceso['riesgo'] {
  if (exposicion?.estado === 'sin_profundidad') return 'Bajo'
  if (exposicion?.estado !== 'con_profundidad') return null

  const profundidad = exposicion.resumen.profundidadMaxM
  if (profundidad === null || profundidad <= 0) return null
  return profundidad >= 0.5 ? 'Alto' : 'Medio'
}

export function lineasAcceso(
  geometria: GeometriaAccesoRespuesta | null,
  exposicion: ExposicionRutaRespuesta | null,
): LineasAcceso | null {
  if (!geometria?.disponible || !geometria.ruta) return null

  const distancia = distanciaKm(geometria.ruta)
  const cantidadCruces = contarCruces(geometria)
  const cruces = cantidadCruces === 0
    ? 'Sin cruces de agua'
    : `${cantidadCruces} ${cantidadCruces === 1 ? 'cruce' : 'cruces'} de agua en el camino`

  return {
    via: distancia === null ? null : `Camino de acceso · ${etiquetaKm(distancia)}`,
    cruces,
    riesgo: nivelRiesgo(exposicion),
  }
}
