// Centro de Situación (E5): genera un CORTE ejecutivo del territorio y lo
// persiste como una fila de infra_situacion_corte. El corte congela la
// cobertura del run vigente, los conteos por nivel de riesgo a 24 h, la salud
// de fuentes y los KPIs de afectación/episodios en el instante `ahora`, para
// poder reconstruir exactamente lo que se vio sin depender de qué run esté
// vigente cuando el corte se lea.
//
// Función PURA respecto a lease/idempotencia: no adquiere lease, no lee flags
// ni gestiona reintentos — eso lo hace el job que la envuelve en
// scripts/jobs.mjs (mismo patrón que calcularGeoPerfiles / correrGeoPerfiles).
// Acá sólo se resuelve el `ahora` que recibe y se escribe una fila nueva.
import { randomUUID } from 'node:crypto'
import { and, countDistinct, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import {
  hazardSourceHealth,
  infraAfectacion,
  infraEpisodioDerivado,
  infraParte,
  infraRiskRun,
  infraRiskSnapshot,
  infraSituacionCorte,
} from '@/lib/db/schema'
import { obtenerPeriodoVigente } from '@/lib/infraestructura/parte-consulta'
import {
  generarBriefing,
  type CoberturaBriefing,
  type RunBriefing,
} from '@/lib/infraestructura/riesgo/briefing'

export interface KpisSituacion {
  escuelasAfectacionConfirmadaVigente: number
  escuelasRiesgoAlto24h: number
  fuentesVencidas: number
}

export interface FuenteSaludSituacion {
  provider: string
  estado: string
  frescuraMinutos: number | null
  vencida: boolean
}

export interface ResultadoGenerarCorte {
  corteId: string
  generadoEn: string
  riskRunId: string | null
  kpis: KpisSituacion
  conteosPorNivelRiesgo: Record<string, number>
  episodiosAbiertos: number
  episodiosCerradosDesdeAnterior: number
}

const HORIZONTE_ALTO_HORAS = 24

export async function generarCorte(opts: {
  ahora: Date
  jobRunId: string | null
}): Promise<ResultadoGenerarCorte> {
  const db = getDb()
  const generadoEn = opts.ahora.toISOString()

  // 1. Run de riesgo vigente (a lo sumo uno por índice único parcial). El
  // corte es un consumidor: nunca recalcula peligro ni riesgo, sólo congela
  // lo que el motor ya publicó.
  const [run] = await db
    .select()
    .from(infraRiskRun)
    .where(eq(infraRiskRun.estado, 'vigente'))
    .limit(1)

  const riskRunId = run?.id ?? null
  const cobertura = run?.cobertura ?? null

  // 2. Conteo de escuelas por nivelRiesgo a 24 h del run vigente. Las filas
  // sin nivel (sin evidencia) se excluyen del Record: no son un "nivel".
  const conteosPorNivelRiesgo: Record<string, number> = {}
  if (run) {
    const filas = await db
      .select({
        nivelRiesgo: infraRiskSnapshot.nivelRiesgo,
        conteo: sql<number>`count(*)`,
      })
      .from(infraRiskSnapshot)
      .where(
        and(
          eq(infraRiskSnapshot.runId, run.id),
          eq(infraRiskSnapshot.horizonteHoras, HORIZONTE_ALTO_HORAS),
        ),
      )
      .groupBy(infraRiskSnapshot.nivelRiesgo)

    for (const fila of filas) {
      if (fila.nivelRiesgo === null) continue
      conteosPorNivelRiesgo[fila.nivelRiesgo] = Number(fila.conteo)
    }
  }

  const escuelasRiesgoAlto24h =
    (conteosPorNivelRiesgo['alto'] ?? 0) + (conteosPorNivelRiesgo['muy_alto'] ?? 0)

  // 3. Afectación CONFIRMADA vigente: cuenta ESCUELAS (cueAnexo distintos),
  // no alumnos ni afectaciones. "Confirmada" es la semántica del parte que
  // carga la escuela (infra_afectacion vigente), no la del motor de riesgo.
  const periodo = await obtenerPeriodoVigente(db)
  let escuelasAfectacionConfirmadaVigente = 0
  if (periodo) {
    const [fila] = await db
      .select({ conteo: countDistinct(infraParte.cueAnexo) })
      .from(infraAfectacion)
      .innerJoin(infraParte, eq(infraAfectacion.parteId, infraParte.id))
      .where(
        and(
          eq(infraParte.periodoId, periodo.id),
          isNull(infraAfectacion.retiradaEn),
        ),
      )
    escuelasAfectacionConfirmadaVigente = Number(fila?.conteo ?? 0)
  }

  // 4. Salud de fuentes congelada: la frescura se calcula contra `ahora` una
  // sola vez y queda grabada, no se recalcula al leer el corte.
  const filasSalud = await db.select().from(hazardSourceHealth)
  const fuentesSalud: FuenteSaludSituacion[] = filasSalud.map((f) => {
    const frescuraMinutos =
      f.ultimoExitoEn === null
        ? null
        : Math.round((opts.ahora.getTime() - new Date(f.ultimoExitoEn).getTime()) / 60000)
    const vencida = frescuraMinutos !== null && frescuraMinutos > f.ttlMinutos
    return { provider: f.provider, estado: f.estado, frescuraMinutos, vencida }
  })
  const fuentesVencidas = fuentesSalud.filter((f) => f.vencida).length

  // 5. Episodios abiertos ahora.
  const [abiertosRow] = await db
    .select({ conteo: sql<number>`count(*)` })
    .from(infraEpisodioDerivado)
    .where(eq(infraEpisodioDerivado.estado, 'abierto'))
  const episodiosAbiertos = Number(abiertosRow?.conteo ?? 0)

  // 6. Episodios cerrados DESDE el corte anterior: se compara `finEn` contra
  // el `generadoEn` del corte persistido más reciente anterior a `ahora`.
  // ISO-8601 compara lexicográficamente, así que no hace falta parsear.
  const [corteAnterior] = await db
    .select({ generadoEn: infraSituacionCorte.generadoEn })
    .from(infraSituacionCorte)
    .where(lt(infraSituacionCorte.generadoEn, generadoEn))
    .orderBy(desc(infraSituacionCorte.generadoEn))
    .limit(1)

  let episodiosCerradosDesdeAnterior = 0
  if (corteAnterior) {
    const [cerradosRow] = await db
      .select({ conteo: sql<number>`count(*)` })
      .from(infraEpisodioDerivado)
      .where(
        and(
          eq(infraEpisodioDerivado.estado, 'cerrado'),
          gt(infraEpisodioDerivado.finEn, corteAnterior.generadoEn),
        ),
      )
    episodiosCerradosDesdeAnterior = Number(cerradosRow?.conteo ?? 0)
  }

  const kpis: KpisSituacion = {
    escuelasAfectacionConfirmadaVigente,
    escuelasRiesgoAlto24h,
    fuentesVencidas,
  }

  // 7. Persistir el corte completo (snapshot inmutable).
  const corteId = randomUUID()
  await db.insert(infraSituacionCorte).values({
    id: corteId,
    generadoEn,
    riskRunId,
    cobertura,
    conteosPorNivelRiesgo,
    kpis,
    fuentesSalud,
    episodiosAbiertos,
    episodiosCerradosDesdeAnterior,
    generadoPorJobRunId: opts.jobRunId,
    creadaEn: generadoEn,
  })

  return {
    corteId,
    generadoEn,
    riskRunId,
    kpis,
    conteosPorNivelRiesgo,
    episodiosAbiertos,
    episodiosCerradosDesdeAnterior,
  }
}

// --- Lectura de cortes persistidos (consumida por la API del Centro de
// Situación) --------------------------------------------------------------

export interface CortePersistido {
  id: string
  generadoEn: string
  riskRunId: string | null
  cobertura: Record<string, number> | null
  conteosPorNivelRiesgo: Record<string, number>
  kpis: KpisSituacion
  fuentesSalud: FuenteSaludSituacion[]
  episodiosAbiertos: number
  episodiosCerradosDesdeAnterior: number
}

/** El corte más reciente persistido, o null si el job todavía no corrió nunca. */
export async function obtenerUltimoCorte(): Promise<CortePersistido | null> {
  const db = getDb()
  const [fila] = await db
    .select()
    .from(infraSituacionCorte)
    .orderBy(desc(infraSituacionCorte.generadoEn))
    .limit(1)
  return fila ?? null
}

/**
 * Fecha de publicación de la corrida de riesgo detrás de un corte, o `null` si
 * el corte no tiene corrida o la corrida no tiene fecha. Es la fuente de la
 * frescura del encabezado: la hora del corte no dice nada del dato que muestra.
 */
export async function obtenerPublicadoEnRun(riskRunId: string | null): Promise<string | null> {
  if (riskRunId === null) return null
  const db = getDb()
  const [fila] = await db
    .select({ publicadoEn: infraRiskRun.publicadoEn })
    .from(infraRiskRun)
    .where(eq(infraRiskRun.id, riskRunId))
    .limit(1)
  return fila?.publicadoEn ?? null
}

/** El corte inmediatamente anterior a `generadoEn` (estrictamente previo). */
export async function obtenerCorteAnterior(
  generadoEn: string,
): Promise<CortePersistido | null> {
  const db = getDb()
  const [fila] = await db
    .select()
    .from(infraSituacionCorte)
    .where(lt(infraSituacionCorte.generadoEn, generadoEn))
    .orderBy(desc(infraSituacionCorte.generadoEn))
    .limit(1)
  return fila ?? null
}

/**
 * Reconstruye el briefing determinista de E4 (`generarBriefing`) usando
 * EXCLUSIVAMENTE los datos ya congelados en dos filas de `infra_situacion_corte`
 * (nunca consulta `infra_risk_run` en vivo): el corte es autosuficiente. El
 * `id` del "run" que ve el briefing es el propio `corteId` (no `riskRunId`,
 * que puede repetirse entre cortes consecutivos si el motor todavía no
 * recalculó riesgo) para que dos cortes distintos siempre se identifiquen
 * distinto en el texto, incluso sobre el mismo run de riesgo.
 */
// `infra_situacion_corte.cobertura` se persiste con el shape exacto que
// escribe generarCorte (copia de infra_risk_run.cobertura), pero la columna
// está tipada como Record<string, number> | null porque Drizzle no valida
// forma en JSON: acá se normaliza a CoberturaBriefing | null, descartando
// cualquier fila legada que no tenga las tres claves esperadas en vez de
// pasarle un shape parcial al briefing.
function normalizarCobertura(
  cobertura: Record<string, number> | null,
): CoberturaBriefing | null {
  if (cobertura === null) return null
  const { procesadas, conEvidencia, sinEvidencia } = cobertura
  if (
    typeof procesadas !== 'number' ||
    typeof conEvidencia !== 'number' ||
    typeof sinEvidencia !== 'number'
  ) {
    return null
  }
  return { procesadas, conEvidencia, sinEvidencia }
}

export function reconstruirBriefingDesdeCorte(
  corteActual: CortePersistido,
  corteAnterior: CortePersistido | null,
): string[] {
  const runActual: RunBriefing = {
    id: corteActual.id,
    cobertura: normalizarCobertura(corteActual.cobertura),
    publicadoEn: corteActual.generadoEn,
  }
  if (corteAnterior === null) {
    return generarBriefing(runActual, null, { actual: corteActual.conteosPorNivelRiesgo, anterior: null })
  }
  const runAnterior: RunBriefing = {
    id: corteAnterior.id,
    cobertura: normalizarCobertura(corteAnterior.cobertura),
    publicadoEn: corteAnterior.generadoEn,
  }
  return generarBriefing(runActual, runAnterior, {
    actual: corteActual.conteosPorNivelRiesgo,
    anterior: corteAnterior.conteosPorNivelRiesgo,
  })
}
