import { z } from 'zod'
import { ensureSeeded } from '@/lib/db/seed'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import {
  construirRespuestaExposicion,
  obtenerExposicionRuta,
} from '@/lib/infraestructura/exposicion-ruta'
import { jsonComprimido } from '@/lib/http/respuesta-comprimida'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ cueAnexo: string }> }
const cueAnexoSchema = z.string().min(1).max(50)

// GET de sólo lectura: indicador histórico/estático de inundación a lo largo
// de la ruta escolar. No es pronóstico ni estado del camino.
export async function GET(request: Request, ctx: Ctx) {
  const acceso = await verificarAccesoLectura({ section: 'infrastructure' })
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)

  await ensureSeeded()
  const { cueAnexo } = await ctx.params
  const parsed = cueAnexoSchema.safeParse(cueAnexo)
  if (!parsed.success) return Response.json({ error: 'cueAnexo inválido' }, { status: 400 })

  const fila = await obtenerExposicionRuta(parsed.data)
  return jsonComprimido(request, construirRespuestaExposicion(parsed.data, fila), {
    headers: { 'Cache-Control': 'private, no-cache' },
  })
}
