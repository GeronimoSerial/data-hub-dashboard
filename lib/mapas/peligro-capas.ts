// Módulo puro del "modo Radar" del mapa de infraestructura (E4): colores,
// coropleta departamental y capa de puntos de riesgo. Sin dependencias de
// React; sólo tipos de MapLibre y el normalizador de departamentos.
//
// Los contratos de nivel (`verde` | `amarillo` | `naranja` | `rojo` |
// `sin_dato`) viven en lib/infraestructura/riesgo/peligro/nivel.ts, que es la
// única fuente de verdad. El import es sólo de tipo, así que este módulo sigue
// siendo apto para el navegador (no arrastra la capa de base de datos).

import type { FeatureCollection, Geometry, Point } from 'geojson'
import type {
  CircleLayerSpecification,
  DataDrivenPropertyValueSpecification,
  FillLayerSpecification,
} from 'maplibre-gl'
import type { NivelPeligro } from '@/lib/infraestructura/riesgo/peligro/nivel'
import { normalizarNombreDepartamento } from '@/lib/mapas/departamentos'

// ── Colores de nivel de peligro ─────────────────────────────────────────────
//
// GOTCHA: una paint expression de MapLibre NO puede leer variables CSS, así
// que estos 5 colores se repiten acá como hex literales. Son la copia en
// TypeScript de los tokens definidos en app/globals.css:
//
//   --nivel-peligro-verde    → var(--green)     → #719c29  (globals.css:131)
//   --nivel-peligro-amarillo → var(--yellow)    → #facd05  (globals.css:132)
//   --nivel-peligro-naranja  → var(--orange)    → #f68e13  (globals.css:133)
//   --nivel-peligro-rojo     → var(--red)       → #f4492e  (globals.css:134)
//   --nivel-peligro-sin-dato → var(--ink-faint) → #8a8886  (globals.css:135)
//
// Si alguno de esos tokens cambia en globals.css, HAY QUE actualizar este mapa
// A MANO: no existe forma de resolverlos desde el motor de estilos del mapa.
export const COLOR_NIVEL_PELIGRO: Record<NivelPeligro, string> = {
  verde: '#719c29',
  amarillo: '#facd05',
  naranja: '#f68e13',
  rojo: '#f4492e',
  sin_dato: '#8a8886',
}

// Orden de menor a mayor peligro, con `sin_dato` siempre al final. Se usa para
// construir leyendas y matches de forma consistente.
export const NIVELES_PELIGRO = ['verde', 'amarillo', 'naranja', 'rojo', 'sin_dato'] as const

export function esNivelPeligro(valor: unknown): valor is NivelPeligro {
  return typeof valor === 'string' && (NIVELES_PELIGRO as readonly string[]).includes(valor)
}

// Etiquetas de texto: la leyenda nunca debe depender sólo del color, así que
// cada nivel viaja con su nombre en español neutro. `sin_dato` es fijo.
export const ETIQUETA_NIVEL_PELIGRO: Record<NivelPeligro, string> = {
  verde: 'Bajo',
  amarillo: 'Medio',
  naranja: 'Alto',
  rojo: 'Muy alto',
  sin_dato: 'Sin dato',
}

// ── Coropleta departamental ─────────────────────────────────────────────────

// Propiedades mínimas que necesitamos del GeoJSON real de departamentos. El
// índice permite conservar el resto de las propiedades (id, provincia, etc.)
// al copiar cada feature.
export interface PropiedadesDepartamentoRadar {
  nombre?: string
  nivelPeligro?: NivelPeligro
  [clave: string]: unknown
}

export interface NivelPorDepartamento {
  departamento: string
  // Se tipa como `string` (no `NivelPeligro`) a propósito: el dato viene de
  // una respuesta HTTP sin garantía de forma, así que se valida en runtime con
  // `esNivelPeligro` antes de aceptarlo. Cualquier valor desconocido cae en
  // `sin_dato`, nunca en `undefined`.
  peorNivel: string
}

/**
 * Devuelve una COPIA del FeatureCollection de departamentos con una propiedad
 * nueva `nivelPeligro` en cada feature. El cruce se hace normalizando AMBOS
 * lados (`normalizarNombreDepartamento`), porque el radar y el GeoJSON pueden
 * diferir en mayúsculas y tildes.
 *
 * Un departamento del GeoJSON sin fila en `niveles` queda EXPLÍCITAMENTE en
 * `'sin_dato'` (nunca `undefined`, nunca `'verde'`). Si `niveles` trae varias
 * filas por departamento (p. ej. una por horizonte), la última gana: el
 * llamador debe filtrar al horizonte activo antes de invocar esta función.
 */
