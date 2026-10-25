// Mantenimiento de cortes del padrón (schema `ge`): limpieza de cortes
// huérfanos que quedaron en 'importando' porque su import murió, y rotación de
// cortes históricos para que el import nocturno (~300.000 membresías por
// corte) no acumule filas sin límite.
//
// Reglas que no se negocian:
// - El corte 'vigente' nunca se borra.
// - Un corte referenciado por infra_parte (los partes guardan el corte contra
//   el que se cargaron y la vista nominal/impacto lo relee) nunca se borra.
// - Cada borrado corre en su propia transacción sobre una conexión dedicada y
//   re-chequea estado y referencias dentro de esa transacción.
// - `dryRun` sólo lee: sirve para revisar el plan en producción antes de
//   aplicarlo.
import { ejecutarEnTransaccionDedicada, type EjecutorSql, type EjecutorSqlRaw } from './ge-db'

export type EstadoCorte = 'importando' | 'vigente' | 'historico'

export type CorteResumen = {
  id: number
  estado: EstadoCorte
  fetchedAt: string
  secciones: number
  membresias: number
  partes: number
}

export type PoliticaCortes = {
  /** Cuántos cortes 'historico' (los más nuevos) se conservan además del vigente. */
  historicosAConservar: number
  /** Antigüedad mínima para considerar huérfano un corte 'importando'. */
  huerfanoTrasMs: number
}

export type PlanMantenimiento = {
  huerfanos: CorteResumen[]
  historicosARotar: CorteResumen[]
  retenidosPorPartes: CorteResumen[]
  conservados: CorteResumen[]
}

export const HISTORICOS_A_CONSERVAR_POR_DEFECTO = 2
export const HUERFANO_TRAS_HORAS_POR_DEFECTO = 6

const TAMANO_BORRADO = 50_000

function enteroNoNegativo(valor: string | undefined): number | undefined {
  if (valor === undefined || valor.trim() === '') return undefined
  const n = Number(valor)
  return Number.isInteger(n) && n >= 0 ? n : undefined
}

/** Política desde el entorno: PADRON_CORTES_HISTORICOS y PADRON_HUERFANO_HORAS. */
export function politicaDesdeEntorno(env: Record<string, string | undefined> = process.env): PoliticaCortes {
  const historicos = enteroNoNegativo(env.PADRON_CORTES_HISTORICOS) ?? HISTORICOS_A_CONSERVAR_POR_DEFECTO
  const horas = enteroNoNegativo(env.PADRON_HUERFANO_HORAS) ?? HUERFANO_TRAS_HORAS_POR_DEFECTO
  return { historicosAConservar: historicos, huerfanoTrasMs: horas * 3_600_000 }
}

async function existeTablaPartes(client: EjecutorSql): Promise<boolean> {
  const res = await client.execute("SELECT to_regclass('public.infra_parte') IS NOT NULL AS existe")
  return Boolean(res.rows[0]?.existe)
}

export async function listarCortes(client: EjecutorSql): Promise<CorteResumen[]> {
  const partes = (await existeTablaPartes(client))
    ? '(SELECT COUNT(*) FROM public.infra_parte p WHERE p.corte_id = c.id)'
    : '0'
  const res = await client.execute(
    `SELECT c.id, c.estado, c.fetched_at,
            (SELECT COUNT(*) FROM ge.ge_seccion s WHERE s.corte_id = c.id) AS secciones,
            (SELECT COUNT(*) FROM ge.ge_alumno_seccion m WHERE m.corte_id = c.id) AS membresias,
            ${partes} AS partes
       FROM ge.ge_corte c
      ORDER BY c.id`,
  )
  return res.rows.map((r) => ({
    id: Number(r.id),
    estado: String(r.estado) as EstadoCorte,
    fetchedAt: String(r.fetched_at),
    secciones: Number(r.secciones),
    membresias: Number(r.membresias),
    partes: Number(r.partes),
  }))
}

/**
 * Decide qué borrar. Pura: no toca la base.
 * - huérfanos: 'importando' más viejos que `huerfanoTrasMs`, salvo
 *   `corteEnCursoId` (el que está importando este proceso) y salvo que haya
 *   otro import con lease vivo (`hayOtroImportVivo`), en cuyo caso no se
 *   toca ninguno.
 * - rotación: de los 'historico', se conservan los `historicosAConservar` más
 *   nuevos; del resto se borran los que no tienen partes.
 */
