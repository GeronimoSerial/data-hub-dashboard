import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import { infraGeoProfile, infraGeoRio } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { jsonError } from '@/lib/infraestructura/respuesta-error'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Next.js 16 App Router: el segundo argumento de un route handler dinámico es
// una promesa de params (misma firma que app/api/usuarios/[id]/route.ts).
type Ctx = { params: Promise<{ cueAnexo: string }> }

const cueAnexoSchema = z.string().min(1).max(50)

async function handleGET(_request: Request, ctx: Ctx) {
  await ensureSeeded()

  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)

  const { cueAnexo } = await ctx.params
  const parsed = cueAnexoSchema.safeParse(cueAnexo)
  if (!parsed.success) {
    return Response.json({ error: 'cueAnexo inválido' }, { status: 400 })
  }

  const db = getDb()

  const [perfil] = await db
    .select()
    .from(infraGeoProfile)
    .where(eq(infraGeoProfile.cueAnexo, parsed.data))
    .limit(1)

  // El 100% del padrón debería tener fila (con perfil válido o con
  // motivoExclusion), así que "no hay fila" es una anomalía, no "sin cobertura".
  if (!perfil) {
    return jsonError('Sin perfil geográfico para ese CUE-anexo', 404)
  }

  const [rio] = await db
    .select({
      puntoRioId: infraGeoRio.puntoRioId,
      distanciaKm: infraGeoRio.distanciaKm,
    })
    .from(infraGeoRio)
    .where(eq(infraGeoRio.cueAnexo, parsed.data))
    .limit(1)

  // `infraGeoRio` la llena el job `calcularAsociacionesRio`. Si todavía no
  // corrió no hay fila y `rioAsociacion: null` significa "aún no calculado",
  // no un error: el perfil SÍ existe y la respuesta sigue siendo 200.
  const rioAsociacion = rio
    ? { puntoRioId: rio.puntoRioId, distanciaKm: rio.distanciaKm }
    : null

  return Response.json(
    { ...perfil, rioAsociacion },
    {
      status: 200,
      headers: { 'Cache-Control': 'private, no-store' },
    },
  )
}

export const GET = ruta('infraestructura.geo-perfiles.cueAnexo.get', handleGET)
