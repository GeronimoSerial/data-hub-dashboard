// T8: transforms puros para la pestaña "Estadísticas" de /mapas/natalidad.
// Sin dependencias de React/recharts — toman el mismo DatosNatalidad que ya
// carga el mapa (public/data/natalidad/departamentos.json), nunca piden un
// endpoint nuevo. Cada gráfico existe para responder una pregunta de
// planificación de nacidos → oferta de inicial/primario; ver los títulos y
// "por qué importa" en components/mapas/estadisticas-natalidad-panel.tsx.
//
// Feedback 2026-09-25: se recortó a 3 gráficos + KPIs. La matrícula (T7) se
// retiró del feature (ver odd/tasks/mapa-natalidad.md): la fuente sólo cubre
// un panel de 288 establecimientos rurales de baja matrícula (mediana 6
// alumnos), sumarla por departamento/provincia era engañoso.
import type { DatosNatalidad, Variacion } from './natalidad'

export type FiltroDepartamento = 'Todos' | string

function filtrarDepartamentos(datos: DatosNatalidad, filtro: FiltroDepartamento) {
  if (filtro === 'Todos') return datos.departamentos
  return datos.departamentos.filter((d) => d.clave === filtro)
}

// ── 1. Nacidos vivos — tendencia provincial ─────────────────────────────────

export interface PuntoSerieAnual {
  anio: number
  valor: number
}

/** Serie provincial de nacidos vivos, un punto por año (datos.meta.anios). */
export function construirSerieProvincialNacimientos(datos: DatosNatalidad): PuntoSerieAnual[] {
  return datos.meta.anios.map((anio) => ({ anio, valor: datos.provincia.serie[String(anio)] ?? 0 }))
}

// ── 2. Variación de nacidos vivos por departamento ──────────────────────────

export interface BarraVariacionDepartamento {
  departamento: string
  pct: number | null
  abs: number
}

/** Un departamento por fila, ordenado de mayor caída a mayor crecimiento (pct null al final, "sin base comparable"). */
export function construirVariacionNacimientosPorDepartamento(
  datos: DatosNatalidad,
): BarraVariacionDepartamento[] {
  return [...datos.departamentos]
    .map((d) => ({ departamento: d.nombre, pct: d.variacion.pct, abs: d.variacion.abs }))
    .sort((a, b) => {
      if (a.pct == null) return 1
      if (b.pct == null) return -1
      return a.pct - b.pct
    })
}

// ── 3. Nacidos por sección de Sala de 3 a 5 (ciclo 2026) ────────────────────
//
// Bug corregido (2026-09-25, revisión visual del coordinador): la versión
// original de este gráfico (construirOfertaInicialVsCohorte, retirada) tenía
// dos problemas: (a) alineación de cohorte incorrecta — usaba `anioFin - 3`
// (2020) como si fuera "la cohorte de Sala de 3", cuando en el ciclo lectivo
// 2026 esa cohorte (nacidos que cumplen 3 años y entran a Sala de 3) nació en
// 2022, no en 2020 — la correspondencia correcta, con la regla "cumple la
// edad al 30 de junio del ciclo", es Sala de 5 ≈ nacidos ciclo-6, Sala de 4 ≈
// ciclo-5, Sala de 3 ≈ ciclo-4; (b) graficaba secciones (decenas) y nacidos
// (miles) en el mismo eje — unidades distintas, ilegible.

/**
 * Ciclo lectivo del padrón de secciones (fijo al snapshot de datos —
 * `meta.fuenteSecciones` = "padrón Gestión Educativa, ciclo 2026" — no se
 * deriva de `meta.anioFin` porque el padrón es una fuente aparte del rango de
 * nacidos vivos y no se re-extraen juntos).
 */
export const CICLO_PADRON_SECCIONES = 2026

/** Sala de 3/4/5: las tres salas cuya cohorte de ingreso puede calcularse a partir de la natalidad. */
const SALAS_COHORTE = [3, 4, 5] as const

/** Cursos que efectivamente reciben esas cohortes por edad — excluye "Sala Especial" (oferta de otro tipo). */
const CURSOS_DENOMINADOR = ['Sala de 3', 'Sala de 4', 'Sala de 5', 'Plurisala', 'Sala Integrada']

/** Año de nacimiento de la cohorte de una sala, dado el ciclo lectivo (cumple la edad al 30/6 del ciclo). */
function anioNacimientoCohorte(sala: number, ciclo: number): number {
  return ciclo - (sala + 1)
}

/** [anioCohorteSala3, anioCohorteSala4, anioCohorteSala5], en ese orden. */
export function aniosCohorteInicial(ciclo: number = CICLO_PADRON_SECCIONES): number[] {
  return SALAS_COHORTE.map((sala) => anioNacimientoCohorte(sala, ciclo))
}

