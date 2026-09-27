import { and, eq, getTableColumns } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import { infraRiskFactor, infraRiskRun, infraRiskSnapshot } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Next.js 16 App Router: params es una promesa (misma firma que
// app/api/infraestructura/geo-perfiles/[cueAnexo]/route.ts).
type Ctx = { params: Promise<{ snapshotId: string }> }

const snapshotIdSchema = z.string().min(1).max(100)

export async function GET(_request: Request, ctx: Ctx) {
  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) {
    const error =
      acceso.status === 401 ? 'No autenticado' : 'No tiene acceso a este recurso'
    return Response.json({ error }, { status: acceso.status })
  }

  await ensureSeeded()

  const { snapshotId } = await ctx.params
  const parsed = snapshotIdSchema.safeParse(snapshotId)
  if (!parsed.success) {
    return Response.json({ error: 'snapshotId inválido' }, { status: 400 })
  }

  const db = getDb()
  // Sólo se expone un snapshot si pertenece al run vigente: un corte
  // interrumpido puede dejar filas con un run 'preparando'/'vencido' que no
  // deben ser recuperables por id. El 404 es intencionalmente idéntico al de
  // "no existe" para no filtrar el estado interno de otros runs.
  const [snapshot] = await db
    .select(getTableColumns(infraRiskSnapshot))
    .from(infraRiskSnapshot)
    .innerJoin(infraRiskRun, eq(infraRiskSnapshot.runId, infraRiskRun.id))
    .where(
      and(
        eq(infraRiskSnapshot.id, parsed.data),
        eq(infraRiskRun.estado, 'vigente'),
      ),
    )
    .limit(1)

  if (!snapshot) {
    return Response.json({ error: 'Snapshot no encontrado' }, { status: 404 })
  }

  // Un snapshot tiene pocos factores; no se pagina.
  const factores = await db
    .select({
      tipo: infraRiskFactor.tipo,
      fuente: infraRiskFactor.fuente,
      variable: infraRiskFactor.variable,
      valor: infraRiskFactor.valor,
      unidad: infraRiskFactor.unidad,
      contribucion: infraRiskFactor.contribucion,
      peso: infraRiskFactor.peso,
      explicacion: infraRiskFactor.explicacion,
      observadoEn: infraRiskFactor.observadoEn,
    })
    .from(infraRiskFactor)
    .where(eq(infraRiskFactor.snapshotId, parsed.data))

  return Response.json(
    {
      snapshot: {
        id: snapshot.id,
        runId: snapshot.runId,
        cueAnexo: snapshot.cueAnexo,
        horizonteHoras: snapshot.horizonteHoras,
        evidenciaValida: snapshot.evidenciaValida,
        scoreRiesgo: snapshot.scoreRiesgo,
        nivelRiesgo: snapshot.nivelRiesgo,
        scoreAmenaza: snapshot.scoreAmenaza,
        scoreVulnerabilidad: snapshot.scoreVulnerabilidad,
        confianza: snapshot.confianza,
        exposicionMatricula: snapshot.exposicionMatricula,
        exposicionSecciones: snapshot.exposicionSecciones,
        calculadoEn: snapshot.calculadoEn,
        validoHasta: snapshot.validoHasta,
      },
      factores,
    },
    { status: 200, headers: { 'Cache-Control': 'private, no-store' } },
  )
}
