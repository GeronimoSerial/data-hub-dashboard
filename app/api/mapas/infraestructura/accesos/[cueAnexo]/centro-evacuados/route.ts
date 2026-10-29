import { z } from 'zod'
import { ensureSeeded } from '@/lib/db/seed'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { obtenerCentroEvacuados } from '@/lib/infraestructura/evacuacion/respuesta'
import { jsonComprimido } from '@/lib/http/respuesta-comprimida'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ cueAnexo: string }> }

const cueAnexoSchema = z.string().min(1).max(50)

// GET de sólo lectura: centro de evacuados más cercano (apto hoy) para UN
// cueAnexo, con la ruta por camino precomputada cuando existe. Es una sugerencia
// calculada a diario, nunca un estado confirmado. La falta de dato es siempre
// 200 con `disponible: false`, nunca 404.
async function handleGET(request: Request, ctx: Ctx) {
  // ACL PRIMERO.
  const acceso = await verificarAccesoLectura({ section: 'infrastructure' })
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)

  await ensureSeeded()

  const { cueAnexo } = await ctx.params
  const parsed = cueAnexoSchema.safeParse(cueAnexo)
  if (!parsed.success) {
    return Response.json({ error: 'cueAnexo inválido' }, { status: 400 })
  }

  const data = await obtenerCentroEvacuados(parsed.data)
  return jsonComprimido(request, data, { headers: { 'Cache-Control': 'private, no-cache' } })
}

export const GET = ruta('mapas.infraestructura.accesos.cueAnexo.centroEvacuados.get', handleGET)
