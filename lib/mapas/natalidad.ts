// Transforms puros para el mapa de natalidad (/mapas/natalidad). Sin
// dependencias de React ni de MapLibre, así son testeables sin DOM y el
// script de extracción (scripts/extract-natalidad.mjs) los importa
// directamente (Node 24 soporta type-stripping de .ts sin loader extra).
//
// Fuentes (ver odd/tasks/mapa-natalidad.md):
// - Nacidos vivos por departamento y año (2014–2023), Power BI público
//   (DEIS / Ministerio de Capital Humano – OEI). Snapshot:
//   data/natalidad/nacidos-vivos-corrientes.json.
// - Localizaciones (T5): relevamiento GEO 2025-10-02, TODAS las escuelas de
//   la provincia (activas), con coordenadas propias — ya no depende de
//   public/data/localizaciones.json (que sigue usando el mapa de
//   infraestructura, sin tocar). Snapshot:
//   data/natalidad/localizaciones-geo-2025-10-02.json.
// - Secciones por nivel (T5): padrón Gestión Educativa, ciclo 2026, una fila
//   por CUE×nivel×curso, TODOS los niveles (Inicial/Primario/Secundario/
//   Superior/Servicios Educativos). Supersede a inicial-2026-padron.json
//   (sólo inicial, con alumnos_activos — ese archivo y su manejo se
//   eliminaron). Snapshot: data/natalidad/escuelas-2026-padron.json.
import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from 'geojson'
import { normalizarNombreDepartamento } from './departamentos'
import { distanciaMinimaAlContorno, puntoDentroDeFeatureCollection, type Punto } from './geo'

// ── Escuelas (GEO + padrón, todos los niveles) ──────────────────────────────

/** Niveles educativos tal como figuran en escuelas-2026-padron.json. */
export type Nivel = 'Inicial' | 'Primario' | 'Secundario' | 'Superior' | 'Servicios Educativos'

/** Orden de exhibición (filtro, leyenda, agregados) — Inicial primero por ser el eje del mapa. */
export const NIVELES: Nivel[] = ['Inicial', 'Primario', 'Secundario', 'Superior', 'Servicios Educativos']

/** Una fila de data/natalidad/localizaciones-geo-2025-10-02.json (relevamiento GEO). */
export interface GeoEscuelaRow {
  cueAnexo: string
  nombre: string
  estado: string
  sector: string
  ofertaTipo: string[]
  localidad: string
  departamento: string
  domicilio: string
  cui: number
  lat: number | null
  lon: number | null
}

/** Una fila de data/natalidad/escuelas-2026-padron.json (una por CUE×nivel×curso). */
export interface PadronRow {
  cue_anexo: string
  nombre: string
  departamento: string
  localidad: string
  nivel: Nivel
  curso: string
  secciones: number
}

export interface CursoOferta {
  curso: string
  secciones: number
}

/** Oferta de un nivel en una escuela: total de secciones + desglose por curso (salas de inicial, grados, años). */
export interface NivelOferta {
  nivel: Nivel
  secciones: number
  cursos: CursoOferta[]
}

/**
 * Agrupa filas del padrón (una por CUE×nivel×curso) en niveles por CUE, cada
 * uno con su desglose de cursos. Devuelve sólo los niveles con oferta (nunca
 * un NivelOferta con secciones: 0 para un nivel ausente).
 */
export function agruparPadronPorCue(rows: PadronRow[]): Map<string, NivelOferta[]> {
  const porCue = new Map<string, Map<Nivel, Map<string, number>>>()

  for (const row of rows) {
    let porNivel = porCue.get(row.cue_anexo)
    if (!porNivel) {
      porNivel = new Map()
      porCue.set(row.cue_anexo, porNivel)
    }
    let porCurso = porNivel.get(row.nivel)
    if (!porCurso) {
      porCurso = new Map()
      porNivel.set(row.nivel, porCurso)
    }
    porCurso.set(row.curso, (porCurso.get(row.curso) ?? 0) + row.secciones)
  }

  const resultado = new Map<string, NivelOferta[]>()
  for (const [cue, porNivel] of porCue) {
    const niveles = NIVELES.filter((nivel) => porNivel.has(nivel)).map((nivel) => {
      const cursos = [...porNivel.get(nivel)!.entries()].map(([curso, secciones]) => ({ curso, secciones }))
      return { nivel, secciones: cursos.reduce((total, c) => total + c.secciones, 0), cursos }
    })
    resultado.set(cue, niveles)
  }
  return resultado
}

