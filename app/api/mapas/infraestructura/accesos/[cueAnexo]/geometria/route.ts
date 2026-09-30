import { z } from 'zod'
import { ensureSeeded } from '@/lib/db/seed'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import {
  construirRespuestaGeometria,
  obtenerGeometriaAcceso,
} from '@/lib/infraestructura/territorio-mapa'
import { jsonComprimido } from '@/lib/http/respuesta-comprimida'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Next.js 16 App Router: el segundo argumento de un route handler dinámico es
// una promesa de params.
type Ctx = { params: Promise<{ cueAnexo: string }> }

const cueAnexoSchema = z.string().min(1).max(50)

// GET de sólo lectura: geometría OSM (ruta + cruces clasificados) usada por el
// cálculo de aislamiento de UN cueAnexo. Es contexto derivado de OpenStreetMap,
// NUNCA un pronóstico. La falta de geometría es falta de cobertura: siempre
// 200, nunca 404.
export async function GET(request: Request, ctx: Ctx) {
  // ACL PRIMERO.
  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)

  await ensureSeeded()

  const { cueAnexo } = await ctx.params
  const parsed = cueAnexoSchema.safeParse(cueAnexo)
  if (!parsed.success) {
    return Response.json({ error: 'cueAnexo inválido' }, { status: 400 })
  }

  const fila = await obtenerGeometriaAcceso(parsed.data)
  const data = construirRespuestaGeometria(parsed.data, fila)

  return jsonComprimido(request, data, {
    headers: { 'Cache-Control': 'private, no-cache' },
  })
}
