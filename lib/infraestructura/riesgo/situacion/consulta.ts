// Consultas del Centro de Situación (E5). Todo lo que responde
// /api/infraestructura/situacion* vive acá; el Server Component de la UI y
// las rutas API sólo llaman a estas funciones y serializan.
//
// Dos fuentes de datos distintas, a propósito:
// 1. KPIs, briefing y salud de fuentes SIEMPRE salen de `infra_situacion_corte`
//    (congelado, global, reconstruible exactamente) — nunca se recalculan en
//    vivo acá, eso lo garantiza reconstruirBriefingDesdeCorte en corte.ts.
// 2. El top de prioridades y el timeline de "cambios desde" sí consultan en
//    vivo (infra_movimiento / infra_episodio_derivado / infra_risk_snapshot),
//    porque el corte no persiste desagregado por escuela ni departamento.
import { and, desc, eq, gte, inArray } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import {
  infraEpisodioDerivado,
  infraGeoProfile,
  infraMovimiento,
  infraParte,
  infraRiskRun,
  infraRiskSnapshot,
  infraSituacionCorte,
} from '@/lib/db/schema'
import { describirMovimiento } from '@/lib/infraestructura/movimiento-descripcion'
import type { DiffParte } from '@/lib/infraestructura/movimiento-diff'
import { obtenerPeriodoVigente } from '@/lib/infraestructura/parte-consulta'
import type { TipoMovimiento } from '@/lib/infraestructura/trayectoria-tipos'
import {
  estadoAtrasoJob,
  type EstadoAtrasoJob,
} from '@/lib/infraestructura/riesgo/cadencias'
import { enosJobsEnabled } from '@/lib/infraestructura/jobs/flags'
import {
  obtenerCorteAnterior,
  obtenerPublicadoEnRun,
  obtenerUltimoCorte,
  normalizarCobertura,
  reconstruirBriefingDesdeCorte,
  type CortePersistido,
} from './corte'
import type { CoberturaBriefing } from '@/lib/infraestructura/riesgo/briefing'

// "no verificable": el corte no puede decir qué edad tiene el dato que muestra
// (sin corrida de riesgo o sin fecha de publicación). Es neutro: nunca "al día".
export type EstadoAtrasoSituacion = Omit<EstadoAtrasoJob, 'texto'> & {
  texto: EstadoAtrasoJob['texto'] | 'no verificable'
}

export interface EstadoSituacion {
  corte: CortePersistido | null
  briefing: string[]
  atraso: EstadoAtrasoSituacion
  prioridades: PrioridadEscuela[]
  // true cuando no hay ninguna corrida de riesgo vigente: las prioridades
  // vacías no significan "sin escuelas en riesgo alto", sino "sin cálculo".
  sinRun: boolean
}

export interface RespuestaSituacionCorte {
  id: string
  generadoEn: string
  kpis: CortePersistido['kpis']
  conteosPorNivelRiesgo: CortePersistido['conteosPorNivelRiesgo']
  fuentesSalud: CortePersistido['fuentesSalud']
  episodiosAbiertos: number
  episodiosCerradosDesdeAnterior: number
  cobertura: CoberturaBriefing | null
}

/** Forma pública de /api/infraestructura/situacion (sin `estadoDatos`). */
export function serializarEstadoSituacion(estado: EstadoSituacion): Omit<EstadoSituacion, 'corte'> & {
  corte: RespuestaSituacionCorte | null
} {
  const { corte, ...resto } = estado
  return {
    ...resto,
    corte: corte
      ? {
          id: corte.id,
          generadoEn: corte.generadoEn,
          kpis: corte.kpis,
          conteosPorNivelRiesgo: corte.conteosPorNivelRiesgo,
          fuentesSalud: corte.fuentesSalud,
          episodiosAbiertos: corte.episodiosAbiertos,
          episodiosCerradosDesdeAnterior: corte.episodiosCerradosDesdeAnterior,
          cobertura: normalizarCobertura(corte.cobertura),
        }
      : null,
  }
}

export interface PrioridadEscuela {
  cueAnexo: string
  departamento: string | null
  nivelRiesgo: string | null
  scoreRiesgo: number | null
}

const HORIZONTE_PRIORIDAD_HORAS = 24
const LIMITE_PRIORIDADES_DEFAULT = 10

