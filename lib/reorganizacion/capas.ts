// Constructores puros de las capas del mapa de reorganización: GeoJSON desde el
// dataset V29 y especificaciones de pintura de MapLibre. Sin React ni runtime de
// MapLibre; solo se importan tipos. El mapa mantiene el universo completo: el
// filtro atenúa (`coincide` false), nunca quita escuelas.

import type { Feature, FeatureCollection, Geometry, LineString, Point, Polygon, Position } from 'geojson'
import type {
  CircleLayerSpecification,
  ExpressionSpecification,
  FillLayerSpecification,
  LineLayerSpecification,
} from 'maplibre-gl'
import { coloresMapa, COLORES_MAPA_CLARO } from '@/lib/mapas/colores-mapa'
import { listarZonas, etiquetaDeZona, RADIO_ZONA_KM } from './zonas'
import type { CentroZona, EscuelaV29, ReferenciaV29 } from './tipos'

export const FUENTE_UNIVERSO = 'reorganizacion-universo'
export const CAPA_UNIVERSO = 'reorganizacion-universo-puntos'
export const FUENTE_OTRAS_PRIMARIAS = 'reorganizacion-otras-primarias'
export const CAPA_OTRAS_PRIMARIAS = 'reorganizacion-otras-primarias-puntos'
export const FUENTE_SECUNDARIAS = 'reorganizacion-secundarias'
export const CAPA_SECUNDARIAS = 'reorganizacion-secundarias-puntos'
export const FUENTE_ZONAS = 'reorganizacion-zonas'
export const CAPA_ZONAS = 'reorganizacion-zonas-relleno'
export const FUENTE_SELECCION = 'reorganizacion-seleccion'
export const CAPA_SELECCION = 'reorganizacion-seleccion-anillo'
export const FUENTE_RECORRIDO = 'reorganizacion-recorrido'
export const CAPA_RECORRIDO_TRAZADO = 'reorganizacion-recorrido-trazado'
export const CAPA_RECORRIDO_PUNTOS = 'reorganizacion-recorrido-puntos'

/** Colores de token de `app/globals.css` (espejados, MapLibre no resuelve var()). */
export const COLORES_CAPAS = {
  /** `--yellow`: establecimientos del universo. */
  universo: '#facd05',
  /** `--sky`: otras primarias. */
  otrasPrimarias: '#90b4e1',
  /** `--green`: secundarias. */
  secundarias: '#719c29',
  /** Anillo de selección y coincidencias: contraste por forma, no por color. */
  seleccion: COLORES_MAPA_CLARO.tinta,
  recorrido: COLORES_MAPA_CLARO.tinta,
} as const

export const ETIQUETAS_CAPAS = {
  zonas: 'Zonas de 20 km de diámetro',
  universo: 'Establecimientos del universo',
  otrasPrimarias: 'Otras primarias',
  secundarias: 'Secundarias',
  seleccion: 'Selección y coincidencias',
  recorrido: 'Recorrido',
} as const

export interface PropiedadesUniverso {
  cue: string
  nombre: string
  matricula: number
  zona: string
  coincide: boolean
  resaltada: boolean
  seleccionada: boolean
}

export interface OpcionesUniverso {
  /** CUE que cumplen el filtro activo (ResultadoFiltros.idsCoincidentes). */
  idsCoincidentes: ReadonlySet<string>
  hayFiltroActivo: boolean
  /** CUE resaltados por la clasificación salarial (ResaltadoClasificacion.cues). */
  resaltados: ReadonlySet<string>
  /** CUE seleccionado, o null. */
  seleccionada: string | null
}

export interface PropiedadesReferencia {
  cue: string
  nombre: string
  /** Null = sin dato: nunca se convierte en cero. */
  matriculaPrimaria: number | null
  localidad: string
}

export interface PropiedadesZona {
  id: number
  etiqueta: string
  miembros: number
  tendencia: string
  color: string
}

export interface PropiedadesSeleccion {
  cue: string
  nombre: string
}

export interface PuntoRecorrido {
  nombre: string
  lat: number
  lon: number
}

export type RolRecorrido = 'origen' | 'destino' | 'trazado'

export interface PropiedadesRecorrido {
  rol: RolRecorrido
}