// Mapeo best-effort de ofertaTipo (texto libre del relevamiento GEO, p. ej.
// "Común - Jardín de infantes") a Nivel, para escuelas del GEO que no
// aparecen en el padrón 2026 (nunca se descartan en silencio — ver
// construirEscuelasCompletas). Sólo cubre los patrones inequívocos: oferta
// "Especial"/"Adultos"/"Trayecto técnico"/artística no mapea a ningún nivel
// (se documenta como gap conocido, ver odd/tasks/mapa-natalidad.md).
const PATRONES_NIVEL_DESDE_OFERTA: [RegExp, Nivel][] = [
  [/jard[ií]n de infantes|jard[ií]n maternal|nivel inicial/i, 'Inicial'],
  [/primaria|egb/i, 'Primario'],
  [/secundari|polimodal/i, 'Secundario'],
  [/\bsnu\b/i, 'Superior'],
  [/servicios complementarios/i, 'Servicios Educativos'],
]

/** Infiere niveles a partir de ofertaTipo (ver PATRONES_NIVEL_DESDE_OFERTA). Puede devolver [] si ningún patrón matchea. */
export function inferirNivelesDesdeOferta(ofertaTipo: string[]): Nivel[] {
  const niveles = new Set<Nivel>()
  for (const oferta of ofertaTipo) {
    for (const [patron, nivel] of PATRONES_NIVEL_DESDE_OFERTA) {
      if (patron.test(oferta)) niveles.add(nivel)
    }
  }
  return NIVELES.filter((nivel) => niveles.has(nivel))
}

export interface ResultadoSaneoCoordenadas {
  /** Mismas filas de entrada; a las descartadas se les pone lat/lon en null. */
  rows: GeoEscuelaRow[]
  /** Filas descartadas (antes de sanear), con la distancia al contorno más cercano — para loguear, nunca se pierden en silencio. */
  descartadas: (GeoEscuelaRow & { distanciaKm: number })[]
}

/**
 * Anula lat/lon de las filas del GEO cuyas coordenadas caen fuera de la
 * provincia. Corrección 2026-09-25 (T5): un bounding box dejaba pasar puntos
 * lejos de cualquier departamento con tal de caer dentro del rectángulo que
 * envuelve a toda la provincia. Ahora se chequea point-in-polygon contra la
 * UNIÓN de los departamentos (`departamentos`, Polygon/MultiPolygon con
 * huecos — ver lib/mapas/geo.ts), y un punto que cae afuera se mantiene
 * igual si está a `toleranciaKm` o menos del contorno más cercano: la
 * geometría de los departamentos está simplificada y deja huecos a lo largo
 * de la costa del Paraná/Uruguay, así que una escuela ribereña real puede
 * caer un puñado de metros del otro lado de esa línea simplificada sin que
 * eso signifique que está fuera de la provincia.
 *
 * Una fila sin lat/lon pasa intacta (no es un caso de saneo, es un caso de
 * "sin dato" que maneja construirFeatureCollectionEscuelas). Las descartadas
 * quedan en `descartadas` (con su distancia al contorno) para que el
 * llamador las reporte (nunca se descartan en silencio).
 */
export function sanearCoordenadasFueraDeLimites(
  rows: GeoEscuelaRow[],
  departamentos: FeatureCollection<Polygon | MultiPolygon, unknown>,
  toleranciaKm = 1,
): ResultadoSaneoCoordenadas {
  const descartadas: (GeoEscuelaRow & { distanciaKm: number })[] = []

  const saneadas = rows.map((row) => {
    if (row.lat == null || row.lon == null) return row
    const punto: Punto = [row.lon, row.lat]
    if (puntoDentroDeFeatureCollection(punto, departamentos)) return row

    const distanciaKm = distanciaMinimaAlContorno(punto, departamentos)
    if (distanciaKm <= toleranciaKm) return row // hueco de la geometría simplificada (costa), no un error de coordenadas

    descartadas.push({ ...row, distanciaKm })
    return { ...row, lat: null, lon: null }
  })

  return { rows: saneadas, descartadas }
}

/** Una escuela ya cruzada (GEO + padrón), con lat/lon (puede ser null: sin coordenadas). */
export interface EscuelaCompleta {
  cueAnexo: string
  nombre: string
  departamento: string
  localidad: string
  /** null cuando la escuela viene sólo del padrón (sin fila GEO, ver padronSinGeo). */
  sector: string | null
  ofertaTipo: string[]
  domicilio: string | null
  /** Niveles con oferta, en orden NIVELES. Puede venir de inferirNivelesDesdeOferta si no hay fila de padrón (secciones: 0 en ese caso). */
  niveles: NivelOferta[]
  seccionesTotal: number
  /** true si el CUE tiene al menos una fila real en el padrón 2026 (no inferido). */
  tienePadron: boolean
  lat: number | null
  lon: number | null
}