export function construirCoropletaPeligro(
  departamentosGeoJSON: FeatureCollection<Geometry, PropiedadesDepartamentoRadar>,
  niveles: NivelPorDepartamento[],
): FeatureCollection<Geometry, PropiedadesDepartamentoRadar> {
  const nivelPorNombre = new Map<string, NivelPeligro>()
  for (const item of niveles) {
    if (esNivelPeligro(item.peorNivel)) {
      nivelPorNombre.set(normalizarNombreDepartamento(item.departamento), item.peorNivel)
    }
  }

  const features = departamentosGeoJSON.features.map((feature) => {
    const nombre = feature.properties?.nombre ?? ''
    const nivel = nivelPorNombre.get(normalizarNombreDepartamento(nombre))
    return {
      ...feature,
      properties: {
        ...feature.properties,
        nivelPeligro: nivel ?? 'sin_dato',
      },
    }
  })

  return { ...departamentosGeoJSON, features }
}

/**
 * Paint de la capa `fill` de la coropleta: un `match` sobre `nivelPeligro` con
 * un color hex por nivel y `sin_dato` como fallback final (cubre feature sin
 * la propiedad o con un valor inesperado).
 */
export function paintCoropletaPeligro(): FillLayerSpecification['paint'] {
  const expresion: unknown[] = ['match', ['get', 'nivelPeligro']]
  for (const nivel of NIVELES_PELIGRO) {
    if (nivel === 'sin_dato') continue
    expresion.push(nivel, COLOR_NIVEL_PELIGRO[nivel])
  }
  expresion.push(COLOR_NIVEL_PELIGRO.sin_dato)

  return {
    'fill-color': expresion as unknown as DataDrivenPropertyValueSpecification<string>,
  }
}

// Peor nivel entre varias filas (batch E7c, modo Replay): un cuadro de replay
// entrega el nivel de peligro por CELDA de grilla (geometryRef), no por
// departamento — para pintar la coropleta con `construirCoropletaPeligro` (que
// espera un peor-nivel por departamento) hay que reducir esas celdas a una
// sola fila primero. Valores desconocidos o `'sin_dato'` se ignoran para el
// ranking; si NINGUNA fila es un nivel real, el resultado es `'sin_dato'`
// (nunca se inventa un nivel a partir de un arreglo vacío).
export function peorNivelEntre(niveles: string[]): NivelPeligro {
  let peor: NivelPeligro = 'sin_dato'
  let peorIndice = -1
  for (const nivel of niveles) {
    if (!esNivelPeligro(nivel) || nivel === 'sin_dato') continue
    const indice = NIVELES_PELIGRO.indexOf(nivel)
    if (indice > peorIndice) {
      peorIndice = indice
      peor = nivel
    }
  }
  return peor
}

// ── Puntos de riesgo por escuela ────────────────────────────────────────────

export interface EscuelaConCoordenadas {
  cueAnexo: string
  lat: number
  lon: number
}

export interface RiesgoEscuela {
  nivelRiesgo: string | null
  confianza: string
}

export interface PropiedadesPuntoRiesgo {
  cueAnexo: string
  // Vocabulario de riesgo (`bajo` | `moderado` | `alto` | `muy_alto`) o
  // `'sin_dato'`. Se conserva tal cual viene del radar a propósito: el
  // mapeo a color lo hace `paintPuntosRiesgo`.
  nivelRiesgo: string
  confianza: string
}

/**
 * Un Feature/Point por escuela. Si el `cueAnexo` no está en `riesgoPorCue`
 * (o su `nivelRiesgo` es null) el punto queda en `'sin_dato'`; `confianza`
 * cae a `'baja'` como default explícito para no inventar certeza.
 */
export function construirPuntosRiesgo(
  escuelasConCoordenadas: EscuelaConCoordenadas[],
  riesgoPorCue: Map<string, RiesgoEscuela>,
): FeatureCollection<Point, PropiedadesPuntoRiesgo> {
  const features = escuelasConCoordenadas.map((escuela) => {
    const riesgo = riesgoPorCue.get(escuela.cueAnexo)
    return {
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [escuela.lon, escuela.lat] as [number, number],
      },
      properties: {
        cueAnexo: escuela.cueAnexo,
        nivelRiesgo: riesgo?.nivelRiesgo ?? 'sin_dato',
        confianza: riesgo?.confianza ?? 'baja',
      },
    }
  })

  return { type: 'FeatureCollection', features }
}

// Puente entre el vocabulario de riesgo del radar (escuelas.nivelRiesgo) y el
// vocabulario de peligro de la coropleta, para que ambas capas compartan la
// misma paleta `COLOR_NIVEL_PELIGRO`.
const NIVEL_RIESGO_A_PELIGRO: Array<[string, NivelPeligro]> = [
  ['bajo', 'verde'],
  ['moderado', 'amarillo'],
  ['alto', 'naranja'],
  ['muy_alto', 'rojo'],
]

/**
 * Paint mínimo de `circle-color` para la capa de puntos de riesgo: un `match`
 * sobre `nivelRiesgo` que reutiliza los MISMOS 5 colores de la coropleta, con
 * `sin_dato` como fallback. La forma (círculo relleno) y su contraste con
 * "afectación confirmada" los decide la integración: acá sólo vive el color.
 */