/** Filtros de capa para separar trazado y puntos en la misma fuente. */
export const FILTRO_RECORRIDO_TRAZADO: ExpressionSpecification = ['==', ['get', 'rol'], 'trazado']
export const FILTRO_RECORRIDO_PUNTOS: ExpressionSpecification = ['!=', ['get', 'rol'], 'trazado']

/** Estado visual: el tema oscuro cambia el color del borde de los puntos. */
export interface EstadoPintura {
  oscuro: boolean
}

/** Vértices del polígono de cada zona; el anillo se cierra con el primero. */
const VERTICES_ZONA = 64
const RADIO_TIERRA_M = 6_371_008.8

const aRadianes = (grados: number): number => (grados * Math.PI) / 180
const aGrados = (radianes: number): number => (radianes * 180) / Math.PI

/** Punto a `distanciaM` del centro en `rumbo` (radianes), sobre la esfera. */
function destino(centro: CentroZona, distanciaM: number, rumbo: number): Position {
  const latitud = aRadianes(centro.lat)
  const longitud = aRadianes(centro.lon)
  const angular = distanciaM / RADIO_TIERRA_M
  const latitudDestino = Math.asin(
    Math.sin(latitud) * Math.cos(angular) + Math.cos(latitud) * Math.sin(angular) * Math.cos(rumbo),
  )
  const longitudDestino =
    longitud +
    Math.atan2(
      Math.sin(rumbo) * Math.sin(angular) * Math.cos(latitud),
      Math.cos(angular) - Math.sin(latitud) * Math.sin(latitudDestino),
    )
  return [aGrados(longitudDestino), aGrados(latitudDestino)]
}

function circuloZona(centro: CentroZona): Position[] {
  const radioM = RADIO_ZONA_KM * 1000
  const anillo: Position[] = []
  for (let i = 0; i < VERTICES_ZONA; i++) {
    anillo.push(destino(centro, radioM, (2 * Math.PI * i) / VERTICES_ZONA))
  }
  return [...anillo, anillo[0]]
}

/** Todas las escuelas del universo, filtradas o no: el filtro solo atenúa. */
export function construirUniverso(
  escuelas: EscuelaV29[],
  opciones: OpcionesUniverso,
): FeatureCollection<Point, PropiedadesUniverso> {
  return {
    type: 'FeatureCollection',
    features: escuelas.map((escuela) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [escuela.lon, escuela.lat] },
      properties: {
        cue: escuela.cue,
        nombre: escuela.nombre,
        matricula: escuela.matricula,
        zona: escuela.zona,
        coincide: !opciones.hayFiltroActivo || opciones.idsCoincidentes.has(escuela.cue),
        resaltada: opciones.resaltados.has(escuela.cue),
        seleccionada: opciones.seleccionada === escuela.cue,
      },
    })),
  }
}

/**
 * Primarias o secundarias fuera del universo. Las escuelas del universo ya se
 * dibujan en su capa, así que se excluyen para no duplicar puntos.
 */
export function construirReferencias(
  referencias: ReferenciaV29[],
  nivel: 'primaria' | 'secundaria',
  escuelasUniverso: EscuelaV29[],
): FeatureCollection<Point, PropiedadesReferencia> {
  const cuesUniverso = new Set(escuelasUniverso.map((escuela) => escuela.cue))
  const features = referencias
    .filter((referencia) =>
      (nivel === 'primaria' ? referencia.primaria : referencia.secundaria) &&
      !cuesUniverso.has(referencia.cue),
    )
    .map((referencia) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [referencia.lon, referencia.lat] },
      properties: {
        cue: referencia.cue,
        nombre: referencia.nombre,
        matriculaPrimaria: referencia.matriculaPrimaria,
        localidad: referencia.localidad,
      },
    }))
  return { type: 'FeatureCollection', features }
}

