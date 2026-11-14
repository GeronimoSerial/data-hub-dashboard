// Capas estáticas de accesos y amenaza para el mapa de infraestructura.
//
// Módulo sin acceso a red: sólo paletas, íconos rasterizables (glifos Lucide
// rasterizados a string) y constructores de GeoJSON. Toda la semántica de las
// capas es de CONTEXTO, no de pronóstico:
//  - Aislamiento OSM: índice estático 0..3 derivado de OpenStreetMap (red vial y
//    cruces de agua). NO es un pronóstico ni el estado confirmado del edificio.
//    "sin conexión a la red OSM" (fila ausente) no es lo mismo que aislamiento 0.
//  - Inundación physrisk: profundidad histórica de inundación (m) para un período
//    de retorno. NO es un río/canal ni un pronóstico.
//  - Ruta y cruces: la ruta OSM que el cálculo realmente usó (nodo de camino más
//    cercano a la escuela → cabecera departamental). Es contexto: nunca se dibuja
//    una recta entre puntos que no esté en el dato.
import type { CruceAccesoOsm } from '@/lib/db/schema'
import type { EscuelaMapa } from '@/lib/infraestructura/parte-mapa'
import type {
  GeometriaAccesoRespuesta,
  NivelAislamientoMapa,
  TerritorioMapa,
} from '@/lib/infraestructura/territorio-mapa'
import { CircleQuestionMark, Droplets, Route, RouteOff, WavesHorizontal } from 'lucide-react'
import { construirSvgIcono } from './iconos-mapa'
import { coloresMapa } from './colores-mapa'
import type { GlifoIcono } from './insignias-mapa'
import { es } from '@/lib/i18n/diccionarios/es'
import type { Diccionario } from '@/lib/i18n/diccionarios/tipos'

// ---------------------------------------------------------------------------
// Clases y paletas
// ---------------------------------------------------------------------------

// Clase de riesgo por crecida de río (`clase_rio`, modelo v2 por período de
// retorno). `sin_dato` cubre la falta de fila, el null y valores fuera de dominio.
export type ClaseInundacion = 'alto' | 'medio' | 'bajo' | 'sin_riesgo' | 'sin_dato'

export type ClaseInundacionVisible = Exclude<ClaseInundacion, 'sin_riesgo' | 'sin_dato'>

export type ClasificacionCruce = CruceAccesoOsm['clasificacion']

// Rampas tonales de una sola gama (claro→oscuro), nunca semáforo: violeta para
// aislamiento y verde azulado (teal) para inundación — dos dominios, dos hues.
export const PALETA_TONAL_AISLAMIENTO = {
  0: '#ede9fe',
  1: '#c4b5fd',
  2: '#8b5cf6',
  3: '#4c1d95',
} as const

export const COLOR_AISLAMIENTO_SIN_DATOS = '#9ca3af'

export const PALETA_TONAL_INUNDACION = {
  bajo: '#99f6e4',
  medio: '#14b8a6',
  alto: '#115e59',
} as const

export const COLOR_RUTA_ACCESO = '#6d28d9'

// Clase de inundación tomada tal cual de `clase_rio`. `null`, ausente o fuera
// de dominio es `sin_dato`: nunca se mapea a 'bajo' ni a 'sin_riesgo'.
const CLASES_INUNDACION: ReadonlySet<string> = new Set<ClaseInundacion>([
  'alto', 'medio', 'bajo', 'sin_riesgo', 'sin_dato',
])

export function claseInundacion(claseRio: string | null | undefined): ClaseInundacion {
  if (claseRio === null || claseRio === undefined) return 'sin_dato'
  return CLASES_INUNDACION.has(claseRio) ? (claseRio as ClaseInundacion) : 'sin_dato'
}

// ---------------------------------------------------------------------------
// Copia de UI (fuente única en español, no redefinir literales en los
// componentes)
// ---------------------------------------------------------------------------