export interface ResultadoEscuelasCompletas {
  escuelas: EscuelaCompleta[]
  /** CUEs del padrón sin fila en el GEO — no tienen coordenadas posibles, nunca se descartan en silencio: el llamador las loguea y quedan en `escuelas` con lat/lon null. */
  padronSinGeo: string[]
}

/**
 * Cruza el relevamiento GEO (todas las escuelas activas, con coordenadas) con
 * el padrón 2026 (niveles/secciones por CUE) para producir una escuela por
 * CUE. Un CUE del GEO sin fila de padrón se mantiene igual (tienePadron:
 * false, niveles inferidos de ofertaTipo cuando el mapeo es confiable — ver
 * inferirNivelesDesdeOferta) — nunca se oculta por falta de padrón. Un CUE
 * del padrón sin fila de GEO también se mantiene (sin coordenadas, no entra
 * al mapa pero sí a los agregados por departamento) y se reporta en
 * `padronSinGeo`.
 */
export function construirEscuelasCompletas(
  geo: GeoEscuelaRow[],
  padronRows: PadronRow[],
): ResultadoEscuelasCompletas {
  const padronPorCue = agruparPadronPorCue(padronRows)
  const metadataPadronPorCue = new Map<string, { nombre: string; departamento: string; localidad: string }>()
  for (const row of padronRows) {
    if (!metadataPadronPorCue.has(row.cue_anexo)) {
      metadataPadronPorCue.set(row.cue_anexo, {
        nombre: row.nombre,
        departamento: row.departamento,
        localidad: row.localidad,
      })
    }
  }

  const geoPorCue = new Set(geo.map((g) => g.cueAnexo))
  const escuelas: EscuelaCompleta[] = []

  for (const g of geo) {
    const nivelesPadron = padronPorCue.get(g.cueAnexo) ?? []
    const tienePadron = nivelesPadron.length > 0
    const niveles = tienePadron
      ? nivelesPadron
      : inferirNivelesDesdeOferta(g.ofertaTipo).map((nivel) => ({ nivel, secciones: 0, cursos: [] as CursoOferta[] }))

    escuelas.push({
      cueAnexo: g.cueAnexo,
      nombre: g.nombre,
      departamento: g.departamento,
      localidad: g.localidad,
      sector: g.sector,
      ofertaTipo: g.ofertaTipo,
      domicilio: g.domicilio,
      niveles,
      seccionesTotal: niveles.reduce((total, n) => total + n.secciones, 0),
      tienePadron,
      lat: g.lat,
      lon: g.lon,
    })
  }

  const padronSinGeo: string[] = []
  for (const [cue, niveles] of padronPorCue) {
    if (geoPorCue.has(cue)) continue
    padronSinGeo.push(cue)
    const meta = metadataPadronPorCue.get(cue)!
    escuelas.push({
      cueAnexo: cue,
      nombre: meta.nombre,
      departamento: meta.departamento,
      localidad: meta.localidad,
      sector: null,
      ofertaTipo: [],
      domicilio: null,
      niveles,
      seccionesTotal: niveles.reduce((total, n) => total + n.secciones, 0),
      tienePadron: true,
      lat: null,
      lon: null,
    })
  }

  return { escuelas, padronSinGeo }
}

/** Propiedades de un feature de escuela: la escuela completa, sin lat/lon (van en geometry.coordinates). */
export type EscuelaProperties = Omit<EscuelaCompleta, 'lat' | 'lon'> & { esInicial: boolean }

export interface ResultadoFeatureCollectionEscuelas {
  featureCollection: FeatureCollection<Point, EscuelaProperties>
  /** Escuelas sin coordenadas utilizables (sin fila GEO, o con lat/lon null en el GEO) — no generan feature. */
  sinCoordenadas: number
}

/**
 * Construye el FeatureCollection de puntos de TODAS las escuelas con
 * coordenadas válidas. `esInicial` es una propiedad plana (además de
 * `niveles`) para que el mapa pueda resaltar visualmente las escuelas con
 * oferta de inicial sin tener que inspeccionar el array completo en cada
 * paint.
 */