/**
 * Estado ejecutivo completo del Centro de Situación: KPIs + briefing +
 * salud vienen 100% del último corte persistido (nunca en vivo). La frescura
 * (`atraso`) es la edad de la CORRIDA DE RIESGO detrás del corte
 * (`infraRiskRun.publicadoEn` vía `corte.riskRunId`), no la hora del corte: un
 * corte nuevo sobre una corrida muerta no puede verse fresco. Sin ningún corte
 * todavía, `atraso.atrasado` es `true` salvo que ENOS_JOBS_ENABLED esté apagado.
 */
export async function obtenerEstadoSituacion(opts?: {
  ahora?: Date
  territorioTipo?: 'departamento'
  territorioId?: string
  limitePrioridades?: number
}): Promise<EstadoSituacion> {
  const ahora = opts?.ahora ?? new Date()
  const corte = await obtenerUltimoCorte()
  const anterior = corte ? await obtenerCorteAnterior(corte.generadoEn) : null
  const briefing = corte ? reconstruirBriefingDesdeCorte(corte, anterior) : []

  const atraso = await estadoFrescuraSituacion(corte, ahora)

  const prioridades = await obtenerTopPrioridades({
    territorioTipo: opts?.territorioTipo,
    territorioId: opts?.territorioId,
    limite: opts?.limitePrioridades ?? LIMITE_PRIORIDADES_DEFAULT,
  })

  const sinRun = !(await hayRunVigente())

  return { corte, briefing, atraso, prioridades, sinRun }
}

async function hayRunVigente(): Promise<boolean> {
  const [runVigente] = await getDb()
    .select({ id: infraRiskRun.id })
    .from(infraRiskRun)
    .where(eq(infraRiskRun.estado, 'vigente'))
    .limit(1)
  return runVigente !== undefined
}

/**
 * Frescura del encabezado: `atrasado` si el job del corte está atrasado (edad
 * de `generadoEn`, cadencia `situacion-corte`) o si la corrida de riesgo del
 * corte lo está (cadencia de `calcular-riesgo`, dos cadencias de tolerancia,
 * como en OPS1). Sin corte, el job del corte nunca corrió: queda `atrasado`. Con
 * pausa operativa (ENOS_JOBS_ENABLED=false) no se evalúa la edad.
 */
async function estadoFrescuraSituacion(
  corte: CortePersistido | null,
  ahora: Date,
): Promise<EstadoAtrasoSituacion> {
  const habilitado = enosJobsEnabled()
  if (corte === null || !habilitado) {
    return estadoAtrasoJob({
      nombre: 'situacion-corte',
      ultimaCorridaExitosaEn: null,
      enosJobsEnabled: habilitado,
      ahora,
    })
  }

  const corteAtrasado = estadoAtrasoJob({
    nombre: 'situacion-corte',
    ultimaCorridaExitosaEn: new Date(corte.generadoEn),
    enosJobsEnabled: habilitado,
    ahora,
  })
  if (corteAtrasado.atrasado) return corteAtrasado

  const publicadoEn = await obtenerPublicadoEnRun(corte.riskRunId)
  const publicadoMs = publicadoEn === null ? NaN : Date.parse(publicadoEn)
  if (Number.isNaN(publicadoMs)) {
    return { texto: 'no verificable', atrasado: false, desactivadoPorConfig: false }
  }

  return estadoAtrasoJob({
    nombre: 'calcular-riesgo',
    ultimaCorridaExitosaEn: new Date(publicadoMs),
    enosJobsEnabled: true,
    ahora,
  })
}

/**
 * Escuelas en riesgo alto/muy alto a 24h del run vigente, ordenadas por score
 * descendente. Filtro de territorio opcional (departamento). No sale del
 * corte persistido: es el mismo universo que ya expone /api/infraestructura/radar,
 * consultado en vivo porque el corte no lo desagrega por escuela.
 */
