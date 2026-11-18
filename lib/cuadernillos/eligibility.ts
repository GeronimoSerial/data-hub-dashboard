import type { Eligibility } from './types'
import { getDb } from '@/lib/db'
import { esSeveridad } from '@/lib/infraestructura/validacion'
import { ejecutorGe, prepararEsquemaGe } from './ge-conexion'
import { BOOKLET_ELIGIBILITY_LOCK_CLASS, BOOKLET_ELIGIBILITY_LOCK_OBJECT, type EjecutorSql } from '@/lib/infraestructura/ge-db'

export type CurrentSeverityProjection = (cueAnexo: string) => Promise<string | null>

/** Acquire the shared half of the source-write serialization protocol. */
export async function lockCurrentEligibilitySources(executor: EjecutorSql): Promise<void> {
  await executor.execute({
    sql: 'SELECT pg_advisory_xact_lock_shared(?, ?)',
    args: [BOOKLET_ELIGIBILITY_LOCK_CLASS, BOOKLET_ELIGIBILITY_LOCK_OBJECT],
  })
}

/** Booklet tables store 9-digit CUEs; map partes (infra_parte) use the dashed `1234567-89` form. */
export function toDashedCue(cueAnexo: string): string {
  return /^\d{9}$/.test(cueAnexo) ? `${cueAnexo.slice(0, 7)}-${cueAnexo.slice(7)}` : cueAnexo
}

export type CurrentParte = { peorSeveridad: string; nombre: string }
export type CurrentParteProjection = (cueAnexo: string) => Promise<CurrentParte | null>

const readCurrentParte: CurrentParteProjection = async (cueAnexo) => {
  const { listarPartesVigentes } = await import('@/lib/infraestructura/parte-mapa')
  const dashed = toDashedCue(cueAnexo)
  // Misma conexión que la transacción abierta, si la hay: sin una segunda conexión del pool.
  const { partes } = await listarPartesVigentes({ cueAnexo: dashed }, {
    db: getDb(),
    client: ejecutorGe(),
    geSchema: await prepararEsquemaGe(),
  })
  const matches = partes.filter((parte) => parte.cueAnexo === dashed)
  if (matches.length !== 1) return null
  return { peorSeveridad: matches[0].peorSeveridad, nombre: matches[0].nombre }
}

const readCurrentSeverity: CurrentSeverityProjection = async (cueAnexo) => (await readCurrentParte(cueAnexo))?.peorSeveridad ?? null

/** Uses the live map projection so derived student priority is not reimplemented. */
export async function getSchoolEligibility(
  cueAnexo: string,
  readSeverity: CurrentSeverityProjection = readCurrentSeverity,
): Promise<Eligibility> {
  const { eligible, severity, evaluatedAt } = await decideEligibility(cueAnexo, () => readSeverity(cueAnexo))
  return { eligible, severity, evaluatedAt }
}

export type SchoolEligibilityWithName = Eligibility & { nombre: string | null }

/** Same rule as getSchoolEligibility, plus the school name, both taken from one map row. */
export async function getSchoolEligibilityWithName(
  cueAnexo: string,
  readParte: CurrentParteProjection = readCurrentParte,
): Promise<SchoolEligibilityWithName> {
  const parte = /^\d{9}$/.test(cueAnexo) ? await readParte(cueAnexo).catch(() => null) : null
  const eligibility = await decideEligibility(cueAnexo, async () => parte?.peorSeveridad ?? null)
  return { ...eligibility, nombre: parte?.nombre ?? null }
}

async function decideEligibility(cueAnexo: string, readSeverity: () => Promise<string | null>): Promise<Eligibility> {
  const evaluatedAt = new Date().toISOString()
  if (!/^\d{9}$/.test(cueAnexo)) return { eligible: false, severity: null, evaluatedAt }

  let severity: string | null
  try {
    severity = await readSeverity()
  } catch {
    severity = null
  }
  if (severity !== null && !esSeveridad(severity)) severity = null

  return { eligible: severity === 'Crítica', severity, evaluatedAt }
}

/** Nivel jurisdiccional 9: Consejo General de Educación (the booklet school universe). */
export const CONSEJO_NIVEL_JURISDICCIONAL_ID = 9
const MAX_CRITICAL_SCHOOL_RESULTS = 20

export type ConsejoSchoolSeverityRow = { cueAnexo: string; nombre: string; departamento: string; peorSeveridad: string }
export type CriticalConsejoSchool = { cueAnexo: string; nombre: string; departamento: string; severity: 'Crítica' }
export type ConsejoSeverityReader = () => Promise<ConsejoSchoolSeverityRow[]>

const readConsejoSeverityRows: ConsejoSeverityReader = async () => {
  const { listarPartesVigentes } = await import('@/lib/infraestructura/parte-mapa')
  const { partes } = await listarPartesVigentes({ nivelesJurIds: [CONSEJO_NIVEL_JURISDICCIONAL_ID] })
  return partes.map((parte) => ({
    cueAnexo: parte.cueAnexo, nombre: parte.nombre, departamento: parte.departamento, peorSeveridad: parte.peorSeveridad,
  }))
}

/**
 * Consejo schools whose current severity is Crítica and whose 9-digit CUE starts with the typed digits.
 * Severity is decided by getSchoolEligibility, the same rule used to admit a request. A CUE reported more
 * than once by the map is dropped rather than guessed.
 */
const foldText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/** Digits search by CUE prefix; anything else is a case- and accent-insensitive search of the school name. */
export async function searchCriticalConsejoSchools(
  query: string,
  readRows: ConsejoSeverityReader = readConsejoSeverityRows,
): Promise<CriticalConsejoSchool[]> {
  const byCue = /^\d{1,9}$/.test(query)
  const text = byCue ? '' : foldText(query)
  if (!byCue && text.length < 3) return []
  const rows = await readRows()
  const occurrences = new Map<string, number>()
  for (const row of rows) occurrences.set(row.cueAnexo, (occurrences.get(row.cueAnexo) ?? 0) + 1)

  const results: CriticalConsejoSchool[] = []
  for (const row of rows) {
    const cue = row.cueAnexo.replace('-', '')
    if (!(byCue ? cue.startsWith(query) : foldText(row.nombre).includes(text)) || occurrences.get(row.cueAnexo) !== 1) continue
    const eligibility = await getSchoolEligibility(cue, async () => row.peorSeveridad)
    if (!eligibility.eligible || eligibility.severity !== 'Crítica') continue
    results.push({ cueAnexo: cue, nombre: row.nombre, departamento: row.departamento, severity: 'Crítica' })
    if (results.length === MAX_CRITICAL_SCHOOL_RESULTS) break
  }
  return results
}
