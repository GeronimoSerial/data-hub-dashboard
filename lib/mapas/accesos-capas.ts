// Capas estáticas de accesos y amenaza para el mapa de infraestructura.
//
// Módulo PURO (sin React y sin acceso a red): sólo paletas, íconos rasterizables
// y constructores de GeoJSON. Toda la semántica de las capas es de CONTEXTO, no
// de pronóstico:
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
import { construirSvgIcono } from './iconos-mapa'

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
export const TEXTOS_ACCESOS = {
  tituloAcceso: 'Dificultad para llegar por camino',
  subtituloAcceso:
    'De 0 (muy baja) a 3 (alta). Es un cálculo con datos de mapa, no el estado del camino hoy.',
  queMideAcceso:
    'Estima qué tan difícil es llegar por camino desde la escuela hasta la ciudad cabecera de su departamento. Tiene en cuenta la distancia, los tramos de tierra y los cruces de ríos, arroyos o canales que figuran en OpenStreetMap (el mapa abierto de donde salen los caminos).',
  nivelesAcceso:
    'Cuanto más alto el número, más difícil es llegar: 0 muy baja, 1 baja, 2 media, 3 alta.',
  noRepresentaAcceso:
    'No dice si hoy el camino está cortado, no es un pronóstico y no muestra el estado del edificio. El riesgo de acceso pronosticado está en el modo Radar y la situación de hoy, en los partes.',
  tituloInundacion: 'Agua estimada por crecida de río (en la escuela)',
  subtituloInundacion:
    'Metros de agua estimados en el punto de la escuela para una crecida que ocurre, en promedio, una vez cada {periodo} años.',
  sinProfundidad: 'El modelo no estima agua en ese punto (0 m). Es un resultado del cálculo, no una garantía de que nunca se inunde.',
  sinCobertura:
    'Sin dato: esta escuela no está en los datos calculados, así que no se sabe su valor. No equivale a nivel 0 ni a "sin agua".',
  detalleDatos: 'Datos calculados con mapas y modelos; no reemplazan el parte ni confirman el estado del edificio.',
  periodoEscenario:
    'Período de retorno: {periodo} años (una crecida que ocurre, en promedio, una vez cada {periodo} años) · escenario con clima histórico',
  sinRuta: 'Sin recorrido para mostrar',
  verRecorrido: 'Ver recorrido',
} as const

// Rellena el período de retorno de los textos que lo usan. Si el dato no está
// disponible se mantiene 100 (valor por defecto del dataset), pero los bloques
// que lo muestran sólo se renderizan cuando hay metadatos de susceptibilidad.
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
export const DESCRIPCIONES_AISLAMIENTO = {
  0: {
    nombre: 'Muy baja',
    detalle:
      'Camino de hasta 3 km hasta la ciudad cabecera de su departamento, sin cruces de agua y con como mucho 1 tramo de tierra.',
  },
  1: {
    nombre: 'Baja',
    detalle:
      'Ningún cruce de agua carece de puente registrado, pero el trayecto no es el más simple: más de 3 km, cruces con puente o varios tramos de tierra.',
  },
  2: {
    nombre: 'Media',
    detalle:
      'Hay al menos un cruce de agua sin puente registrado, pero existe otro camino que lo evita.',
  },
  3: {
    nombre: 'Alta',
    detalle:
      'Más de 20 km hasta la ciudad cabecera de su departamento, o un cruce de agua sin puente registrado y ningún camino que lo evite.',
  },
  sin_datos_red: {
    nombre: 'No calculable',
    detalle:
      'No se pudo calcular: no hay un camino cargado cerca de la escuela, el camino cercano no llega a la ciudad cabecera o la ubicación cargada no coincide con su departamento. Es falta de dato: no significa acceso fácil ni difícil.',
  },
} as const

// `ETIQUETAS_AISLAMIENTO[n]` es siempre `DESCRIPCIONES_AISLAMIENTO[n].nombre`:
// una sola fuente para el nombre corto que usan leyenda, ficha y control.
export const ETIQUETAS_AISLAMIENTO = {
  0: DESCRIPCIONES_AISLAMIENTO[0].nombre,
  1: DESCRIPCIONES_AISLAMIENTO[1].nombre,
  2: DESCRIPCIONES_AISLAMIENTO[2].nombre,
  3: DESCRIPCIONES_AISLAMIENTO[3].nombre,
  sin_datos_red: DESCRIPCIONES_AISLAMIENTO.sin_datos_red.nombre,
} as const

export const ETIQUETAS_INUNDACION = {
  alto: 'Alto',
  medio: 'Medio',
  bajo: 'Bajo',
  sin_riesgo: 'Sin riesgo',
  sin_dato: 'Sin dato',
} as const

export const ETIQUETAS_CRUCE = {
  puente: 'Puente',
  vado: 'Vado',
  // OSM no tiene tag de puente en ese punto; NO confirma que no haya puente.
  sin_evidencia: 'Sin puente registrado',
} as const

