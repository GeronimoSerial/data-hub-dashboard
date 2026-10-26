// Agregación para la pestaña de evolución del mapa de infraestructura (F5.2
// de odd/tasks/mapa-parte-operativo.md). Esta capa arma el backend de cuatro
// vistas sobre el PERÍODO VIGENTE; los gráficos de Recharts (F5.3) son otro
// worker y no se tocan acá.
//
// REQUISITO NO NEGOCIABLE, igual que parte-mapa.ts: nada de N+1. El número de
// queries es CONSTANTE (no depende de cuántos días tenga el período ni de
// cuántos partes/afectaciones haya): período, corte, partes+localización,
// afectaciones, servicio_alcance y secciones de todos los CUEs de un saque.
// La reconstrucción día a día es enteramente en memoria sobre esas filas ya
// cargadas — nunca una consulta por día ni por parte.
//
// COHERENCIA con el mapa (criterio de aceptación #6): escuelas, secciones y
// el snapshot de HOY se derivan de listarPartesVigentes (misma función que
// alimenta /api/mapas/infraestructura), nunca recalculados acá. La única
// excepción documentada es `alumnosAcumulados` (ver más abajo): responde una
// pregunta distinta (saldo del período, no snapshot de hoy) y por diseño
// puede no coincidir con IndicadoresMapa.alumnosAlcanzados.
import { getDb, getRawClient } from '@/lib/db'
import { infraPeriodo } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { crearEjecutorSql, getCorteVigente } from './ge-db'
import { asegurarGeAdjuntada } from './impacto'
import { obtenerPeriodoVigente } from './parte-consulta'
import {
  cargarAfectacionesDeVariosPartes,
  cargarServicioAlcanceDeVariosPartes,
  efectivosDeAfectacionesInstituto,
  listarPartesVigentes,
  type ParteMapa,
} from './parte-mapa'
import { listarSeccionesDeCues } from './secciones-cue'
import { carrerasVigentesPorCue, type EfectivoInstituto } from './parte/instituto-alcance'
import { cuesDeInstitutoVigentes } from './alcance'
import { estadoGeneralDelCue } from './parte/instituto-estado'
import { claveServicioAlcance, resolverAlcanceVigente } from './vigencia-alcance'
import { normalizarNombreDepartamento } from '@/lib/mapas/normalizar-departamento'

export interface FiltrosEvolucion {
  departamentos?: string[]
  niveles?: string[]
}

export interface PuntoEscuelasServicioCaido {
  fecha: string // YYYY-MM-DD (UTC)
  escuelas: number
}

export interface RankingDepartamento {
  departamento: string
  escuelasAfectadas: number
  alumnosAlcanzados: number
}

export interface DistribucionMotivo {
  motivo: string
  afectacionesVigentes: number
}

export interface PuntoAlumnosAcumulados {
  fecha: string // YYYY-MM-DD (UTC)
  alumnosAcumulados: number
}

export interface EvolucionMapa {
  serieEscuelasServicioCaido: PuntoEscuelasServicioCaido[]
  rankingDepartamentos: RankingDepartamento[]
  distribucionMotivo: DistribucionMotivo[]
  alumnosAcumulados: PuntoAlumnosAcumulados[]
}

function vacio(): EvolucionMapa {
  return {
    serieEscuelasServicioCaido: [],
    rankingDepartamentos: [],
    distribucionMotivo: [],
    alumnosAcumulados: [],
  }
}

// obtenerPeriodoVigente (parte-consulta.ts) resuelve QUÉ período está
// vigente — única fuente de verdad para esa determinación, reusada tal
// cual. Acá sólo se agrega, en una segunda consulta puntual por id (no una
// por día ni por parte), inicioEn/finEn: obtenerPeriodoVigente no los
// expone porque nadie más los necesitaba hasta esta pestaña.
async function obtenerRangoPeriodoVigente(): Promise<{ id: string; inicioEn: string; finEn: string | null } | null> {
  const periodo = await obtenerPeriodoVigente()
  if (!periodo) return null

  const db = getDb()
  const [fila] = await db
    .select({ inicioEn: infraPeriodo.inicioEn, finEn: infraPeriodo.finEn })
    .from(infraPeriodo)
    .where(eq(infraPeriodo.id, periodo.id))
    .limit(1)
  if (!fila) return null

  return { id: periodo.id, inicioEn: fila.inicioEn, finEn: fila.finEn }
}

