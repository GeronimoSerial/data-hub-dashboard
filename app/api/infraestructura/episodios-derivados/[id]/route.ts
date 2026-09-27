import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import { infraEpisodioDerivado, infraEpisodioMiembro } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Next.js 16 App Router: params es una promesa (misma firma que
// app/api/infraestructura/riesgo/[snapshotId]/route.ts).
type Ctx = { params: Promise<{ id: string }> }

const idSchema = z.string().min(1).max(100)

export async function GET(_request: Request, ctx: Ctx) {
  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) {
    const error =
      acceso.status === 401 ? 'No autenticado' : 'No tiene acceso a este recurso'
    return Response.json({ error }, { status: acceso.status })
  }

  await ensureSeeded()

  const { id } = await ctx.params
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) {
    return Response.json({ error: 'id inválido' }, { status: 400 })
  }

  const db = getDb()
  const [episodio] = await db
    .select()
    .from(infraEpisodioDerivado)
    .where(eq(infraEpisodioDerivado.id, parsed.data))
    .limit(1)

  // El 404 es intencionalmente idéntico al de "no existe" para no distinguir
  // entre un recurso inexistente y uno que no debería verse.
  if (!episodio) {
    return Response.json({ error: 'No encontrado' }, { status: 404 })
  }

  // Un episodio tiene pocos miembros; no se pagina.
  const miembros = await db
    .select({
      cueAnexo: infraEpisodioMiembro.cueAnexo,
      movimientoId: infraEpisodioMiembro.movimientoId,
      primeraAfectacionEn: infraEpisodioMiembro.primeraAfectacionEn,
      recuperadoEn: infraEpisodioMiembro.recuperadoEn,
    })
    .from(infraEpisodioMiembro)
    .where(eq(infraEpisodioMiembro.episodioDerivadoId, parsed.data))
    .orderBy(asc(infraEpisodioMiembro.primeraAfectacionEn))

  return Response.json(
    {
      id: episodio.id,
      reglaVersion: episodio.reglaVersion,
      parametros: episodio.parametros,
      unidadTipo: episodio.unidadTipo,
      departamento: episodio.unidadId,
      inicioEn: episodio.inicioEn,
      finEn: episodio.finEn,
      estado: episodio.estado,
      escuelasAfectadas: episodio.escuelasAfectadas,
      calculadoEn: episodio.calculadoEn,
      miembros,
    },
    { status: 200, headers: { 'Cache-Control': 'private, no-store' } },
  )
}