export function planificarMantenimiento(
  cortes: CorteResumen[],
  opciones: PoliticaCortes & { ahora: Date; corteEnCursoId?: number | null; hayOtroImportVivo?: boolean },
): PlanMantenimiento {
  const ahora = opciones.ahora.getTime()
  const retenidosPorPartes: CorteResumen[] = []

  const huerfanos: CorteResumen[] = []
  if (!opciones.hayOtroImportVivo) {
    for (const c of cortes) {
      if (c.estado !== 'importando' || c.id === opciones.corteEnCursoId) continue
      const inicio = Date.parse(c.fetchedAt)
      if (!Number.isFinite(inicio) || ahora - inicio < opciones.huerfanoTrasMs) continue
      if (c.partes > 0) retenidosPorPartes.push(c)
      else huerfanos.push(c)
    }
  }

  const historicos = cortes.filter((c) => c.estado === 'historico').sort((a, b) => b.id - a.id)
  const conservados = historicos.slice(0, opciones.historicosAConservar)
  const historicosARotar: CorteResumen[] = []
  for (const c of historicos.slice(opciones.historicosAConservar)) {
    if (c.partes > 0) retenidosPorPartes.push(c)
    else historicosARotar.push(c)
  }

  return { huerfanos, historicosARotar, retenidosPorPartes, conservados }
}

/**
 * Borra un corte (membresías, secciones y la fila de ge_corte) en una sola
 * transacción dedicada. Devuelve false sin borrar nada si, al momento de
 * borrar, el corte ya no existe, no está en uno de `estadosPermitidos` o
 * quedó referenciado por un parte. Nunca borra un corte vigente.
 */
export async function eliminarCorte(
  destino: EjecutorSql | EjecutorSqlRaw,
  corteId: number,
  estadosPermitidos: readonly EstadoCorte[],
): Promise<boolean> {
  const permitidos: EstadoCorte[] = estadosPermitidos.filter((e) => e !== 'vigente')
  return ejecutarEnTransaccionDedicada(destino, async (tx) => {
    const corte = await tx.execute({
      sql: 'SELECT estado FROM ge.ge_corte WHERE id = ? FOR UPDATE',
      args: [corteId],
    })
    const estado = corte.rows[0]?.estado as EstadoCorte | undefined
    if (!estado || !permitidos.includes(estado)) return false

    if (await existeTablaPartes(tx)) {
      const partes = await tx.execute({
        sql: 'SELECT COUNT(*) AS n FROM public.infra_parte WHERE corte_id = ?',
        args: [corteId],
      })
      if (Number(partes.rows[0]?.n ?? 0) > 0) return false
    }

    // Por tramos: cada sentencia queda lejos del statement_timeout del pool
    // (30 s por defecto) aunque el corte tenga cientos de miles de filas.
    for (;;) {
      const borradas = await tx.execute({
        sql: `DELETE FROM ge.ge_alumno_seccion WHERE ctid IN (
                SELECT ctid FROM ge.ge_alumno_seccion WHERE corte_id = ? LIMIT ${TAMANO_BORRADO}
              ) RETURNING 1 AS x`,
        args: [corteId],
      })
      if (borradas.rows.length < TAMANO_BORRADO) break
    }
    await tx.execute({ sql: 'DELETE FROM ge.ge_seccion WHERE corte_id = ?', args: [corteId] })
    await tx.execute({ sql: 'DELETE FROM ge.ge_corte WHERE id = ?', args: [corteId] })
    return true
  })
}

export type ResultadoMantenimiento = PlanMantenimiento & {
  dryRun: boolean
  eliminados: number[]
  omitidos: number[]
}

/**
 * Lista, planifica y (salvo dryRun) aplica. `soloHuerfanos` limita la pasada a
 * la limpieza de 'importando' (se usa al arrancar un import, antes de que el
 * corte nuevo esté vigente: rotar ahí podría borrar el histórico que pasaría
 * a ser el anterior).
 */
export async function mantenerCortes(
  client: EjecutorSql,
  opciones: PoliticaCortes & {
    ahora?: Date
    corteEnCursoId?: number | null
    hayOtroImportVivo?: boolean
    dryRun?: boolean
    soloHuerfanos?: boolean
  },
): Promise<ResultadoMantenimiento> {
  const cortes = await listarCortes(client)
  const plan = planificarMantenimiento(cortes, { ...opciones, ahora: opciones.ahora ?? new Date() })
  if (opciones.soloHuerfanos) {
    plan.historicosARotar = []
    plan.retenidosPorPartes = plan.retenidosPorPartes.filter((c) => c.estado === 'importando')
  }

  const eliminados: number[] = []
  const omitidos: number[] = []
  if (!opciones.dryRun) {
    for (const c of plan.huerfanos) {
      if (await eliminarCorte(client, c.id, ['importando'])) eliminados.push(c.id)
      else omitidos.push(c.id)
    }
    for (const c of plan.historicosARotar) {
      if (await eliminarCorte(client, c.id, ['historico'])) eliminados.push(c.id)
      else omitidos.push(c.id)
    }
  }
  return { ...plan, dryRun: Boolean(opciones.dryRun), eliminados, omitidos }
}
