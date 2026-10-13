import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import {
  infraGeoProfile,
  infraRiskRun,
  infraRiskSnapshot,
} from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { jsonError } from '@/lib/infraestructura/respuesta-error'
import { jsonNoStore } from '@/lib/infraestructura/respuesta-no-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// El motor v0 sólo publica cortes para estos tres horizontes.
const horizonteSchema = z.union([z.literal(24), z.literal(72), z.literal(240)])

// El resto de los params se validan juntos para devolver un 400 descriptivo.
const paginacionSchema = z.object({
  periodoId: z.string().min(1).optional(),
  departamento: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
})

const itemsFields = {
  snapshotId: infraRiskSnapshot.id,
  cueAnexo: infraRiskSnapshot.cueAnexo,
  departamento: infraGeoProfile.departamento,
  horizonteHoras: infraRiskSnapshot.horizonteHoras,
  evidenciaValida: infraRiskSnapshot.evidenciaValida,
  scoreRiesgo: infraRiskSnapshot.scoreRiesgo,
  nivelRiesgo: infraRiskSnapshot.nivelRiesgo,
  scoreAmenaza: infraRiskSnapshot.scoreAmenaza,
  nivelAmenaza: infraRiskSnapshot.nivelAmenaza,
  scoreVulnerabilidad: infraRiskSnapshot.scoreVulnerabilidad,
  confianza: infraRiskSnapshot.confianza,
  exposicionMatricula: infraRiskSnapshot.exposicionMatricula,
  exposicionSecciones: infraRiskSnapshot.exposicionSecciones,
  calculadoEn: infraRiskSnapshot.calculadoEn,
  validoHasta: infraRiskSnapshot.validoHasta,
}

function sinCorte(page: number, pageSize: number) {
  return {
    items: [],
    page,
    pageSize,
    total: 0,
    totalPages: 0,
    runVigente: null,
  }
}

export async function GET(request: Request) {
  // ACL primero: una request sin sesión no debe disparar trabajo de DB
  // (ensureSeeded) antes de fallar.
  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)

  await ensureSeeded()

  const { searchParams } = new URL(request.url)

  let horizonte: 24 | 72 | 240 | undefined
  const horizonteRaw = searchParams.get('horizonte')
  if (horizonteRaw !== null) {
    const parsedHorizonte = horizonteSchema.safeParse(Number(horizonteRaw))
    if (!parsedHorizonte.success) {
      return Response.json({ error: 'horizonte inválido' }, { status: 400 })
    }
    horizonte = parsedHorizonte.data
  }

  const parsed = paginacionSchema.safeParse({
    periodoId: searchParams.get('periodoId') ?? undefined,
    departamento: searchParams.get('departamento') ?? undefined,
    page: searchParams.get('page') ?? undefined,
    pageSize: searchParams.get('pageSize') ?? undefined,
  })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return jsonError(`Parámetro inválido: ${issue.path.join('.')}`, 400)
  }
  const { periodoId, departamento, page, pageSize } = parsed.data

  const db = getDb()
  const [runVigente] = await db
    .select()
    .from(infraRiskRun)
    .where(eq(infraRiskRun.estado, 'vigente'))
    .limit(1)

  // Estado legítimo: el motor todavía no publicó ningún corte. No es un error.
  if (!runVigente) {
    return jsonNoStore(sinCorte(page, pageSize))
  }

  // Limitación conocida de v0: sólo se expone el run vigente actual, no el
  // histórico por período. Si piden un período distinto, no hay nada que
  // devolver (no es un error ni un 404).
  if (periodoId !== undefined && periodoId !== runVigente.periodoId) {
    return jsonNoStore(sinCorte(page, pageSize))
  }

  const condiciones = [eq(infraRiskSnapshot.runId, runVigente.id)]
  if (horizonte !== undefined) {
    condiciones.push(eq(infraRiskSnapshot.horizonteHoras, horizonte))
  }
  if (departamento !== undefined) {
    // El dato viene normalizado en mayúsculas desde geo-perfil.ts.
    condiciones.push(eq(infraGeoProfile.departamento, departamento))
  }
  const where = and(...condiciones)

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(infraRiskSnapshot)
    .innerJoin(
      infraGeoProfile,
      eq(infraRiskSnapshot.cueAnexo, infraGeoProfile.cueAnexo),
    )
    .where(where)
  const total = Number(countRow?.count ?? 0)

  // Orden explícito con NULLS LAST para no depender del default de cada motor:
  // en Postgres, DESC deja los NULL al principio, pero acá las escuelas sin
  // evidencia (scoreRiesgo null) deben quedar al final — el ranking arranca por
  // el riesgo más alto.
  const items = await db
    .select(itemsFields)
    .from(infraRiskSnapshot)
    .innerJoin(
      infraGeoProfile,
      eq(infraRiskSnapshot.cueAnexo, infraGeoProfile.cueAnexo),
    )
    .where(where)
    .orderBy(sql`${infraRiskSnapshot.scoreRiesgo} desc nulls last`)
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return jsonNoStore(
    {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      runVigente: {
        id: runVigente.id,
        modeloVersion: runVigente.modeloVersion,
        publicadoEn: runVigente.publicadoEn,
      },
    },
  )
}
