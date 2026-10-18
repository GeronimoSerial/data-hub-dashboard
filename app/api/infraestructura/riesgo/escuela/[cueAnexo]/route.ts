import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import { infraRiskFactor, infraRiskRun, infraRiskSnapshot } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { presentarCrecida, presentarReferenciaEstudio } from '@/lib/infraestructura/riesgo/presentacion-crecida'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Next.js 16 App Router: params es una promesa (misma firma que
// app/api/infraestructura/geo-perfiles/[cueAnexo]/route.ts).
type Ctx = { params: Promise<{ cueAnexo: string }> }

const cueAnexoSchema = z.string().min(1).max(40)
const horizonteSchema = z.union([z.literal(24), z.literal(72), z.literal(240)])
const HORIZONTE_DEFECTO = 72

export async function GET(request: Request, ctx: Ctx) {
  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)

  await ensureSeeded()

  const { cueAnexo } = await ctx.params
  const parsedCue = cueAnexoSchema.safeParse(cueAnexo)
  if (!parsedCue.success) {
    return Response.json({ error: 'cueAnexo inválido' }, { status: 400 })
  }

  const horizonteRaw = new URL(request.url).searchParams.get('horizonte')
  const parsedHorizonte = horizonteSchema.safeParse(
    horizonteRaw === null ? HORIZONTE_DEFECTO : Number(horizonteRaw),
  )
  if (!parsedHorizonte.success) {
    return Response.json({ error: 'horizonte inválido' }, { status: 400 })
  }

  const db = getDb()
  // Sólo se expone el snapshot del run vigente: los runs 'preparando'/'vencido'
  // no deben ser visibles desde la vista de escuela.
  const [snapshot] = await db
    .select({
      id: infraRiskSnapshot.id,
      cueAnexo: infraRiskSnapshot.cueAnexo,
      horizonteHoras: infraRiskSnapshot.horizonteHoras,
      nivelRiesgo: infraRiskSnapshot.nivelRiesgo,
      scoreRiesgo: infraRiskSnapshot.scoreRiesgo,
      nivelAmenaza: infraRiskSnapshot.nivelAmenaza,
      calculadoEn: infraRiskSnapshot.calculadoEn,
      validoHasta: infraRiskSnapshot.validoHasta,
    })
    .from(infraRiskSnapshot)
    .innerJoin(infraRiskRun, eq(infraRiskSnapshot.runId, infraRiskRun.id))
    .where(
      and(
        eq(infraRiskSnapshot.cueAnexo, parsedCue.data),
        eq(infraRiskSnapshot.horizonteHoras, parsedHorizonte.data),
        eq(infraRiskRun.estado, 'vigente'),
      ),
    )
    .limit(1)

  const headers = { 'Cache-Control': 'private, no-store' }

  // Una escuela sin evaluación vigente es un estado válido, no un 404.
  if (!snapshot) {
    const crecidaRio = presentarReferenciaEstudio(parsedCue.data, [])
    return Response.json({ snapshot: null, factores: [], ...(crecidaRio ? { crecidaRio } : {}) }, { status: 200, headers })
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
    .where(eq(infraRiskFactor.snapshotId, snapshot.id))

  return Response.json(
    {
      snapshot: {
        id: snapshot.id,
        cueAnexo: snapshot.cueAnexo,
        horizonteHoras: snapshot.horizonteHoras,
        nivelRiesgo: snapshot.nivelRiesgo,
        scoreRiesgo: snapshot.scoreRiesgo,
        nivelAmenaza: snapshot.nivelAmenaza,
        calculadoEn: snapshot.calculadoEn,
        validoHasta: snapshot.validoHasta,
      },
      factores,
      crecidaRio: presentarCrecida(snapshot.cueAnexo, factores, snapshot.calculadoEn)
        ?? presentarReferenciaEstudio(snapshot.cueAnexo, factores),
    },
    { status: 200, headers },
  )
}
