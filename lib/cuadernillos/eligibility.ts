import type { Eligibility } from './types'
import { esSeveridad } from '@/lib/infraestructura/validacion'
import { BOOKLET_ELIGIBILITY_LOCK_CLASS, BOOKLET_ELIGIBILITY_LOCK_OBJECT, type EjecutorSql } from '@/lib/infraestructura/ge-db'

export type CurrentSeverityProjection = (cueAnexo: string) => Promise<string | null>

/** Acquire the shared half of the source-write serialization protocol. */
export async function lockCurrentEligibilitySources(executor: EjecutorSql): Promise<void> {
  await executor.execute({
    sql: 'SELECT pg_advisory_xact_lock_shared(?, ?)',
    args: [BOOKLET_ELIGIBILITY_LOCK_CLASS, BOOKLET_ELIGIBILITY_LOCK_OBJECT],
  })
}

const readCurrentSeverity: CurrentSeverityProjection = async (cueAnexo) => {
  const { listarPartesVigentes } = await import('@/lib/infraestructura/parte-mapa')
  const { partes } = await listarPartesVigentes({ cueAnexo })
  const matches = partes.filter((parte) => parte.cueAnexo === cueAnexo)
  if (matches.length !== 1) return null
  return matches[0].peorSeveridad
}

/** Uses the live map projection so derived student priority is not reimplemented. */
export async function getSchoolEligibility(
  cueAnexo: string,
  readSeverity: CurrentSeverityProjection = readCurrentSeverity,
): Promise<Eligibility> {
  const evaluatedAt = new Date().toISOString()
  if (!/^\d{9}$/.test(cueAnexo)) return { eligible: false, severity: null, evaluatedAt }

  let severity: string | null
  try {
    severity = await readSeverity(cueAnexo)
  } catch {
    severity = null
  }
  if (severity !== null && !esSeveridad(severity)) severity = null

  return { eligible: severity === 'Crítica', severity, evaluatedAt }
}
