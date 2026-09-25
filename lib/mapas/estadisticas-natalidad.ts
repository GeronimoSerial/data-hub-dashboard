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

// ── 3. Oferta de inicial vs. cohorte de nacidos que hoy entra a Sala de 3 ───

export interface FilaOfertaInicialVsCohorte {
  departamento: string
  secciones: number
  nacidosCohorte: number
}

export interface OfertaInicialVsCohorte {
  /** Año de nacimiento de la cohorte que hoy tiene ~3 años (anioFin - 3, acotado a anioInicio si el rango es corto). */
  anioCohorte: number
  filas: FilaOfertaInicialVsCohorte[]
}

/**
 * Compara, por departamento, la oferta actual de secciones de Inicial contra
 * los nacidos vivos de la cohorte que hoy entra a Sala de 3 (nacidos
 * `anioFin - 3` años atrás) — la comparación central del mapa (nacidos vivos
 * → oferta de inicial), llevada a la pestaña de estadísticas con la
 * alineación de cohorte explícita en el resultado (`anioCohorte`).
 */
export function construirOfertaInicialVsCohorte(
  datos: DatosNatalidad,
  filtro: FiltroDepartamento,
): OfertaInicialVsCohorte {
  const anioCohorte = Math.max(datos.meta.anioInicio, datos.meta.anioFin - 3)
  const filas = filtrarDepartamentos(datos, filtro).map((d) => ({
    departamento: d.nombre,
    secciones: d.porNivel.Inicial.secciones,
    nacidosCohorte: d.serie[String(anioCohorte)] ?? 0,
  }))
  return { anioCohorte, filas }
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