export const DESCRIPCIONES_CRUCE = {
  puente: 'Cruce de agua con puente cargado en el mapa.',
  vado: 'Cruce de agua a nivel del cauce, sin puente. No dice si hoy se puede pasar.',
  sin_evidencia:
    'No hay puente cargado en el mapa en este cruce; puede existir sin estar cargado. No dice si hoy se puede pasar.',
} as const

export const MOTIVO_SIN_RUTA_GENERICO = 'No hay recorrido calculado para esta escuela.'

export const MOTIVOS_SIN_RUTA: Record<string, string> = {
  sin_conexion_red:
    'La escuela no conecta con la red de caminos hasta la ciudad cabecera, así que no se calculó un recorrido.',
  coordenada_fuera_de_departamento:
    'La ubicación cargada de la escuela cae fuera de su departamento. Para no mostrar un dato en un lugar equivocado, no se calculó nada. Conviene revisar la ubicación en el padrón.',
  red_vial_no_conectada:
    'Hay un camino a menos de 5 km, pero no se conecta con los caminos principales ni llega a la ciudad cabecera, así que no se dibuja un recorrido. Es falta de dato: no significa que la escuela sea inaccesible.',
  sin_via_osm_cercana:
    'No hay caminos cargados en OpenStreetMap a menos de 5 km de la escuela, así que no se puede calcular. Es falta de dato, no acceso fácil ni difícil.',
  ruta_degenerada: 'La escuela está junto a la ciudad cabecera de su departamento: no hay recorrido para dibujar.',
  sin_geometria_importada: 'Todavía no se cargó el recorrido de esta escuela.',
}

export function textoMotivoSinRuta(motivo: string | null | undefined): string {
  return (motivo && MOTIVOS_SIN_RUTA[motivo]) || MOTIVO_SIN_RUTA_GENERICO
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
  sin_evidencia: 'infra-icono-cruce-sin-evidencia',
} as const

// Id del ícono de aislamiento para un nivel del payload (incluye la fila
// 'sin_datos_red', que también es cobertura parcial).
export function iconoAislamiento(nivel: NivelAislamientoMapa): string {
  return nivel === 'sin_datos_red'
    ? ID_ICONO_AISLAMIENTO_SIN_DATOS
    : ID_ICONO_AISLAMIENTO[nivel]
}

// Paths copiados tal cual de `lucide-react` v1.34.0 (route.mjs, route-off.mjs,
// droplets.mjs, waves-horizontal.mjs, circle-question-mark.mjs). Se duplican
// como string porque `map.addImage` necesita un SVG standalone, no un
// componente React; los paths son la única copia desacoplada.
const PATH_AISLAMIENTO =
  '<circle cx="6" cy="19" r="3" />' +
  '<path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />' +
  '<circle cx="18" cy="5" r="3" />'

const PATH_AISLAMIENTO_OFF =
  '<circle cx="6" cy="19" r="3" />' +
  '<path d="M9 19h8.5c.4 0 .9-.1 1.3-.2" />' +
  '<path d="M5.2 5.2A3.5 3.53 0 0 0 6.5 12H12" />' +
  '<path d="m2 2 20 20" />' +
  '<path d="M21 15.3a3.5 3.5 0 0 0-3.3-3.3" />' +
  '<path d="M15 5h-4.3" />' +
  '<circle cx="18" cy="5" r="3" />'

const PATH_INUNDACION =
  '<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z" />' +
  '<path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97" />'

// Puente: dibujo propio autoexplicativo (tablero + arco + dos pilares), sólo
// trazo.
const PATH_CRUCE_PUENTE =
  '<path d="M3 15h18" />' +
  '<path d="M5 15a7 7 0 0 1 14 0" />' +
  '<path d="M5 15v5" />' +
  '<path d="M19 15v5" />'

// Olas (Waves): trazos copiados de `waves-horizontal.mjs` de lucide-react v1.34.0.
const PATH_CRUCE_VADO =
  '<path d="M2 12q2.5 2 5 0t5 0 5 0 5 0" />' +
  '<path d="M2 19q2.5 2 5 0t5 0 5 0 5 0" />' +
  '<path d="M2 5q2.5 2 5 0t5 0 5 0 5 0" />'

// Ayuda (CircleHelp): trazos copiados de `circle-question-mark.mjs` de lucide-react v1.34.0.
// Se omite el círculo de Lucide para evitar un anillo doble; el badge ya aporta el contorno.
const PATH_CRUCE_SIN_EVIDENCIA =
  '<path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />' +
  '<path d="M12 17h.01" />'

// Colores de los tokens semánticos de `app/globals.css` para el tema claro.
const COLOR_CRUCE_PUENTE = '#356f23' // --ok
const COLOR_CRUCE_VADO = '#b45f04' // --warn
const COLOR_CRUCE_SIN_EVIDENCIA = '#5f5e5c' // --ink-soft

