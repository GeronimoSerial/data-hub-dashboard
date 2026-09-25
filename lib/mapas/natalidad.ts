// Transforms puros para el mapa de natalidad (/mapas/natalidad). Sin
// dependencias de React ni de MapLibre, así son testeables sin DOM y el
// script de extracción (scripts/extract-natalidad.mjs) los importa
// directamente (Node 24 soporta type-stripping de .ts sin loader extra).
//
// Fuentes (ver odd/tasks/mapa-natalidad.md):
// - Nacidos vivos por departamento y año (2014–2023), Power BI público
//   (DEIS / Ministerio de Capital Humano – OEI). Snapshot:
//   data/natalidad/nacidos-vivos-corrientes.json.
// - Oferta de nivel inicial (ciclo 2026), padrón Gestión Educativa, una fila
//   por CUE×sala. Snapshot: data/natalidad/inicial-2026-padron.json.
// - Coordenadas de CUEs: public/data/localizaciones.json.
import type { FeatureCollection, Point } from 'geojson'
import { normalizarNombreDepartamento } from './departamentos'

/**
 * Código de departamento reservado para nacimientos sin departamento
 * asignado en la fuente. Entra en los totales provinciales pero NUNCA en el
 * coroplético por departamento (no hay polígono al que asignarlo).
 */
export const CODIGO_DESCONOCIDO = '18999'

export interface NacidoVivoRow {
  anio: number
  coddpto: string
  departamento: string
  nacidosVivos: number
}

export interface InicialRow {
  cue_anexo: string
  nombre: string
  departamento: string
  localidad: string
  curso: string
  secciones: number
  alumnos_activos: number
}

export interface LocalizacionRow {
  cueAnexo: string
  nombre: string
  departamento: string
  localidad: string
  lat: number | null
  lon: number | null
  geoCalidad: string | null
}

/** Serie anual, clave = año como string (para poder viajar tal cual por JSON). */
export type SerieAnual = Record<string, number>

export interface Variacion {
  /** fin - inicio, en unidades absolutas de la serie. */
  abs: number
  /** (fin - inicio) / inicio * 100, o null si el valor inicial es 0 (división inválida). */
  pct: number | null
}

/** Variación entre dos años cualesquiera de una serie anual (valores ausentes = 0). */
export function calcularVariacion(
  serie: SerieAnual,
  anioInicio: number,
  anioFin: number,
): Variacion {
  const inicio = serie[String(anioInicio)] ?? 0
  const fin = serie[String(anioFin)] ?? 0
  const abs = fin - inicio
  const pct = inicio > 0 ? (abs / inicio) * 100 : null
  return { abs, pct }
}

// ── Nacimientos por departamento ────────────────────────────────────────────

export interface NacimientosPorDepartamento {
  /** Nombre de origen (tal cual figura en la fuente, sin normalizar). */
  nombre: string
  coddpto: string
  serie: SerieAnual
}

export interface AgregacionNacimientos {
  /** Clave = normalizarNombreDepartamento(departamento). */
  porDepartamento: Map<string, NacimientosPorDepartamento>
  /** Serie provincial, INCLUYE los nacimientos de coddpto DESCONOCIDO. */
  provincia: SerieAnual
}

/**
 * Agrupa nacidos vivos por departamento y año. DESCONOCIDO (coddpto ===
 * CODIGO_DESCONOCIDO) suma al total provincial pero se excluye del mapa
 * `porDepartamento` — no tiene departamento real que colorear.
 */
export function agruparNacimientosPorDepartamento(
  rows: NacidoVivoRow[],
): AgregacionNacimientos {
  const porDepartamento = new Map<string, NacimientosPorDepartamento>()
  const provincia: SerieAnual = {}

  for (const row of rows) {
    const anioKey = String(row.anio)
    provincia[anioKey] = (provincia[anioKey] ?? 0) + row.nacidosVivos

    if (row.coddpto === CODIGO_DESCONOCIDO) continue

    const clave = normalizarNombreDepartamento(row.departamento)
    let entry = porDepartamento.get(clave)
    if (!entry) {
      entry = { nombre: row.departamento, coddpto: row.coddpto, serie: {} }
      porDepartamento.set(clave, entry)
    }
    entry.serie[anioKey] = (entry.serie[anioKey] ?? 0) + row.nacidosVivos
  }

  return { porDepartamento, provincia }
}

