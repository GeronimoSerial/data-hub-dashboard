import type { CruceAccesoOsm, RutaGeoJson, SuperficiesAcceso, ViaPrincipalAcceso } from '@/lib/db/schema'
import type { ClaseRutaInundacion, ExposicionRutaRespuesta } from '@/lib/infraestructura/exposicion-ruta'
import type { GeometriaAccesoRespuesta } from '@/lib/infraestructura/territorio-mapa'
import { es } from '@/lib/i18n/diccionarios/es'
import type { Diccionario } from '@/lib/i18n/diccionarios/tipos'

// string: la etiqueta sale del diccionario, así que depende del idioma.
export type EtiquetaRiesgoAcceso = string

export interface LineasAcceso {
  via: string | null
  cruces: string
  crucesDetalle: string | null
  crucesConRiesgo: boolean
  riesgo: EtiquetaRiesgoAcceso | null
}

// `alto` se escribe igual en español y portugués: no va al diccionario.
function etiquetasClaseRuta(t: Diccionario): Record<ClaseRutaInundacion, string> {
  return { alto: 'Alto', ...t.libTextos.accesos.claseRuta }
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

export function etiquetaKm(distancia: number): string {
  const kilometros = Math.max(1, distancia)
  const formato = kilometros < 10 ? FORMATO_KM_DECIMAL : FORMATO_KM_ENTERO
  return `${formato.format(kilometros)} km`
}

export type SuperficieVia = 'pavimentado' | 'ripio' | 'tierra'

/** Surface of the route's main road; tracks read as dirt, other unpaved roads as gravel. */
export function superficieVia(via: ViaPrincipalAcceso | null | undefined): SuperficieVia | null {
  if (!via) return null
  if (via.pavimentada) return 'pavimentado'
  return via.tipo === 'track' ? 'tierra' : 'ripio'
}

/** "pavimentado", "de ripio" or "de tierra", to follow "camino" or "km". */
export function etiquetaSuperficie(superficie: SuperficieVia, t: Diccionario = es): string {
  return superficie === 'pavimentado' ? 'pavimentado' : t.libTextos.accesos.superficie[superficie]
}

// Stretches under 100 m are snapping noise, not a surface worth naming.
const TRAMO_MINIMO_M = 100

/** "8 km pavimentado · 3 km de ripio", longest surface first; null without data. */
export function desgloseSuperficies(
  superficies: SuperficiesAcceso | null | undefined,
  t: Diccionario = es,
): string | null {
  if (!superficies) return null
  const tramos = (['pavimentado', 'ripio', 'tierra'] as const)
    .map((superficie) => ({ superficie, metros: superficies[superficie] }))
    .filter((tramo) => tramo.metros >= TRAMO_MINIMO_M)
    .sort((a, b) => b.metros - a.metros)
  if (tramos.length === 0) return null
  return tramos
    .map((tramo) => `${etiquetaKm(tramo.metros / 1000)} ${etiquetaSuperficie(tramo.superficie, t)}`)
    .join(' · ')
}

function etiquetaViaPrincipal(geometria: GeometriaAccesoRespuesta, t: Diccionario): string | null {
  const via = geometria.viaPrincipal
  if (!via || !geometria.ruta) return null

  const nombre = typeof via.nombre === 'string' && via.nombre.trim() !== ''
    ? via.nombre
    : via.tipo === 'residential' ? t.libTextos.accesos.via.calleUrbana : t.libTextos.accesos.via.caminoRural
  const tipoSuperficie = superficieVia(via)
  const superficie = tipoSuperficie === 'pavimentado'
    ? 'pavimentada' // igual en español y portugués: no va al diccionario
    : etiquetaSuperficie(tipoSuperficie ?? 'tierra', t)
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

function detalleCruces(resumen: ReturnType<typeof resumirCruces>, t: Diccionario): string | null {
  const detalle = t.libTextos.accesos.cruces.detalle
  const etiquetas = [
    resumen.puente > 0 ? detalle.puente(resumen.puente) : null,
    resumen.vado > 0 ? detalle.vado(resumen.vado) : null,
    resumen.sinEvidencia > 0 ? detalle.sinEvidencia(resumen.sinEvidencia) : null,
  ].filter((etiqueta): etiqueta is string => etiqueta !== null)
  return etiquetas.length > 0 ? etiquetas.join(' · ') : null
}

function nivelRiesgo(exposicion: ExposicionRutaRespuesta | null, t: Diccionario): LineasAcceso['riesgo'] {
  if (exposicion === null) return null
  const clase = exposicion.claseRuta ?? null
  return clase === null ? t.libTextos.accesos.claseRuta.sin_dato : etiquetasClaseRuta(t)[clase]
}

export function lineasAcceso(
  geometria: GeometriaAccesoRespuesta | null,
  exposicion: ExposicionRutaRespuesta | null,
  t: Diccionario = es,
): LineasAcceso | null {
  if (!geometria?.disponible || !geometria.ruta) return null

  const distancia = typeof geometria.distanciaKm === 'number' && Number.isFinite(geometria.distanciaKm)
    ? geometria.distanciaKm
    : distanciaKm(geometria.ruta)
  const viaPrincipal = etiquetaViaPrincipal(geometria, t)
  const resumenCruces = resumirCruces(geometria)
  const cantidadCruces = resumenCruces.puente + resumenCruces.vado + resumenCruces.sinEvidencia
  const cruces = cantidadCruces === 0
    ? t.libTextos.accesos.cruces.sinCruces
    : t.libTextos.accesos.cruces.cantidad(cantidadCruces)

  return {
    via: viaPrincipal ?? (distancia === null || !Number.isFinite(distancia)
      ? null
      : t.libTextos.accesos.via.caminoAcceso(etiquetaKm(distancia))),
    cruces,
    crucesDetalle: detalleCruces(resumenCruces, t),
    crucesConRiesgo: resumenCruces.vado + resumenCruces.sinEvidencia > 0,
    riesgo: nivelRiesgo(exposicion, t),
  }
}