function fechaUtc(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10)
}

// Un día calendario (UTC) por entrada, desde el inicio del período hasta su
// fin (o hasta hoy, si el período sigue vigente y no tiene finEn todavía).
function construirRangoDeDias(inicioEn: string, finEn: string | null): string[] {
  const desde = fechaUtc(inicioEn)
  const hasta = finEn ? fechaUtc(finEn) : fechaUtc(new Date().toISOString())

  const dias: string[] = []
  let cursor = new Date(`${desde}T00:00:00.000Z`)
  const limite = new Date(`${hasta}T00:00:00.000Z`)
  while (cursor.getTime() <= limite.getTime()) {
    dias.push(cursor.toISOString().slice(0, 10))
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
  }
  return dias
}

// Instante de referencia para evaluar vigencia en un día dado (ver
// vigencia-alcance.ts): "ahora" para el día de hoy —para que ese punto
// coincida EXACTAMENTE con lo que calculó listarPartesVigentes en esta misma
// request, criterio de aceptación #6— y fin de día (23:59:59.999 UTC) para
// cualquier día pasado, que es el mismo criterio con el que se lee "vigente
// entre el 3 y el 9" del enunciado: al cierre del día 9 la fila ya se
// retiró (retiradaEn = rigeDesde de la que la reemplaza), así que el 9 no
// cuenta y el 8 sí.
function referenciaParaDia(fecha: string, hoy: string): Date {
  if (fecha === hoy) return new Date()
  return new Date(`${fecha}T23:59:59.999Z`)
}

function agruparPorParte<T extends { parteId: string }>(filas: T[]): Map<string, T[]> {
  const mapa = new Map<string, T[]>()
  for (const fila of filas) {
    const lista = mapa.get(fila.parteId) ?? []
    lista.push(fila)
    mapa.set(fila.parteId, lista)
  }
  return mapa
}

// b. Ranking de departamentos: se agrega directamente sobre `partes`
// (ParteMapa[] de listarPartesVigentes), no sobre una nueva consulta — así
// la suma de escuelasAfectadas/alumnosAlcanzados por departamento coincide
// por construcción con IndicadoresMapa.escuelas/alumnosAlcanzados (misma
// fuente, sin recalcular). Orden: más escuelas afectadas primero; empate,
// más alumnos alcanzados; empate, orden alfabético (desempate determinista).
function construirRanking(partes: ParteMapa[]): RankingDepartamento[] {
  const porDepartamento = new Map<string, RankingDepartamento>()
  for (const parte of partes) {
    const actual = porDepartamento.get(parte.departamento) ?? {
      departamento: parte.departamento,
      escuelasAfectadas: 0,
      alumnosAlcanzados: 0,
    }
    actual.escuelasAfectadas += 1
    actual.alumnosAlcanzados += parte.alumnosAlcanzados
    porDepartamento.set(parte.departamento, actual)
  }

  return [...porDepartamento.values()].sort((a, b) => {
    if (b.escuelasAfectadas !== a.escuelasAfectadas) return b.escuelasAfectadas - a.escuelasAfectadas
    if (b.alumnosAlcanzados !== a.alumnosAlcanzados) return b.alumnosAlcanzados - a.alumnosAlcanzados
    return a.departamento.localeCompare(b.departamento)
  })
}

// c. Distribución por motivo: cuenta las afectaciones VIGENTES que ya trae
// `partes[].afectaciones` (listarPartesVigentes ya aplicó
// resolverAlcanceVigente + el filtro de la request) — ninguna afectación
// retirada ni fuera de filtro entra acá. Orden: más frecuente primero,
// empate por orden alfabético del motivo.
function construirDistribucionMotivo(partes: ParteMapa[]): DistribucionMotivo[] {
  const porMotivo = new Map<string, number>()
  for (const parte of partes) {
    for (const afectacion of parte.afectaciones) {
      porMotivo.set(afectacion.motivo, (porMotivo.get(afectacion.motivo) ?? 0) + 1)
    }
  }

  return [...porMotivo.entries()]
    .map(([motivo, afectacionesVigentes]) => ({ motivo, afectacionesVigentes }))
    .sort((a, b) => {
      if (b.afectacionesVigentes !== a.afectacionesVigentes) return b.afectacionesVigentes - a.afectacionesVigentes
      return a.motivo.localeCompare(b.motivo)
    })
}

