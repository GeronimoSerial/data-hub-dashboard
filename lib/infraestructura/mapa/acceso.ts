import type { CruceAccesoOsm, RutaGeoJson } from '@/lib/db/schema'
import type { ClaseRutaInundacion, ExposicionRutaRespuesta } from '@/lib/infraestructura/exposicion-ruta'
import type { GeometriaAccesoRespuesta } from '@/lib/infraestructura/territorio-mapa'
import { ETIQUETAS_CRUCE } from '@/lib/mapas/accesos-capas'

export type EtiquetaRiesgoAcceso = 'Alto' | 'Medio' | 'Bajo' | 'Sin riesgo' | 'Sin dato' | 'Sin ruta'

export interface LineasAcceso {
  via: string | null
  cruces: string
  crucesDetalle: string | null
  crucesConRiesgo: boolean
  riesgo: EtiquetaRiesgoAcceso | null
}

const ETIQUETA_CLASE_RUTA: Record<ClaseRutaInundacion, EtiquetaRiesgoAcceso> = {
  alto: 'Alto',
  medio: 'Medio',
  bajo: 'Bajo',
  sin_riesgo: 'Sin riesgo',
  sin_dato: 'Sin dato',
  sin_ruta: 'Sin ruta',
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

function etiquetaViaPrincipal(geometria: GeometriaAccesoRespuesta): string | null {
  const via = geometria.viaPrincipal
  if (!via || !geometria.ruta) return null

  const nombre = typeof via.nombre === 'string' && via.nombre.trim() !== ''
    ? via.nombre
    : via.tipo === 'residential' ? 'Calle urbana' : 'Camino rural'
  const superficie = via.pavimentada
    ? 'pavimentada'
    : via.tipo === 'track' ? 'de tierra' : 'de ripio'
  const destino = geometria.destino ? ` → ${geometria.destino.nombre}` : ''
  const distanciaInformada = typeof geometria.distanciaKm === 'number'
    && Number.isFinite(geometria.distanciaKm)
    ? geometria.distanciaKm
    : null
  const distancia = distanciaInformada ?? distanciaKm(geometria.ruta)
  const etiquetaDistancia = distancia !== null && Number.isFinite(distancia)
    ? ` · ${etiquetaKm(distancia)}`
    : ''

  return `${nombre} (${superficie})${destino}${etiquetaDistancia}`
}

function resumirCruces(geometria: GeometriaAccesoRespuesta) {
  if (geometria.cruces !== undefined) {
    return geometria.cruces.reduce((resumen, cruce: CruceAccesoOsm) => {
      if (cruce.clasificacion === 'puente') resumen.puente += 1
      else if (cruce.clasificacion === 'vado' || cruce.clasificacion === 'vado_probable') resumen.vado += 1
      else resumen.sinEvidencia += 1
      return resumen
    }, { puente: 0, vado: 0, sinEvidencia: 0 })
  }
  return geometria.resumen ?? { puente: 0, vado: 0, sinEvidencia: 0 }
}

function detalleCruces(resumen: ReturnType<typeof resumirCruces>): string | null {
  const etiquetas = [
    resumen.puente > 0 ? `${resumen.puente} con ${ETIQUETAS_CRUCE.puente.toLocaleLowerCase('es-AR')}` : null,
    resumen.vado > 0 ? `${resumen.vado} ${ETIQUETAS_CRUCE.vado.toLocaleLowerCase('es-AR')}` : null,
    resumen.sinEvidencia > 0 ? `${resumen.sinEvidencia} ${ETIQUETAS_CRUCE.sin_evidencia.toLocaleLowerCase('es-AR')}` : null,
  ].filter((etiqueta): etiqueta is string => etiqueta !== null)
  return etiquetas.length > 0 ? etiquetas.join(' · ') : null
}

function nivelRiesgo(exposicion: ExposicionRutaRespuesta | null): LineasAcceso['riesgo'] {
  if (exposicion === null) return null
  const clase = exposicion.claseRuta ?? null
  return clase === null ? 'Sin dato' : ETIQUETA_CLASE_RUTA[clase]
}

export function lineasAcceso(
  geometria: GeometriaAccesoRespuesta | null,
  exposicion: ExposicionRutaRespuesta | null,
): LineasAcceso | null {
  if (!geometria?.disponible || !geometria.ruta) return null

  const distancia = typeof geometria.distanciaKm === 'number' && Number.isFinite(geometria.distanciaKm)
    ? geometria.distanciaKm
    : distanciaKm(geometria.ruta)
  const viaPrincipal = etiquetaViaPrincipal(geometria)
  const resumenCruces = resumirCruces(geometria)
  const cantidadCruces = resumenCruces.puente + resumenCruces.vado + resumenCruces.sinEvidencia
  const cruces = cantidadCruces === 0
    ? 'Sin cruces de agua'
    : `${cantidadCruces} ${cantidadCruces === 1 ? 'cruce' : 'cruces'} de agua en el camino`

  return {
    via: viaPrincipal ?? (distancia === null || !Number.isFinite(distancia)
      ? null
      : `Camino de acceso · ${etiquetaKm(distancia)}`),
    cruces,
    crucesDetalle: detalleCruces(resumenCruces),
    crucesConRiesgo: resumenCruces.vado + resumenCruces.sinEvidencia > 0,
    riesgo: nivelRiesgo(exposicion),
  }
}