// Textos largos de los bloques de accesos. Los componentes de leyenda y ficha
// los consumen tal cual; así el mismo concepto no se redacta dos veces.
// Los textos largos NO se muestran siempre: la ficha los deja dentro de un
// `<details>` de ayuda (cerrado por defecto) para que lo visible sea corto.
// `{periodo}` se reemplaza con el período de retorno de los datos vía
// `textoConPeriodo` (nunca se escribe el número a mano).
// Los textos viven en el diccionario (`libTextos.accesos`); estas constantes
// son la copia en español y el resto de los consumidores usa los accesores `t`.
export function textosAccesos(t: Diccionario = es) {
  return t.libTextos.accesos.textos
}

export const TEXTOS_ACCESOS = textosAccesos(es)

export function tituloAcceso(t: Diccionario = es): string {
  return textosAccesos(t).tituloAcceso
}

export function tituloInundacion(t: Diccionario = es): string {
  return textosAccesos(t).tituloInundacion
}

export function textoConPeriodo(
  texto: string,
  periodoRetornoAnios: number | null | undefined,
): string {
  return texto.replaceAll('{periodo}', String(periodoRetornoAnios ?? 100))
}

// Nombre corto + explicación en lenguaje llano de cada nivel. `detalle` son
// las reglas del índice de aislamiento
// (services/geo-static/src/geo_static/osm_aislamiento.py); no cambiar la
// semántica sin cambiar el cálculo. Se muestran sólo dentro del `<details>` de
// ayuda: lo visible es el nombre corto con su conteo.
// El nombre de "Alta" se escribe igual en español y portugués: no va al diccionario.
export function descripcionesAislamiento(t: Diccionario = es) {
  const niveles = t.libTextos.accesos.aislamiento
  return { ...niveles, 3: { nombre: 'Alta', detalle: niveles[3].detalle } }
}

export const DESCRIPCIONES_AISLAMIENTO = descripcionesAislamiento(es)

// `etiquetasAislamiento(t)[n]` es siempre `descripcionesAislamiento(t)[n].nombre`:
// una sola fuente para el nombre corto que usan leyenda, ficha y control.
export function etiquetasAislamiento(t: Diccionario = es) {
  const niveles = descripcionesAislamiento(t)
  return {
    0: niveles[0].nombre,
    1: niveles[1].nombre,
    2: niveles[2].nombre,
    3: niveles[3].nombre,
    sin_datos_red: niveles.sin_datos_red.nombre,
  }
}

export const ETIQUETAS_AISLAMIENTO = etiquetasAislamiento(es)

// `alto` se escribe igual en español y portugués: no va al diccionario.
export function etiquetasInundacion(t: Diccionario = es) {
  return { alto: 'Alto', ...t.libTextos.accesos.inundacion }
}

export const ETIQUETAS_INUNDACION = etiquetasInundacion(es)

export function etiquetasCruce(t: Diccionario = es) {
  return t.libTextos.accesos.cruce.etiqueta
}

export const ETIQUETAS_CRUCE = etiquetasCruce(es)

export function descripcionesCruce(t: Diccionario = es) {
  return t.libTextos.accesos.cruce.descripcion
}

export const DESCRIPCIONES_CRUCE = descripcionesCruce(es)

export const MOTIVO_SIN_RUTA_GENERICO = es.libTextos.accesos.motivoSinRuta.generico

export function motivosSinRuta(t: Diccionario = es): Record<string, string> {
  const { generico: _generico, ...motivos } = t.libTextos.accesos.motivoSinRuta
  return motivos
}

export const MOTIVOS_SIN_RUTA: Record<string, string> = motivosSinRuta(es)

export function textoMotivoSinRuta(motivo: string | null | undefined, t: Diccionario = es): string {
  return (motivo && motivosSinRuta(t)[motivo]) || t.libTextos.accesos.motivoSinRuta.generico
}

// ---------------------------------------------------------------------------
// Íconos rasterizables (SVG standalone para `map.addImage`)
// ---------------------------------------------------------------------------

export const ID_ICONO_AISLAMIENTO = {
  0: 'infra-icono-aislamiento-0',
  1: 'infra-icono-aislamiento-1',
  2: 'infra-icono-aislamiento-2',
  3: 'infra-icono-aislamiento-3',
} as const

export const ID_ICONO_AISLAMIENTO_SIN_DATOS = 'infra-icono-aislamiento-sin-datos'