export async function obtenerTopPrioridades(opts?: {
  territorioTipo?: 'departamento'
  territorioId?: string
  limite?: number
}): Promise<PrioridadEscuela[]> {
  const db = getDb()
  const limite = opts?.limite ?? LIMITE_PRIORIDADES_DEFAULT

  const [runVigente] = await db
    .select({ id: infraRiskRun.id })
    .from(infraRiskRun)
    .where(eq(infraRiskRun.estado, 'vigente'))
    .limit(1)
  if (!runVigente) return []

  const condiciones = [
    eq(infraRiskSnapshot.runId, runVigente.id),
    eq(infraRiskSnapshot.horizonteHoras, HORIZONTE_PRIORIDAD_HORAS),
    inArray(infraRiskSnapshot.nivelRiesgo, ['alto', 'muy_alto']),
  ]
  if (opts?.territorioTipo === 'departamento' && opts.territorioId) {
    condiciones.push(eq(infraGeoProfile.departamento, opts.territorioId))
  }

  const filas = await db
    .select({
      cueAnexo: infraRiskSnapshot.cueAnexo,
      departamento: infraGeoProfile.departamento,
      nivelRiesgo: infraRiskSnapshot.nivelRiesgo,
      scoreRiesgo: infraRiskSnapshot.scoreRiesgo,
    })
    .from(infraRiskSnapshot)
    .innerJoin(infraGeoProfile, eq(infraRiskSnapshot.cueAnexo, infraGeoProfile.cueAnexo))
    .where(and(...condiciones))
    .orderBy(desc(infraRiskSnapshot.scoreRiesgo))
    .limit(limite)

  return filas
}

export type TipoCambioSituacion = 'afectacion' | 'episodio_abierto' | 'episodio_cerrado' | 'riesgo'

export interface CambioSituacion {
  id: string
  tipo: TipoCambioSituacion
  ocurreEn: string
  departamento: string | null
  cueAnexo: string | null
  descripcion: string
}

export interface CambiosDesde {
  // "Registro": cuándo el sistema SUPO/escribió el cambio (creadaEn de
  // infra_movimiento, calculadoEn de infra_episodio_derivado, generadoEn del
  // corte de riesgo).
  porRegistro: CambioSituacion[]
  // "Vigencia": cuándo el cambio empieza a regir en el terreno (rigeDesde de
  // infra_movimiento, inicioEn/finEn de infra_episodio_derivado, generadoEn
  // del corte de riesgo — coincide con registro para el corte porque es
  // instantáneo).
  porVigencia: CambioSituacion[]
}

function ordenarDesc(cambios: CambioSituacion[]): CambioSituacion[] {
  return [...cambios].sort((a, b) => b.ocurreEn.localeCompare(a.ocurreEn))
}

/**
 * Timeline de cambios desde `desde` (inclusive), en las dos lecturas que
 * puede pedir el selector "Cambios desde" de la UI (registro vs vigencia).
 * Ambas se calculan siempre; la UI elige cuál mostrar sin volver a pedir al
 * servidor. Nunca toca infra_afectacion_alumno ni ningún dato nominal.
 */