export const SVG_ICONO_AISLAMIENTO_0 = construirSvgIcono(
  PATH_AISLAMIENTO,
  PALETA_TONAL_AISLAMIENTO[0],
  '#1c1c1c',
)
export const SVG_ICONO_AISLAMIENTO_1 = construirSvgIcono(
  PATH_AISLAMIENTO,
  PALETA_TONAL_AISLAMIENTO[1],
  '#1c1c1c',
)
export const SVG_ICONO_AISLAMIENTO_2 = construirSvgIcono(
  PATH_AISLAMIENTO,
  PALETA_TONAL_AISLAMIENTO[2],
  '#ffffff',
)
export const SVG_ICONO_AISLAMIENTO_3 = construirSvgIcono(
  PATH_AISLAMIENTO,
  PALETA_TONAL_AISLAMIENTO[3],
  '#ffffff',
)
export const SVG_ICONO_AISLAMIENTO_SIN_DATOS = construirSvgIcono(
  PATH_AISLAMIENTO_OFF,
  '#ffffff',
  '#6b7280',
  '#9ca3af',
)

export const SVG_ICONO_INUNDACION_BAJA = construirSvgIcono(
  PATH_INUNDACION,
  PALETA_TONAL_INUNDACION.bajo,
  '#1c1c1c',
)
export const SVG_ICONO_INUNDACION_MEDIA = construirSvgIcono(
  PATH_INUNDACION,
  PALETA_TONAL_INUNDACION.medio,
  '#1c1c1c',
)
export const SVG_ICONO_INUNDACION_ALTA = construirSvgIcono(
  PATH_INUNDACION,
  PALETA_TONAL_INUNDACION.alto,
  '#ffffff',
)

export const SVG_ICONO_CRUCE_PUENTE = construirSvgIcono(
  PATH_CRUCE_PUENTE,
  '#ffffff',
  COLOR_CRUCE_PUENTE,
  COLOR_CRUCE_PUENTE,
)
export const SVG_ICONO_CRUCE_VADO = construirSvgIcono(
  PATH_CRUCE_VADO,
  '#ffffff',
  COLOR_CRUCE_VADO,
  COLOR_CRUCE_VADO,
)
export const SVG_ICONO_CRUCE_SIN_EVIDENCIA = construirSvgIcono(
  PATH_CRUCE_SIN_EVIDENCIA,
  '#ffffff',
  COLOR_CRUCE_SIN_EVIDENCIA,
  COLOR_CRUCE_SIN_EVIDENCIA,
)

export const ICONOS_ACCESOS_MAPA: ReadonlyArray<{ id: string; svg: string }> = [
  { id: ID_ICONO_AISLAMIENTO[0], svg: SVG_ICONO_AISLAMIENTO_0 },
  { id: ID_ICONO_AISLAMIENTO[1], svg: SVG_ICONO_AISLAMIENTO_1 },
  { id: ID_ICONO_AISLAMIENTO[2], svg: SVG_ICONO_AISLAMIENTO_2 },
  { id: ID_ICONO_AISLAMIENTO[3], svg: SVG_ICONO_AISLAMIENTO_3 },
  { id: ID_ICONO_AISLAMIENTO_SIN_DATOS, svg: SVG_ICONO_AISLAMIENTO_SIN_DATOS },
  { id: ID_ICONO_INUNDACION.bajo, svg: SVG_ICONO_INUNDACION_BAJA },
  { id: ID_ICONO_INUNDACION.medio, svg: SVG_ICONO_INUNDACION_MEDIA },
  { id: ID_ICONO_INUNDACION.alto, svg: SVG_ICONO_INUNDACION_ALTA },
  { id: ID_ICONO_CRUCE.puente, svg: SVG_ICONO_CRUCE_PUENTE },
  { id: ID_ICONO_CRUCE.vado, svg: SVG_ICONO_CRUCE_VADO },
  { id: ID_ICONO_CRUCE.sin_evidencia, svg: SVG_ICONO_CRUCE_SIN_EVIDENCIA },
]

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

// Cruces de agua clasificados sobre la ruta. Colección vacía cuando la
// geometría no está disponible.
export function construirCrucesAcceso(
  g: GeometriaAccesoRespuesta | null,
): GeoJSON.FeatureCollection<GeoJSON.Point, CruceAccesoProps> {
  if (g === null || !g.disponible || g.cruces === undefined) {
    return { type: 'FeatureCollection', features: [] }
  }

  const features = g.cruces.map(
    (cruce): GeoJSON.Feature<GeoJSON.Point, CruceAccesoProps> => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [cruce.lon, cruce.lat] },
      properties: {
        clasificacion: cruce.clasificacion,
        icono: ID_ICONO_CRUCE[cruce.clasificacion],
        etiqueta: ETIQUETAS_CRUCE[cruce.clasificacion],
      },
    }),
  )

  return { type: 'FeatureCollection', features }
}