export const ID_ICONO_INUNDACION = {
  bajo: 'infra-icono-inundacion-baja',
  medio: 'infra-icono-inundacion-media',
  alto: 'infra-icono-inundacion-alta',
} as const

export const ID_ICONO_CRUCE = {
  puente: 'infra-icono-cruce-puente',
  vado: 'infra-icono-cruce-vado',
  vado_probable: 'infra-icono-cruce-vado',
  sin_evidencia: 'infra-icono-cruce-sin-evidencia',
} as const

// Id del ícono de aislamiento para un nivel del payload (incluye la fila
// 'sin_datos_red', que también es cobertura parcial).
export function iconoAislamiento(nivel: NivelAislamientoMapa): string {
  return nivel === 'sin_datos_red'
    ? ID_ICONO_AISLAMIENTO_SIN_DATOS
    : ID_ICONO_AISLAMIENTO[nivel]
}

// Glifos Lucide reales (Route, RouteOff, Droplets, WavesHorizontal,
// CircleQuestionMark) rasterizados con el mismo estilo que el resto del mapa.
// Puente: dibujo propio autoexplicativo (tablero + arco + dos pilares), sólo
// trazo; Lucide no tiene un puente.
const GLIFO_CRUCE_PUENTE =
  '<path d="M3 15h18" />' +
  '<path d="M5 15a7 7 0 0 1 14 0" />' +
  '<path d="M5 15v5" />' +
  '<path d="M19 15v5" />'

// Colores de los tokens semánticos de `app/globals.css` para el tema claro.
const COLOR_CRUCE_PUENTE = '#356f23' // --ok
const COLOR_CRUCE_VADO = '#b45f04' // --warn
const COLOR_CRUCE_SIN_EVIDENCIA = '#5f5e5c' // --ink-soft

const TINTA = '#1c1c1c'
const BLANCO = '#ffffff'

/** Íconos de accesos para el tema pedido: sólo cambia el halo. */
export function iconosAccesosMapa(oscuro = false): ReadonlyArray<{ id: string; svg: string }> {
  const halo = coloresMapa(oscuro).contornoIcono
  const icono = (glifo: GlifoIcono, fondo: string, colorGlifo: string) =>
    construirSvgIcono(glifo, fondo, colorGlifo, { halo })
  return [
    { id: ID_ICONO_AISLAMIENTO[0], svg: icono(Route, PALETA_TONAL_AISLAMIENTO[0], TINTA) },
    { id: ID_ICONO_AISLAMIENTO[1], svg: icono(Route, PALETA_TONAL_AISLAMIENTO[1], TINTA) },
    { id: ID_ICONO_AISLAMIENTO[2], svg: icono(Route, PALETA_TONAL_AISLAMIENTO[2], BLANCO) },
    { id: ID_ICONO_AISLAMIENTO[3], svg: icono(Route, PALETA_TONAL_AISLAMIENTO[3], BLANCO) },
    { id: ID_ICONO_AISLAMIENTO_SIN_DATOS, svg: icono(RouteOff, COLOR_AISLAMIENTO_SIN_DATOS, TINTA) },
    { id: ID_ICONO_INUNDACION.bajo, svg: icono(Droplets, PALETA_TONAL_INUNDACION.bajo, TINTA) },
    { id: ID_ICONO_INUNDACION.medio, svg: icono(Droplets, PALETA_TONAL_INUNDACION.medio, TINTA) },
    { id: ID_ICONO_INUNDACION.alto, svg: icono(Droplets, PALETA_TONAL_INUNDACION.alto, BLANCO) },
    { id: ID_ICONO_CRUCE.puente, svg: icono(GLIFO_CRUCE_PUENTE, COLOR_CRUCE_PUENTE, BLANCO) },
    { id: ID_ICONO_CRUCE.vado, svg: icono(WavesHorizontal, COLOR_CRUCE_VADO, BLANCO) },
    { id: ID_ICONO_CRUCE.sin_evidencia, svg: icono(CircleQuestionMark, COLOR_CRUCE_SIN_EVIDENCIA, BLANCO) },
  ]
}

export const ICONOS_ACCESOS_MAPA = iconosAccesosMapa(false)