export async function obtenerCambiosDesde(opts: {
  desde: Date
  territorioTipo?: 'departamento'
  territorioId?: string
}): Promise<CambiosDesde> {
  const db = getDb()
  const desdeIso = opts.desde.toISOString()
  const filtroDepartamento =
    opts.territorioTipo === 'departamento' && opts.territorioId ? opts.territorioId : undefined

  const porRegistro: CambioSituacion[] = []
  const porVigencia: CambioSituacion[] = []

  // 1. Afectaciones (infra_movimiento), sólo del período vigente.
  const periodo = await obtenerPeriodoVigente(db)
  if (periodo) {
    const condicionesBase = [eq(infraParte.periodoId, periodo.id)]
    if (filtroDepartamento) {
      condicionesBase.push(eq(infraGeoProfile.departamento, filtroDepartamento))
    }

    const filasMovimiento = await db
      .select({
        id: infraMovimiento.id,
        tipo: infraMovimiento.tipo,
        resumen: infraMovimiento.resumen,
        creadaEn: infraMovimiento.creadaEn,
        rigeDesde: infraMovimiento.rigeDesde,
        cueAnexo: infraParte.cueAnexo,
        departamento: infraGeoProfile.departamento,
      })
      .from(infraMovimiento)
      .innerJoin(infraParte, eq(infraMovimiento.parteId, infraParte.id))
      .leftJoin(infraGeoProfile, eq(infraParte.cueAnexo, infraGeoProfile.cueAnexo))
      .where(and(...condicionesBase))

    for (const fila of filasMovimiento) {
      // La evidencia fotográfica documenta otro movimiento: no es un cambio de
      // situación y su resumen no es un DiffParte.
      if (fila.tipo === 'evidencia_fotografica') continue
      const tipo = fila.tipo as TipoMovimiento
      const descripcion =
        describirMovimiento(fila.resumen as unknown as DiffParte, { tipo }).join('; ') ||
        'Actualización del parte'
      const base = {
        id: fila.id,
        tipo: 'afectacion' as const,
        departamento: fila.departamento,
        cueAnexo: fila.cueAnexo,
        descripcion,
      }
      if (fila.creadaEn >= desdeIso) porRegistro.push({ ...base, ocurreEn: fila.creadaEn })
      if (fila.rigeDesde >= desdeIso) porVigencia.push({ ...base, ocurreEn: fila.rigeDesde })
    }
  }

  // 2. Episodios derivados (departamento como unidad — regla v0.1).
  const condicionesEpisodio = filtroDepartamento
    ? [eq(infraEpisodioDerivado.unidadTipo, 'departamento'), eq(infraEpisodioDerivado.unidadId, filtroDepartamento)]
    : [eq(infraEpisodioDerivado.unidadTipo, 'departamento')]
  const filasEpisodio = await db
    .select()
    .from(infraEpisodioDerivado)
    .where(and(...condicionesEpisodio))

  for (const fila of filasEpisodio) {
    const abierto: CambioSituacion = {
      id: `${fila.id}-abierto`,
      tipo: 'episodio_abierto',
      ocurreEn: fila.inicioEn,
      departamento: fila.unidadId,
      cueAnexo: null,
      descripcion: `Episodio abierto en ${fila.unidadId} (${fila.escuelasAfectadas} escuelas afectadas)`,
    }
    // Misma semántica que el cierre: "registro" es cuándo el sistema calculó
    // el episodio; "vigencia" es cuándo empezó.
    if (fila.calculadoEn >= desdeIso) porRegistro.push({ ...abierto, ocurreEn: fila.calculadoEn })
    if (fila.inicioEn >= desdeIso) porVigencia.push(abierto)
    if (fila.estado === 'cerrado' && fila.finEn) {
      const cerrado: CambioSituacion = {
        id: `${fila.id}-cerrado`,
        tipo: 'episodio_cerrado',
        ocurreEn: fila.finEn,
        departamento: fila.unidadId,
        cueAnexo: null,
        descripcion: `Episodio cerrado en ${fila.unidadId}`,
      }
      if (fila.calculadoEn >= desdeIso) porRegistro.push({ ...cerrado, ocurreEn: fila.calculadoEn })
      if (fila.finEn >= desdeIso) porVigencia.push(cerrado)
    }
  }

  // 3. Cambios de nivel de riesgo entre cortes consecutivos persistidos
  // (siempre global: el corte no desagrega por departamento). `generadoEn`
  // vale igual para registro y vigencia: el corte es instantáneo, no tiene
  // una fecha "de efecto" distinta de cuándo se generó.
  const cortes = await db
    .select()
    .from(infraSituacionCorte)
    .where(gte(infraSituacionCorte.generadoEn, desdeIso))
    .orderBy(desc(infraSituacionCorte.generadoEn))

  const NIVELES_ALTO = ['alto', 'muy_alto'] as const
  function contarAlto(conteos: Record<string, number>): number {
    return NIVELES_ALTO.reduce((total, nivel) => total + (conteos[nivel] ?? 0), 0)
  }

  for (const corte of cortes) {
    const anterior = await obtenerCorteAnterior(corte.generadoEn)
    if (!anterior) continue
    const altoActual = contarAlto(corte.conteosPorNivelRiesgo)
    const altoAnterior = contarAlto(anterior.conteosPorNivelRiesgo)
    if (altoActual === altoAnterior) continue
    const cambio: CambioSituacion = {
      id: `riesgo-${corte.id}`,
      tipo: 'riesgo',
      ocurreEn: corte.generadoEn,
      departamento: null,
      cueAnexo: null,
      descripcion:
        altoActual > altoAnterior
          ? `Escuelas en riesgo alto o muy alto subieron de ${altoAnterior} a ${altoActual}`
          : `Escuelas en riesgo alto o muy alto bajaron de ${altoAnterior} a ${altoActual}`,
    }
    porRegistro.push(cambio)
    porVigencia.push(cambio)
  }

  return { porRegistro: ordenarDesc(porRegistro), porVigencia: ordenarDesc(porVigencia) }
}