export async function obtenerEvolucionMapa(filtros: FiltrosEvolucion = {}): Promise<EvolucionMapa> {
  const periodo = await obtenerRangoPeriodoVigente()
  if (!periodo) return vacio()

  // Reusa el mismo snapshot de "hoy" que sirve el mapa: garantiza, por
  // construcción, que ranking y distribución por motivo coincidan con
  // IndicadoresMapa (criterio de aceptación #6). `servicio == null` significa
  // "sin filtro" (comportamiento por defecto de listarPartesVigentes), igual
  // que la pestaña del mapa cuando no hay filtros activos.
  const { partes: partesVigentes } = await listarPartesVigentes()

  if (partesVigentes.length === 0) return vacio()

  const departamentos = new Set((filtros.departamentos ?? []).map(normalizarNombreDepartamento))
  const filtrarDepartamento = departamentos.size > 0
  let partes = filtrarDepartamento
    ? partesVigentes.filter((parte) => departamentos.has(normalizarNombreDepartamento(parte.departamento)))
    : partesVigentes
  if (partes.length === 0) return vacio()

  const client = crearEjecutorSql(getRawClient())
  await asegurarGeAdjuntada(client)

  const corte = await getCorteVigente(client)
  if (!corte) {
    if ((filtros.niveles?.length ?? 0) > 0) return vacio()
    const rankingDepartamentos = construirRanking(partes)
    const distribucionMotivo = construirDistribucionMotivo(partes)
    return { serieEscuelasServicioCaido: [], rankingDepartamentos, distribucionMotivo, alumnosAcumulados: [] }
  }

  const niveles = new Set((filtros.niveles ?? []).map((nivel) => nivel.trim()).filter(Boolean))
  const filtrarNivel = niveles.size > 0
  const seccionesCargadas = filtrarNivel
    ? await listarSeccionesDeCues(client, corte.id, [...new Set(partesVigentes.map((p) => p.cueAnexo))])
    : undefined
  if (seccionesCargadas) {
    partes = partes.filter((parte) =>
      (seccionesCargadas.get(parte.cueAnexo) ?? []).some((seccion) => niveles.has(seccion.nivel?.trim() ?? '')),
    )
  }
  if (partes.length === 0) return vacio()

  const rankingDepartamentos = construirRanking(partes)
  const distribucionMotivo = construirDistribucionMotivo(partes)

  // Misma población que `partes` (escuelas con al menos una afectación
  // vigente hoy): es la que determina IndicadoresMapa.conServicioSuspendido/
  // conServicioParcial, así que la serie histórica se reconstruye sobre ese
  // mismo conjunto, nunca sobre "todos los partes del período" (un parte que
  // ya no tiene ninguna afectación vigente tampoco cuenta en el mapa hoy).
  const parteIds = partes.map((p) => p.parteId)
  const cueAnexos = [...new Set(partes.map((p) => p.cueAnexo))]
  const cuePorParte = new Map(partes.map((p) => [p.parteId, p.cueAnexo]))

  const [servicioRows, afectacionesRows, seccionesPorCue] = await Promise.all([
    cargarServicioAlcanceDeVariosPartes(client, parteIds),
    cargarAfectacionesDeVariosPartes(client, corte.id, parteIds),
    seccionesCargadas ?? listarSeccionesDeCues(client, corte.id, cueAnexos),
  ])

  // Institutos superiores: sus carreras del corte vigente. Sin ellas, las filas
  // tipo 'carrera' no alcanzan para saber si la suspensión cubre todo el CUE.
  const carrerasPorCue = await carrerasVigentesPorCue(client, cueAnexos)
  // Alumnos de institutos: cada afectación con su alcance de carreras guardado.
  const { cues: cuesInstituto, corteId: corteMatricula } = await cuesDeInstitutoVigentes(client, cueAnexos)
  const afectacionesInstituto = afectacionesRows.filter((a) => cuesInstituto.has(cuePorParte.get(a.parteId) ?? ''))
  const alumnosPorAfectacionInstituto: Map<string, EfectivoInstituto> = await efectivosDeAfectacionesInstituto(
    client,
    afectacionesInstituto,
    corteMatricula,
  )

  const servicioPorParte = agruparPorParte(servicioRows)
  const afectacionesPorParte = agruparPorParte(afectacionesRows)

  const dias = construirRangoDeDias(periodo.inicioEn, periodo.finEn)
  const hoy = fechaUtc(new Date().toISOString())

  // a. Serie temporal de escuelas con servicio caído: por cada día, se
  // resuelve la vigencia de infra_servicio_alcance COMO SI ese fuera el
  // instante actual (resolverAlcanceVigente + calcularEstadoServicioGeneral,
  // las mismas funciones que usa listarPartesVigentes) — problema de
  // intervalos, no de snapshots re-consultados: una fila vigente entre el 3
  // y el 9 aparece vigente en la evaluación de cada uno de esos días porque
  // su [rigeDesde, retiradaEn) las contiene, sin volver a tocar la base.
  const serieEscuelasServicioCaido: PuntoEscuelasServicioCaido[] = dias.map((fecha) => {
    const referencia = referenciaParaDia(fecha, hoy)
    let escuelas = 0
    for (const parteId of parteIds) {
      const filasServicio = servicioPorParte.get(parteId) ?? []
      const vigentesEseDia = resolverAlcanceVigente(filasServicio, { referencia, clave: claveServicioAlcance })
      const secciones = seccionesPorCue.get(cuePorParte.get(parteId)!) ?? []
      const carreras = carrerasPorCue.get(cuePorParte.get(parteId)!) ?? []
      const estado = estadoGeneralDelCue(vigentesEseDia, secciones, carreras)
      if (estado === 'suspendido' || estado === 'parcial') escuelas++
    }
    return { fecha, escuelas }
  })

  // d. Alumnos alcanzados acumulados en el tiempo: NO es un snapshot diario
  // (para eso ya está `a`, y el mapa ya muestra el snapshot de hoy vía
  // IndicadoresMapa.alumnosAlcanzados). Responde otra pregunta: el saldo del
  // evento — cuántos alumnos DISTINTOS tocó el período ENOS hasta la fecha.
  // Por eso el dedupe es por gePersonId a lo largo de TODO el período (no
  // por día ni por parte, a diferencia de listarPartesVigentes), y la serie
  // nunca decrece: un alumno alcanzado en marzo y otra vez en abril cuenta
  // una sola vez, y sigue contando aunque hoy esté de nuevo en clase. Por
  // diseño, el total final de esta serie NO tiene por qué coincidir con
  // IndicadoresMapa.alumnosAlcanzados (ese es un snapshot de hoy con dedupe
  // por parte); el test de coherencia de este módulo compara lo que sí debe
  // coincidir (escuelas, secciones y el snapshot de hoy), no esta serie.
  // Claves con prefijo de origen: ids de persona GE y de matrícula son espacios
  // distintos y no pueden colapsar en un mismo alumno.
  const alumnosVistos = new Set<string>()
  const alumnosAcumulados: PuntoAlumnosAcumulados[] = dias.map((fecha) => {
    const referencia = referenciaParaDia(fecha, hoy)
    for (const parteId of parteIds) {
      const afectacionesParte = afectacionesPorParte.get(parteId) ?? []
      // Sin `clave` de agrupación: cada afectación es su propia fila
      // independiente (spec §3.2), mismo criterio que listarPartesVigentes.
      const vigentesEseDia = resolverAlcanceVigente(afectacionesParte, { referencia })
      for (const afectacion of vigentesEseDia) {
        for (const seccion of afectacion.secciones) {
          for (const alumnoId of seccion.alumnos) alumnosVistos.add(`ge:${alumnoId}`)
        }
        for (const alumnos of alumnosPorAfectacionInstituto.get(afectacion.id)?.values() ?? []) {
          for (const alumnoId of alumnos) alumnosVistos.add(`mat:${alumnoId}`)
        }
      }
    }
    return { fecha, alumnosAcumulados: alumnosVistos.size }
  })

  return { serieEscuelasServicioCaido, rankingDepartamentos, distribucionMotivo, alumnosAcumulados }
}