const svgDe = (id: string) => ICONOS_ACCESOS_MAPA.find((icono) => icono.id === id)!.svg
export const SVG_ICONO_CRUCE_PUENTE = svgDe(ID_ICONO_CRUCE.puente)
export const SVG_ICONO_CRUCE_VADO = svgDe(ID_ICONO_CRUCE.vado)
export const SVG_ICONO_CRUCE_SIN_EVIDENCIA = svgDe(ID_ICONO_CRUCE.sin_evidencia)
export const SVG_ICONO_AISLAMIENTO_0 = svgDe(ID_ICONO_AISLAMIENTO[0])
export const SVG_ICONO_AISLAMIENTO_1 = svgDe(ID_ICONO_AISLAMIENTO[1])
export const SVG_ICONO_AISLAMIENTO_2 = svgDe(ID_ICONO_AISLAMIENTO[2])
export const SVG_ICONO_AISLAMIENTO_3 = svgDe(ID_ICONO_AISLAMIENTO[3])
export const SVG_ICONO_AISLAMIENTO_SIN_DATOS = svgDe(ID_ICONO_AISLAMIENTO_SIN_DATOS)

// ---------------------------------------------------------------------------
// Constructores de GeoJSON
// ---------------------------------------------------------------------------

export interface PuntoAislamientoProps {
  cueAnexo: string
  nivel: NivelAislamientoMapa
  icono: string
}

export interface PuntoInundacionProps {
  cueAnexo: string
  clase: ClaseInundacionVisible
  icono: string
}

export interface CruceAccesoProps {
  clasificacion: ClasificacionCruce
  icono: string
  etiqueta: string
  // Position of the crossing in `GeometriaAccesoRespuesta.cruces`.
  indice: number
  nombreCurso: string | null
  nombrePuente: string | null
  tipoCurso: string | null
  intermitente: boolean | null
}

export interface ResumenCobertura {
  aislamiento: {
    0: number
    1: number
    2: number
    3: number
    sin_datos_red: number
    sin_cobertura: number
  }
  inundacion: Record<ClaseInundacion, number>
  total: number
}

function coordenadaValida(escuela: EscuelaMapa): boolean {
  return escuela.lat !== null && escuela.lon !== null
}

// Un Point por escuela del padrón que tenga coordenadas Y fila de aislamiento
// en el territorio. Se omiten las escuelas sin ubicación o sin cobertura.
export function construirPuntosAislamiento(
  escuelas: EscuelaMapa[],
  territorio: TerritorioMapa | null,
): GeoJSON.FeatureCollection<GeoJSON.Point, PuntoAislamientoProps> {
  const porCue = territorio?.aislamiento?.escuelas ?? {}
  const features: Array<GeoJSON.Feature<GeoJSON.Point, PuntoAislamientoProps>> = []

  for (const escuela of escuelas) {
    if (!coordenadaValida(escuela)) continue
    const fila = porCue[escuela.cueAnexo]
    if (fila === undefined) continue

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [escuela.lon as number, escuela.lat as number] },
      properties: {
        cueAnexo: escuela.cueAnexo,
        nivel: fila.nivel,
        icono: iconoAislamiento(fila.nivel),
      },
    })
  }

  return { type: 'FeatureCollection', features }
}

// Un Point por escuela con coordenadas y `clase_rio` alto|medio|bajo. `sin_riesgo`
// y `sin_dato` no se dibujan como puntos de inundación.
export function construirPuntosInundacion(
  escuelas: EscuelaMapa[],
  territorio: TerritorioMapa | null,
): GeoJSON.FeatureCollection<GeoJSON.Point, PuntoInundacionProps> {
  const porCue = territorio?.susceptibilidad?.escuelas ?? {}
  const features: Array<GeoJSON.Feature<GeoJSON.Point, PuntoInundacionProps>> = []

  for (const escuela of escuelas) {
    if (!coordenadaValida(escuela)) continue
    const fila = porCue[escuela.cueAnexo]
    if (fila === undefined) continue

    const clase = claseInundacion(fila.claseRio)
    if (clase === 'sin_riesgo' || clase === 'sin_dato') continue

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [escuela.lon as number, escuela.lat as number] },
      properties: {
        cueAnexo: escuela.cueAnexo,
        clase,
        icono: ID_ICONO_INUNDACION[clase],
      },
    })
  }

  return { type: 'FeatureCollection', features }
}