export function paintPuntosRiesgo(): CircleLayerSpecification['paint'] {
  const expresion: unknown[] = ['match', ['get', 'nivelRiesgo']]
  for (const [nivelRiesgo, nivelPeligro] of NIVEL_RIESGO_A_PELIGRO) {
    expresion.push(nivelRiesgo, COLOR_NIVEL_PELIGRO[nivelPeligro])
  }
  expresion.push(COLOR_NIVEL_PELIGRO.sin_dato)

  return {
    'circle-color': expresion as unknown as DataDrivenPropertyValueSpecification<string>,
  }
}

// ── Puntos de riesgo de acceso ──────────────────────────────────────────────
//
// Dimensión SEPARADA del riesgo compuesto (ver capasRadarVisibles['riesgo-acceso']
// en map-types.ts / layer-control.tsx): el acceso no es una severidad del
// edificio, es "caminos y cruces". Capa HERMANA de construirPuntosRiesgo, no
// una variante: comparte el mismo patrón (Feature/Point por escuela, 'sin
// dato' explícito) pero con su propio vocabulario de nivel.

export interface RiesgoAccesoEscuela {
  nivel: 'bajo' | 'moderado' | 'alto' | null
}

export interface PropiedadesPuntoRiesgoAcceso {
  cueAnexo: string
  // 'bajo' | 'moderado' | 'alto' | 'sin_cobertura'. `null` (sin cobertura OSM
  // o escuela sin fila en riesgoAccesoPorCue) se traduce a 'sin_cobertura'
  // acá, nunca a 'bajo': ausencia de dato no es bajo riesgo.
  nivelAcceso: string
}

/**
 * Un Feature/Point por escuela para la capa de riesgo de acceso. Si el
 * `cueAnexo` no está en `riesgoAccesoPorCue` (o su `nivel` es null) el punto
 * queda en `'sin_cobertura'`, nunca `'bajo'`.
 */
export function construirPuntosRiesgoAcceso(
  escuelasConCoordenadas: EscuelaConCoordenadas[],
  riesgoAccesoPorCue: Map<string, RiesgoAccesoEscuela>,
): FeatureCollection<Point, PropiedadesPuntoRiesgoAcceso> {
  const features = escuelasConCoordenadas.map((escuela) => {
    const riesgo = riesgoAccesoPorCue.get(escuela.cueAnexo)
    return {
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [escuela.lon, escuela.lat] as [number, number],
      },
      properties: {
        cueAnexo: escuela.cueAnexo,
        nivelAcceso: riesgo?.nivel ?? 'sin_cobertura',
      },
    }
  })

  return { type: 'FeatureCollection', features }
}

// Puente entre el vocabulario de riesgo de acceso y la paleta de peligro:
// 'bajo'/'moderado'/'alto' reusan verde/amarillo/naranja (mismos colores que
// el resto del mapa), 'sin_cobertura' reusa el gris neutro de 'sin_dato'. NO
// se usa rojo: 'alto' en acceso no es "muy_alto" de riesgo compuesto.
const NIVEL_ACCESO_A_PELIGRO: Array<[string, NivelPeligro]> = [
  ['bajo', 'verde'],
  ['moderado', 'amarillo'],
  ['alto', 'naranja'],
]

/**
 * Paint de `circle-color` para la capa de riesgo de acceso: un `match` sobre
 * `nivelAcceso` con la paleta de arriba y `sin_dato` (gris neutro) como
 * fallback para 'sin_cobertura' y cualquier valor inesperado.
 */
export function paintPuntosRiesgoAcceso(): CircleLayerSpecification['paint'] {
  const expresion: unknown[] = ['match', ['get', 'nivelAcceso']]
  for (const [nivelAcceso, nivelPeligro] of NIVEL_ACCESO_A_PELIGRO) {
    expresion.push(nivelAcceso, COLOR_NIVEL_PELIGRO[nivelPeligro])
  }
  expresion.push(COLOR_NIVEL_PELIGRO.sin_dato)

  return {
    'circle-color': expresion as unknown as DataDrivenPropertyValueSpecification<string>,
    // Marca visual que NO depende sólo del color (accesibilidad/daltonismo):
    // 'alto' tiene un trazo (stroke) más ancho y opaco que el resto, un
    // anillo distintivo igual que el criterio ya usado en circlePaintPartes
    // para 'servicio' (ver map-infraestructura-page.tsx).
    'circle-stroke-width': ['match', ['get', 'nivelAcceso'], 'alto', 3, 1],
    'circle-stroke-opacity': ['match', ['get', 'nivelAcceso'], 'alto', 1, 0.5],
    'circle-stroke-color': '#1c1c1c',
  } as CircleLayerSpecification['paint']
}