/** Un círculo por centro. Las estadísticas usan la zona completa, no el listado filtrado. */
export function construirZonas(
  centros: CentroZona[],
  escuelas: EscuelaV29[],
): FeatureCollection<Polygon, PropiedadesZona> {
  const features: Feature<Polygon, PropiedadesZona>[] = listarZonas(centros, escuelas)
    .filter((zona) => zona.centro !== null && zona.id !== null)
    .map((zona) => ({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [circuloZona(zona.centro as CentroZona)] },
      properties: {
        id: zona.id as number,
        etiqueta: etiquetaDeZona(zona.id as number),
        miembros: zona.estadisticas.cantidad,
        tendencia: zona.estadisticas.tendencia,
        color: zona.estadisticas.colorTendencia,
      },
    }))
  return { type: 'FeatureCollection', features }
}

/** Un punto para la escuela seleccionada; colección vacía sin selección. */
export function construirSeleccion(escuela: EscuelaV29 | null): FeatureCollection<Point, PropiedadesSeleccion> {
  if (!escuela) return { type: 'FeatureCollection', features: [] }
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [escuela.lon, escuela.lat] },
        properties: { cue: escuela.cue, nombre: escuela.nombre },
      },
    ],
  }
}

/**
 * Origen, destino y trazado vial. Sin geometría (proveedor caído o sin ruta) no
 * se dibuja línea: nunca se sustituye por una distancia lineal.
 */
export function construirRecorrido(
  origen: PuntoRecorrido,
  destino: PuntoRecorrido,
  geometria: LineString | null,
): FeatureCollection<Geometry, PropiedadesRecorrido> {
  const features: Feature<Geometry, PropiedadesRecorrido>[] = []
  if (geometria) {
    features.push({ type: 'Feature', geometry: geometria, properties: { rol: 'trazado' } })
  }
  features.push(
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [origen.lon, origen.lat] },
      properties: { rol: 'origen' },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [destino.lon, destino.lat] },
      properties: { rol: 'destino' },
    },
  )
  return { type: 'FeatureCollection', features }
}

export function paintUniverso(estado: EstadoPintura): CircleLayerSpecification['paint'] {
  const colores = coloresMapa(estado.oscuro)
  const destacada: ExpressionSpecification = ['any', ['get', 'resaltada'], ['get', 'seleccionada']]
  return {
    'circle-color': COLORES_CAPAS.universo,
    'circle-radius': ['case', ['get', 'seleccionada'], 9, 6],
    'circle-opacity': ['case', ['get', 'coincide'], 1, 0.25],
    'circle-stroke-width': ['case', ['get', 'seleccionada'], 3, ['get', 'resaltada'], 2, 1],
    'circle-stroke-color': ['case', destacada, colores.tinta, colores.halo],
    'circle-stroke-opacity': ['case', ['get', 'coincide'], 1, 0.25],
  } as CircleLayerSpecification['paint']
}

export function paintReferencias(nivel: 'primaria' | 'secundaria'): CircleLayerSpecification['paint'] {
  return {
    'circle-color': nivel === 'primaria' ? COLORES_CAPAS.otrasPrimarias : COLORES_CAPAS.secundarias,
    'circle-radius': 4,
    'circle-opacity': 0.85,
    'circle-stroke-width': 1,
    'circle-stroke-color': COLORES_MAPA_CLARO.halo,
  }
}

/** Relleno tenue con el color de tendencia de cada zona y borde del mismo color. */
export function paintZonas(): FillLayerSpecification['paint'] {
  return {
    'fill-color': ['get', 'color'],
    'fill-opacity': 0.18,
    'fill-outline-color': ['get', 'color'],
  } as FillLayerSpecification['paint']
}

/** Anillo sin relleno: la selección se distingue por forma y grosor, no solo por color. */
export function paintSeleccion(): CircleLayerSpecification['paint'] {
  return {
    'circle-color': 'rgba(0, 0, 0, 0)',
    'circle-radius': 12,
    'circle-stroke-width': 3,
    'circle-stroke-color': COLORES_CAPAS.seleccion,
  }
}

export function paintRecorrido(): LineLayerSpecification['paint'] {
  return {
    'line-color': COLORES_CAPAS.recorrido,
    'line-width': 4,
    'line-opacity': 0.9,
  }
}

export function paintRecorridoPuntos(): CircleLayerSpecification['paint'] {
  return {
    'circle-color': COLORES_MAPA_CLARO.halo,
    'circle-radius': 6,
    'circle-stroke-width': 3,
    'circle-stroke-color': COLORES_CAPAS.recorrido,
  }
}