export function construirFeatureCollectionEscuelas(
  escuelas: EscuelaCompleta[],
): ResultadoFeatureCollectionEscuelas {
  const features: FeatureCollection<Point, EscuelaProperties>['features'] = []
  let sinCoordenadas = 0

  for (const escuela of escuelas) {
    if (escuela.lat == null || escuela.lon == null) {
      sinCoordenadas += 1
      continue
    }
    const { lat, lon, ...propiedadesBase } = escuela
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: { ...propiedadesBase, esInicial: escuela.niveles.some((n) => n.nivel === 'Inicial') },
    })
  }

  return { featureCollection: { type: 'FeatureCollection', features }, sinCoordenadas }
}

export interface AgregadoNivelDepartamento {
  escuelas: number
  secciones: number
}

export interface AgregadoEscuelasDepartamento {
  porNivel: Record<Nivel, AgregadoNivelDepartamento>
  /** Sólo para Inicial: secciones sumadas por sala (Sala de 3, Plurisala, etc.). */
  inicialSeccionesPorCurso: Record<string, number>
}

function agregadoNivelVacio(): Record<Nivel, AgregadoNivelDepartamento> {
  return Object.fromEntries(NIVELES.map((nivel) => [nivel, { escuelas: 0, secciones: 0 }])) as Record<
    Nivel,
    AgregadoNivelDepartamento
  >
}

/**
 * Agrupa TODAS las escuelas (con o sin coordenadas) por departamento
 * normalizado, contando escuelas y secciones por nivel. Usa el universo
 * completo (GEO ∪ padrón), no sólo las geolocalizadas: el agregado
 * departamental no depende de tener coordenadas.
 */
export function agruparEscuelasPorDepartamento(
  escuelas: EscuelaCompleta[],
): Map<string, AgregadoEscuelasDepartamento> {
  const map = new Map<string, AgregadoEscuelasDepartamento>()

  for (const escuela of escuelas) {
    const clave = normalizarNombreDepartamento(escuela.departamento)
    let entry = map.get(clave)
    if (!entry) {
      entry = { porNivel: agregadoNivelVacio(), inicialSeccionesPorCurso: {} }
      map.set(clave, entry)
    }

    for (const nivelOferta of escuela.niveles) {
      entry.porNivel[nivelOferta.nivel].escuelas += 1
      entry.porNivel[nivelOferta.nivel].secciones += nivelOferta.secciones
      if (nivelOferta.nivel === 'Inicial') {
        for (const curso of nivelOferta.cursos) {
          entry.inicialSeccionesPorCurso[curso.curso] =
            (entry.inicialSeccionesPorCurso[curso.curso] ?? 0) + curso.secciones
        }
      }
    }
  }

  return map
}

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

// ── Combinado: departamentos.json ───────────────────────────────────────────

