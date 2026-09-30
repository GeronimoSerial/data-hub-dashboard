import { randomUUID } from 'node:crypto'
import type { getDb } from '@/lib/db'
import {
  hazardSourceHealth,
  infraAfectacion,
  infraAfectacionAlumno,
  infraEpisodioDerivado,
  infraGeoProfile,
  infraMovimiento,
  infraParte,
  infraRiskRun,
  infraRiskSnapshot,
  infraSituacionCorte,
} from '@/lib/db/schema'
import { PERIODO_ENOS_2026_2027_ID } from '@/lib/db/seed'

type Db = ReturnType<typeof getDb>

export async function limpiarDatosSituacion(db: Db): Promise<void> {
  await db.delete(infraSituacionCorte)
  await db.delete(infraRiskSnapshot)
  await db.delete(infraRiskRun)
  await db.delete(infraMovimiento)
  await db.delete(infraAfectacionAlumno)
  await db.delete(infraAfectacion)
  await db.delete(infraParte)
  await db.delete(infraEpisodioDerivado)
  await db.delete(infraGeoProfile)
  await db.delete(hazardSourceHealth)
}

export async function insertarRunVigente(
  db: Db,
  cobertura: Record<string, number> | null = { procesadas: 10, conEvidencia: 8, sinEvidencia: 2 },
): Promise<string> {
  const id = randomUUID()
  await db.insert(infraRiskRun).values({
    id,
    periodoId: PERIODO_ENOS_2026_2027_ID,
    modeloVersion: 'riesgo-v0',
    iniciadoEn: '2026-09-27T10:00:00.000Z',
    publicadoEn: '2026-09-27T10:05:00.000Z',
    estado: 'vigente',
    cobertura,
    creadaEn: '2026-09-27T10:00:00.000Z',
  })
  return id
}