// ── Oferta de nivel inicial por departamento ────────────────────────────────

export interface InicialAgregadoDepartamento {
  cues: Set<string>
  seccionesTotal: number
  /** Secciones sumadas por curso (Sala de 3, Plurisala, etc.). */
  seccionesPorCurso: Record<string, number>
}

/** Agrupa filas de inicial (una por CUE×sala) por departamento normalizado. */
export function agruparInicialPorDepartamento(
  rows: InicialRow[],
): Map<string, InicialAgregadoDepartamento> {
  const map = new Map<string, InicialAgregadoDepartamento>()

  for (const row of rows) {
    const clave = normalizarNombreDepartamento(row.departamento)
    let entry = map.get(clave)
    if (!entry) {
      entry = { cues: new Set(), seccionesTotal: 0, seccionesPorCurso: {} }
      map.set(clave, entry)
    }
    entry.cues.add(row.cue_anexo)
    entry.seccionesTotal += row.secciones
    entry.seccionesPorCurso[row.curso] =
      (entry.seccionesPorCurso[row.curso] ?? 0) + row.secciones
  }

  return map
}

// ── Escuelas de inicial (para el GeoJSON de puntos) ─────────────────────────

export interface SalaOferta {
  curso: string
  secciones: number
}

export interface EscuelaInicial {
  cueAnexo: string
  nombre: string
  departamento: string
  localidad: string
  salas: SalaOferta[]
  seccionesTotal: number
}

/**
 * Agrupa las filas de inicial (una por CUE×sala) en una escuela por CUE, con
 * su lista de salas. No incluye `alumnos_activos`: la matrícula oficial está
 * pendiente y no debe publicarse (ver odd/tasks/mapa-natalidad.md).
 */
export function agruparInicialPorCue(rows: InicialRow[]): Map<string, EscuelaInicial> {
  const map = new Map<string, EscuelaInicial>()

  for (const row of rows) {
    let entry = map.get(row.cue_anexo)
    if (!entry) {
      entry = {
        cueAnexo: row.cue_anexo,
        nombre: row.nombre,
        departamento: row.departamento,
        localidad: row.localidad,
        salas: [],
        seccionesTotal: 0,
      }
      map.set(row.cue_anexo, entry)
    }
    entry.salas.push({ curso: row.curso, secciones: row.secciones })
    entry.seccionesTotal += row.secciones
  }

  return map
}

export type EscuelaInicialProperties = EscuelaInicial

export interface ResultadoFeaturesInicial {
  featureCollection: FeatureCollection<Point, EscuelaInicialProperties>
  /** CUEs con oferta de inicial que no tienen coordenadas en localizaciones.json. */
  cuesSinCoordenadas: number
  cuesTotal: number
}

/**
 * Construye el FeatureCollection de puntos de escuelas de inicial, cruzando
 * contra las coordenadas de localizaciones.json por cueAnexo. Un CUE sin
 * coordenadas (o con lat/lon null) no genera feature — se cuenta en
 * `cuesSinCoordenadas`, nunca se descarta en silencio (el llamador lo loguea).
 */
export function construirFeatureCollectionInicial(
  escuelasPorCue: Map<string, EscuelaInicial>,
  localizaciones: LocalizacionRow[],
): ResultadoFeaturesInicial {
  const coordsPorCue = new Map(localizaciones.map((l) => [l.cueAnexo, l]))
  const features: FeatureCollection<Point, EscuelaInicialProperties>['features'] = []
  let cuesSinCoordenadas = 0

  for (const escuela of escuelasPorCue.values()) {
    const loc = coordsPorCue.get(escuela.cueAnexo)
    if (!loc || loc.lat == null || loc.lon == null) {
      cuesSinCoordenadas += 1
      continue
    }
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [loc.lon, loc.lat] },
      properties: escuela,
    })
  }

  return {
    featureCollection: { type: 'FeatureCollection', features },
    cuesSinCoordenadas,
    cuesTotal: escuelasPorCue.size,
  }
}

// ── Combinado: departamentos.json ───────────────────────────────────────────

export interface DepartamentoNatalidad {
  /** Clave normalizada (mayúsculas, sin diacríticos) — matchea el GeoJSON. */
  clave: string
  /** Nombre de exhibición: el del GeoJSON si matcheó, si no el de la fuente. */
  nombre: string
  coddpto: string | null
  serie: SerieAnual
  variacion: Variacion
  inicial: {
    cues: number
    seccionesTotal: number
    seccionesPorCurso: Record<string, number>
  }
}