export interface DepartamentoNatalidad {
  /** Clave normalizada (mayúsculas, sin diacríticos) — matchea el GeoJSON. */
  clave: string
  /** Nombre de exhibición: el del GeoJSON si matcheó, si no el de la fuente. */
  nombre: string
  coddpto: string | null
  serie: SerieAnual
  variacion: Variacion
  /** Escuelas y secciones por nivel (T5: todos los niveles, no sólo inicial). */
  porNivel: Record<Nivel, AgregadoNivelDepartamento>
  /** Recorte de porNivel.Inicial + desglose por sala — se mantiene aparte porque es la comparación central del mapa (nacimientos vs. oferta de inicial). */
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
    /** T5: "Localizaciones: relevamiento GEO 2025-10-02" (o equivalente), listo para mostrar tal cual en el panel de título. */
    fuenteLocalizaciones: string
    /** T5: "Secciones: padrón Gestión Educativa, ciclo 2026" (o equivalente), listo para mostrar tal cual. */
    fuenteSecciones: string
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
 * Combina nacimientos + escuelas (todos los niveles, T5) en la estructura
 * pública de public/data/natalidad/departamentos.json. Un departamento de la
 * fuente que no matchea ningún nombre conocido (GeoJSON) NUNCA se descarta en
 * silencio: queda en el resultado con su nombre de origen y se reporta en
 * `departamentosSinMatch`, igual que hace agregarEscuelasCaidasPorDepartamento
 * en lib/mapas/departamentos.ts.
 */
export function construirDatosNatalidad(params: {
  nacimientos: NacidoVivoRow[]
  escuelas: EscuelaCompleta[]
  nombresDepartamentosConocidos: string[]
  fuenteNatalidad: FuenteNatalidad
  fuenteLocalizaciones: string
  fuenteSecciones: string
  extraidoEn: string
}): DatosNatalidad {
  const {
    nacimientos,
    escuelas,
    nombresDepartamentosConocidos,
    fuenteNatalidad,
    fuenteLocalizaciones,
    fuenteSecciones,
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
  const escuelasPorDpto = agruparEscuelasPorDepartamento(escuelas)

  const sinMatch = new Set<string>()
  const departamentos: DepartamentoNatalidad[] = []

  for (const [clave, entry] of natalidadPorDpto) {
    const nombreConocido = conocidosPorClave.get(clave)
    if (!nombreConocido) sinMatch.add(entry.nombre)

    const escuelasEntry = escuelasPorDpto.get(clave)
    const porNivel = escuelasEntry?.porNivel ?? agregadoNivelVacio()

    departamentos.push({
      clave,
      nombre: nombreConocido ?? entry.nombre,
      coddpto: entry.coddpto,
      serie: entry.serie,
      variacion: calcularVariacion(entry.serie, anioInicio, anioFin),
      porNivel,
      inicial: {
        cues: porNivel.Inicial.escuelas,
        seccionesTotal: porNivel.Inicial.secciones,
        seccionesPorCurso: escuelasEntry?.inicialSeccionesPorCurso ?? {},
      },
    })
  }

  departamentos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  return {
    meta: {
      fuenteNatalidad,
      fuenteLocalizaciones,
      fuenteSecciones,
      anioInicio,
      anioFin,
      anios,
      extraidoEn,
    },
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

// ── Rango de años seleccionable (T10: resumen provincial/popup por rango) ──
//
// El título del mapa y el popup de departamento mostraban siempre la
// variación fija meta.anioInicio→meta.anioFin, sin importar los controles
// (año elegido en modo "año", o el par Desde/Hasta en modo "variación").
// Estas dos funciones acotan las opciones de cada selector para que "Hasta"
// nunca pueda quedar <= "Desde" (en vez de permitir un rango invertido y
// tener que decidir qué hacer con él después).

/** Años válidos para "Hasta": estrictamente mayores que `desde`. */
export function opcionesAnioHasta(anios: number[], desde: number): number[] {
  return anios.filter((anio) => anio > desde)
}

/** Años válidos para "Desde": estrictamente menores que `hasta`. */
export function opcionesAnioDesde(anios: number[], hasta: number): number[] {
  return anios.filter((anio) => anio < hasta)
}

// ── Búsqueda de escuelas (T10: buscador en el mapa) ─────────────────────────

/** Minúsculas + sin diacríticos, reutilizando la misma normalización que ya usa el matching de departamentos. */
function normalizarTextoBusqueda(texto: string): string {
  return normalizarNombreDepartamento(texto)
}

export interface ResultadoBusquedaEscuela {
  feature: Feature<Point, EscuelaProperties>
  /** Menor = mejor match; usado sólo para ordenar, no se expone en UI. */
  rango: number
}

/**
 * Busca escuelas por nombre, CUE-anexo o localidad — insensible a mayúsculas
 * y acentos. Ordena por calidad de match (prefijo de nombre primero, después
 * prefijo de CUE, después coincidencia en cualquier posición de nombre/CUE/
 * localidad) y por nombre alfabético dentro de un mismo rango. Nunca busca
 * con menos de 2 caracteres (evita listar "todo" con una tecla).
 */
export function buscarEscuelas(
  featureCollection: FeatureCollection<Point, EscuelaProperties>,
  query: string,
  limite = 8,
): Feature<Point, EscuelaProperties>[] {
  const q = normalizarTextoBusqueda(query)
  if (q.length < 2) return []

  const hits: ResultadoBusquedaEscuela[] = []
  for (const feature of featureCollection.features) {
    const props = feature.properties
    const nombre = normalizarTextoBusqueda(props.nombre)
    const cue = normalizarTextoBusqueda(props.cueAnexo)
    const localidad = normalizarTextoBusqueda(props.localidad)

    let rango: number | null = null
    if (nombre.startsWith(q)) rango = 0
    else if (cue.startsWith(q)) rango = 1
    else if (nombre.includes(q)) rango = 2
    else if (cue.includes(q)) rango = 3
    else if (localidad.includes(q)) rango = 4

    if (rango != null) hits.push({ feature, rango })
  }

  hits.sort((a, b) => a.rango - b.rango || a.feature.properties.nombre.localeCompare(b.feature.properties.nombre))
  return hits.slice(0, limite).map((hit) => hit.feature)
}
