import { vi } from 'vitest'
import type { SessionUser } from '@/lib/acl'
import { getDb } from '@/lib/db'
import {
  hazardEnsembleProb,
  infraRiskRun,
  infraRiskSnapshot,
} from '@/lib/db/schema'
import type { AccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'

export const USER: SessionUser = {
  id: 'u1',
  role: 'consulta',
  banned: false,
  nivelJurIds: [],
  accesoRecursos: 'todos' as const,
  recursoIds: [],
}

export function mockAcceso(acceso: AccesoLectura) {
  vi.mocked(verificarAccesoLectura).mockResolvedValue(acceso)
}

export const RUN_VIGENTE = 'run-vigente'
export const RUN_VIEJO = 'run-viejo'
export const PUBLICADO_EN = '2026-01-02T00:00:00Z'

export async function sembrarMotorBase(periodoId: string) {
  const db = getDb()

  await db.insert(infraRiskRun).values([
    {
      id: RUN_VIGENTE,
      periodoId,
      modeloVersion: 'motor-v0.4',
      iniciadoEn: '2026-01-01T00:00:00Z',
      publicadoEn: PUBLICADO_EN,
      estado: 'vigente',
      cobertura: { procesadas: 5, conEvidencia: 4, sinEvidencia: 1 },
      creadaEn: '2026-01-01T00:00:00Z',
    },
    {
      id: RUN_VIEJO,
      periodoId,
      modeloVersion: 'riesgo-v0',
      iniciadoEn: '2025-12-01T00:00:00Z',
      publicadoEn: '2025-12-02T00:00:00Z',
      estado: 'vencido',
      cobertura: null,
      creadaEn: '2025-12-01T00:00:00Z',
    },
  ])

  await db.insert(infraRiskSnapshot).values([
    {
      id: 's1',
      runId: RUN_VIGENTE,
      cueAnexo: '1000000-01',
      horizonteHoras: 24,
      evidenciaValida: true,
      scoreRiesgo: 80,
      nivelRiesgo: 'muy_alto',
      scoreAmenaza: 70,
      nivelAmenaza: 'alto',
      scoreVulnerabilidad: 60,
      confianza: 'alta',
      exposicionMatricula: 100,
      exposicionSecciones: 5,
      calculadoEn: '2026-01-02T00:00:00Z',
      validoHasta: '2026-01-03T00:00:00Z',
    },
    {
      id: 's2',
      runId: RUN_VIGENTE,
      cueAnexo: '1000000-02',
      horizonteHoras: 24,
      evidenciaValida: true,
      scoreRiesgo: 50,
      nivelRiesgo: 'moderado',
      scoreAmenaza: 40,
      nivelAmenaza: 'moderado',
      scoreVulnerabilidad: 35,
      confianza: 'media',
      exposicionMatricula: 80,
      exposicionSecciones: 4,
      calculadoEn: '2026-01-02T00:00:00Z',
      validoHasta: '2026-01-03T00:00:00Z',
    },
    {
      id: 's3',
      runId: RUN_VIGENTE,
      cueAnexo: '1000000-03',
      horizonteHoras: 24,
      evidenciaValida: false,
      scoreRiesgo: null,
      nivelRiesgo: null,
      scoreAmenaza: null,
      nivelAmenaza: null,
      scoreVulnerabilidad: null,
      confianza: 'baja',
      exposicionMatricula: null,
      exposicionSecciones: null,
      calculadoEn: '2026-01-02T00:00:00Z',
      validoHasta: '2026-01-03T00:00:00Z',
    },
    {
      id: 's4',
      runId: RUN_VIGENTE,
      cueAnexo: '1000000-04',
      horizonteHoras: 24,
      evidenciaValida: true,
      scoreRiesgo: 30,
      nivelRiesgo: 'bajo',
      scoreAmenaza: 20,
      nivelAmenaza: 'bajo',
      scoreVulnerabilidad: 15,
      confianza: 'media',
      exposicionMatricula: 60,
      exposicionSecciones: 3,
      calculadoEn: '2026-01-02T00:00:00Z',
      validoHasta: '2026-01-03T00:00:00Z',
    },
    {
      id: 's5',
      runId: RUN_VIGENTE,
      cueAnexo: '1000000-05',
      horizonteHoras: 72,
      evidenciaValida: true,
      scoreRiesgo: 60,
      nivelRiesgo: 'alto',
      scoreAmenaza: 55,
      nivelAmenaza: 'alto',
      scoreVulnerabilidad: 45,
      confianza: 'alta',
      exposicionMatricula: 90,
      exposicionSecciones: 4,
      calculadoEn: '2026-01-02T00:00:00Z',
      validoHasta: '2026-01-05T00:00:00Z',
    },
    {
      id: 's6',
      runId: RUN_VIEJO,
      cueAnexo: '1000000-01',
      horizonteHoras: 24,
      evidenciaValida: true,
      scoreRiesgo: 999,
      nivelRiesgo: 'muy_alto',
      scoreAmenaza: 99,
      nivelAmenaza: 'muy_alto',
      scoreVulnerabilidad: 99,
      confianza: 'alta',
      exposicionMatricula: 100,
      exposicionSecciones: 5,
      calculadoEn: '2025-12-02T00:00:00Z',
      validoHasta: '2025-12-03T00:00:00Z',
    },
  ])
}

export async function sembrarPeligroRadar() {
  await getDb().insert(hazardEnsembleProb).values([
    {
      id: 'e1',
      geometryRef: 'celda-a',
      variable: 'precipitacion_24h',
      corridaEn: '2026-01-01T00:00:00Z',
      validoEn: '2026-01-02T00:00:00Z',
      horizonteHoras: 24,
      miembrosTotal: 51,
      miembrosValidos: 51,
      probabilidadP95: 0.6,
      probabilidadP99: 0.6,
      dispersion: 1,
      version: 'ensemble-v1',
      ingeridoEn: '2026-01-01T00:00:00Z',
    },
    {
      id: 'e2',
      geometryRef: 'celda-a',
      variable: 'precipitacion_24h',
      corridaEn: '2026-01-01T00:00:00Z',
      validoEn: '2026-01-04T00:00:00Z',
      horizonteHoras: 72,
      miembrosTotal: 51,
      miembrosValidos: 51,
      probabilidadP95: 0.2,
      probabilidadP99: 0,
      dispersion: 1,
      version: 'ensemble-v1',
      ingeridoEn: '2026-01-01T00:00:00Z',
    },
  ])
}