export interface FuenteNatalidad {
  nombre: string
  url: string
}

export interface DatosNatalidad {
  meta: {
    fuenteNatalidad: FuenteNatalidad
    fuenteInicial: string
    anioInicio: number
    anioFin: number
    anios: number[]
    extraidoEn: string
  }
  provincia: {
    serie: SerieAnual
    variacion: Variacion
  }
  departamentos: DepartamentoNatalidad[]
  /** Nombres de origen (sin normalizar) que no matchearon ningún departamento del GeoJSON. */
  departamentosSinMatch: string[]
}

/**
 * Combina nacimientos + oferta de inicial en la estructura pública de
 * public/data/natalidad/departamentos.json. Un departamento de la fuente que
 * no matchea ningún nombre conocido (GeoJSON) NUNCA se descarta en
 * silencio: queda en el resultado con su nombre de origen y se reporta en
 * `departamentosSinMatch`, igual que hace agregarEscuelasCaidasPorDepartamento
 * en lib/mapas/departamentos.ts.
 */
export function construirDatosNatalidad(params: {
  nacimientos: NacidoVivoRow[]
  inicial: InicialRow[]
  nombresDepartamentosConocidos: string[]
  fuenteNatalidad: FuenteNatalidad
  fuenteInicial: string
  extraidoEn: string
}): DatosNatalidad {
  const {
    nacimientos,
    inicial,
    nombresDepartamentosConocidos,
    fuenteNatalidad,
    fuenteInicial,
    extraidoEn,
  } = params

  const anios = [...new Set(nacimientos.map((r) => r.anio))].sort((a, b) => a - b)
  const anioInicio = anios[0] ?? 0
  const anioFin = anios[anios.length - 1] ?? 0

  const conocidosPorClave = new Map(
    nombresDepartamentosConocidos.map((nombre) => [normalizarNombreDepartamento(nombre), nombre]),
  )

  const { porDepartamento: natalidadPorDpto, provincia } =
    agruparNacimientosPorDepartamento(nacimientos)
  const inicialPorDpto = agruparInicialPorDepartamento(inicial)

  const sinMatch = new Set<string>()
  const departamentos: DepartamentoNatalidad[] = []

  for (const [clave, entry] of natalidadPorDpto) {
    const nombreConocido = conocidosPorClave.get(clave)
    if (!nombreConocido) sinMatch.add(entry.nombre)

    const inicialEntry = inicialPorDpto.get(clave)

    departamentos.push({
      clave,
      nombre: nombreConocido ?? entry.nombre,
      coddpto: entry.coddpto,
      serie: entry.serie,
      variacion: calcularVariacion(entry.serie, anioInicio, anioFin),
      inicial: inicialEntry
        ? {
            cues: inicialEntry.cues.size,
            seccionesTotal: inicialEntry.seccionesTotal,
            seccionesPorCurso: inicialEntry.seccionesPorCurso,
          }
        : { cues: 0, seccionesTotal: 0, seccionesPorCurso: {} },
    })
  }

  departamentos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  return {
    meta: { fuenteNatalidad, fuenteInicial, anioInicio, anioFin, anios, extraidoEn },
    provincia: {
      serie: provincia,
      variacion: calcularVariacion(provincia, anioInicio, anioFin),
    },
    departamentos,
    departamentosSinMatch: [...sinMatch],
  }
}

// ── Escalas de color del coroplético ────────────────────────────────────────
//
// Semántica tipo 'step' de MapLibre: dado un valor y una lista de breaks
// ascendente, colors[0] cubre "< breaks[0]", colors[i] cubre
// "breaks[i-1] <= valor < breaks[i]", y colors[last] cubre "valor >=
// breaks[last]". construirExpresionStep produce la MISMA semántica como
// expresión de MapLibre, así que el color que ve un usuario en el mapa nunca
// puede desincronizarse del que calculan estas funciones (p. ej. para la
// leyenda).

/** Paleta secuencial (nacimientos en un año): claro→oscuro, 5 clases. Legible en tema claro y oscuro. */
export const PALETA_SECUENCIAL = ['#eff6ff', '#93c5fd', '#3b82f6', '#1d4ed8', '#1e3a8a']

/** Color para un departamento sin dato (p. ej. sin match geográfico). Neutro, no confundible con ninguna clase real. */
export const COLOR_SIN_DATO = '#9ca3af'