// Conteos para la leyenda sobre TODAS las escuelas del padrón, tengan o no
// coordenadas: la cobertura no depende de la ubicación.
export function resumirCobertura(
  escuelas: EscuelaMapa[],
  territorio: TerritorioMapa | null,
): ResumenCobertura {
  const resumen: ResumenCobertura = {
    aislamiento: { 0: 0, 1: 0, 2: 0, 3: 0, sin_datos_red: 0, sin_cobertura: 0 },
    inundacion: { alto: 0, medio: 0, bajo: 0, sin_riesgo: 0, sin_dato: 0 },
    total: escuelas.length,
  }

  const aislamientoPorCue = territorio?.aislamiento?.escuelas ?? {}
  const susceptibilidadPorCue = territorio?.susceptibilidad?.escuelas ?? {}

  for (const escuela of escuelas) {
    const filaAislamiento = aislamientoPorCue[escuela.cueAnexo]
    if (filaAislamiento === undefined) {
      resumen.aislamiento.sin_cobertura += 1
    } else if (filaAislamiento.nivel === 'sin_datos_red') {
      resumen.aislamiento.sin_datos_red += 1
    } else {
      resumen.aislamiento[filaAislamiento.nivel] += 1
    }

    const filaInundacion = susceptibilidadPorCue[escuela.cueAnexo]
    // Fila ausente y clase null colapsan en 'sin_dato': nunca se imputa 'bajo'
    // ni 'sin_riesgo'.
    const clase = claseInundacion(filaInundacion?.claseRio)
    resumen.inundacion[clase] += 1
  }

  return resumen
}

// Ruta OSM realmente usada por el cálculo. Devuelve null si la geometría no
// está disponible; con dato, copia EXACTA de `g.ruta.coordinates` (nunca se
// interpola ni se agregan puntos).
export function construirRutaAcceso(
  g: GeometriaAccesoRespuesta | null,
): GeoJSON.FeatureCollection<GeoJSON.LineString> | null {
  if (g === null || !g.disponible || g.ruta === undefined) return null

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: g.ruta.coordinates },
        properties: {},
      },
    ],
  }
}

// Huella OSM del edificio escolar, coloreada con el estado de la escuela. Null
// cuando no hay polígono (extracto previo, sin candidato o asociación ambigua).
export function construirEdificioEscuela(
  g: GeometriaAccesoRespuesta | null,
  color: string,
): GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, { color: string }> | null {
  const poligono = g?.edificio?.poligono
  if (!poligono || !Array.isArray(poligono.coordinates) || poligono.coordinates.length === 0) return null
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: poligono.type, coordinates: poligono.coordinates } as GeoJSON.Polygon | GeoJSON.MultiPolygon,
        properties: { color },
      },
    ],
  }
}

// Cruces de agua clasificados sobre la ruta. Colección vacía cuando la
// geometría no está disponible.
export function construirCrucesAcceso(
  g: GeometriaAccesoRespuesta | null,
): GeoJSON.FeatureCollection<GeoJSON.Point, CruceAccesoProps> {
  if (g === null || !g.disponible || g.cruces === undefined) {
    return { type: 'FeatureCollection', features: [] }
  }

  const features = g.cruces.map(
    (cruce, indice): GeoJSON.Feature<GeoJSON.Point, CruceAccesoProps> => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [cruce.lon, cruce.lat] },
      properties: {
        clasificacion: cruce.clasificacion,
        icono: ID_ICONO_CRUCE[cruce.clasificacion],
        etiqueta: ETIQUETAS_CRUCE[cruce.clasificacion],
        indice,
        nombreCurso: cruce.nombreCurso ?? null,
        nombrePuente: cruce.nombrePuente ?? null,
        tipoCurso: cruce.tipoCurso ?? null,
        intermitente: cruce.intermitente ?? null,
      },
    }),
  )

  return { type: 'FeatureCollection', features }
}