function sumarSerie(serie: Record<string, number>, anios: number[]): number {
  return anios.reduce((total, anio) => total + (serie[String(anio)] ?? 0), 0)
}

function sumarSeccionesDenominador(seccionesPorCurso: Record<string, number>): number {
  return CURSOS_DENOMINADOR.reduce((total, curso) => total + (seccionesPorCurso[curso] ?? 0), 0)
}

export interface FilaNacidosPorSeccion {
  departamento: string
  nacidosCohorte: number
  secciones: number
  /** null cuando `secciones === 0` — división inválida, excluido de la comparación pero nunca ocultado en silencio (ver `sinSecciones` en el panel). */
  nacidosPorSeccion: number | null
}

export interface NacidosPorSeccionCohorte {
  ciclo: number
  /** [anioSala3, anioSala4, anioSala5]. */
  aniosCohorte: number[]
  filas: FilaNacidosPorSeccion[]
  /** Valor provincial (siempre sobre los 25 departamentos, no filtrado) — referencia para el gráfico. */
  provincia: FilaNacidosPorSeccion
}

/**
 * Nacidos de las tres cohortes que hoy ocupan Sala de 3 a 5, sobre la
 * cantidad de secciones que efectivamente las reciben (Sala de 3/4/5 +
 * Plurisala + Sala Integrada — "Sala Especial" queda afuera, es oferta de
 * otro tipo). `filtro` recorta las filas mostradas; `provincia` es siempre
 * el total de los 25 departamentos, para poder dibujarse como línea de
 * referencia sin importar el filtro activo.
 */
export function construirNacidosPorSeccionCohorte(
  datos: DatosNatalidad,
  filtro: FiltroDepartamento,
): NacidosPorSeccionCohorte {
  const ciclo = CICLO_PADRON_SECCIONES
  const aniosCohorte = aniosCohorteInicial(ciclo)

  function fila(
    nombre: string,
    serie: Record<string, number>,
    seccionesPorCurso: Record<string, number>,
  ): FilaNacidosPorSeccion {
    const nacidosCohorte = sumarSerie(serie, aniosCohorte)
    const secciones = sumarSeccionesDenominador(seccionesPorCurso)
    return {
      departamento: nombre,
      nacidosCohorte,
      secciones,
      nacidosPorSeccion: secciones > 0 ? nacidosCohorte / secciones : null,
    }
  }

  const filas = filtrarDepartamentos(datos, filtro)
    .map((d) => fila(d.nombre, d.serie, d.inicial.seccionesPorCurso))
    .sort((a, b) => {
      if (a.nacidosPorSeccion == null) return 1
      if (b.nacidosPorSeccion == null) return -1
      return b.nacidosPorSeccion - a.nacidosPorSeccion
    })

  const seccionesProvincia = datos.departamentos.reduce(
    (total, d) => total + sumarSeccionesDenominador(d.inicial.seccionesPorCurso),
    0,
  )
  const nacidosProvincia = sumarSerie(datos.provincia.serie, aniosCohorte)

  return {
    ciclo,
    aniosCohorte,
    filas,
    provincia: {
      departamento: 'Corrientes (provincia)',
      nacidosCohorte: nacidosProvincia,
      secciones: seccionesProvincia,
      nacidosPorSeccion: seccionesProvincia > 0 ? nacidosProvincia / seccionesProvincia : null,
    },
  }
}

// ── KPIs ─────────────────────────────────────────────────────────────────────

export interface KpisNatalidad {
  nacidosUltimoAnio: number
  variacionNacidos: Variacion
  /** Secciones de Inicial (mismo universo que dpto.porNivel.Inicial.secciones). */
  seccionesInicialTotal: number
  /** Escuelas con oferta de nivel inicial (mismo universo que dpto.inicial.cues). */
  escuelasInicialTotal: number
}

export function construirKpis(datos: DatosNatalidad, filtro: FiltroDepartamento): KpisNatalidad {
  if (filtro === 'Todos') {
    return {
      nacidosUltimoAnio: datos.provincia.serie[String(datos.meta.anioFin)] ?? 0,
      variacionNacidos: datos.provincia.variacion,
      seccionesInicialTotal: datos.departamentos.reduce((total, d) => total + d.inicial.seccionesTotal, 0),
      escuelasInicialTotal: datos.departamentos.reduce((total, d) => total + d.inicial.cues, 0),
    }
  }

  const dpto = datos.departamentos.find((d) => d.clave === filtro)
  return {
    nacidosUltimoAnio: dpto?.serie[String(datos.meta.anioFin)] ?? 0,
    variacionNacidos: dpto?.variacion ?? { abs: 0, pct: null },
    seccionesInicialTotal: dpto?.inicial.seccionesTotal ?? 0,
    escuelasInicialTotal: dpto?.inicial.cues ?? 0,
  }
}