export interface EscalaSecuencial {
  /** Umbrales ascendentes, longitud = colors.length - 1. */
  breaks: number[]
  colors: string[]
}

/**
 * Escala de cuantiles sobre `valores` (nacimientos crudos varían mucho por
 * tamaño de departamento — Capital vs. Berón de Astrada —, así que un cuantil
 * reparte los 25 departamentos entre las clases en vez de un umbral fijo que
 * dejaría casi todo en la clase más baja).
 */
export function construirEscalaSecuencial(valores: number[]): EscalaSecuencial {
  const ordenados = [...valores].sort((a, b) => a - b)
  const n = ordenados.length
  if (n === 0) return { breaks: [], colors: [PALETA_SECUENCIAL[0]] }

  const cuantiles = [0.2, 0.4, 0.6, 0.8].map(
    (q) => ordenados[Math.min(n - 1, Math.floor(q * (n - 1)))],
  )
  const breaks = [...new Set(cuantiles)].sort((a, b) => a - b)
  const colors = PALETA_SECUENCIAL.slice(0, breaks.length + 1)
  return { breaks, colors }
}

/**
 * Escala divergente (% variación entre dos años): rojo = caída, azul =
 * crecimiento, centrada en 0. Umbrales fijos (no por cuantil): a diferencia
 * de nacimientos crudos, un % es comparable entre departamentos sin importar
 * su tamaño, así que una escala fija es más legible en la leyenda ("caída
 * >40%", etc.) y estable entre pares de años distintos.
 */
export const ESCALA_VARIACION_BREAKS = [-40, -25, -10, 0, 10, 25]
export const ESCALA_VARIACION_COLORS = [
  '#7f1d1d',
  '#b91c1c',
  '#ef4444',
  '#fca5a5',
  '#bfdbfe',
  '#60a5fa',
  '#1d4ed8',
]

/** Color por umbrales tipo 'step' (ver semántica arriba). */
export function colorEscalonado(valor: number, breaks: number[], colors: string[]): string {
  let idx = 0
  for (let i = 0; i < breaks.length; i++) {
    if (valor >= breaks[i]) idx = i + 1
  }
  return colors[idx]
}

export function colorSecuencial(valor: number, escala: EscalaSecuencial): string {
  return colorEscalonado(valor, escala.breaks, escala.colors)
}

/** null (sin dato — inicio de serie en 0, división inválida) pinta COLOR_SIN_DATO, nunca 0%. */
export function colorVariacion(pct: number | null): string {
  if (pct == null) return COLOR_SIN_DATO
  return colorEscalonado(pct, ESCALA_VARIACION_BREAKS, ESCALA_VARIACION_COLORS)
}

/**
 * Expresión MapLibre 'step' equivalente a colorEscalonado(valor, breaks,
 * colors) sobre la propiedad `propiedad` de un feature. `['coalesce', ..., 0]`
 * cubre el instante sin esa propiedad todavía (mismo patrón que
 * fillPaintDepartamentos en map-infraestructura-page.tsx).
 */
/**
 * Puntos [x,y] normalizados a un lienzo `width`×`height` para dibujar una
 * mini-serie (sparkline SVG) de nacimientos 2014–2023. Y invertida (SVG
 * crece hacia abajo): el valor más alto de la serie queda arriba. Una serie
 * plana (max === min) se dibuja como una línea horizontal a mitad de altura,
 * en vez de dividir por cero.
 */
export function construirPuntosSparkline(
  serie: SerieAnual,
  anios: number[],
  width: number,
  height: number,
): [number, number][] {
  const valores = anios.map((anio) => serie[String(anio)] ?? 0)
  const max = Math.max(...valores)
  const min = Math.min(...valores)
  const rango = max - min

  return valores.map((valor, i) => {
    const x = anios.length > 1 ? (i / (anios.length - 1)) * width : width / 2
    const y = rango > 0 ? height - ((valor - min) / rango) * height : height / 2
    return [x, y]
  })
}

export function construirExpresionStep(
  breaks: number[],
  colors: string[],
  propiedad: string,
): unknown[] {
  const expresion: unknown[] = ['step', ['coalesce', ['get', propiedad], 0], colors[0]]
  for (let i = 0; i < breaks.length; i++) {
    expresion.push(breaks[i], colors[i + 1])
  }
  return expresion
}
