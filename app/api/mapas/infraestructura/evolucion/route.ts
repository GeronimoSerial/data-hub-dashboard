import { z } from 'zod'
import { ensureSeeded } from '@/lib/db/seed'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { obtenerEvolucionMapa } from '@/lib/infraestructura/evolucion'
import { jsonComprimido } from '@/lib/http/respuesta-comprimida'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const parametrosSchema = z.object({
  departamentos: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
  niveles: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
})

async function handleGET(request: Request) {
  await ensureSeeded()

  const acceso = await verificarAccesoLectura({ section: 'infrastructure' })
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)

  const url = new URL(request.url)
  const validacion = parametrosSchema.safeParse({
    departamentos: url.searchParams.getAll('departamento'),
    niveles: url.searchParams.getAll('nivel'),
  })
  if (!validacion.success) {
    return Response.json({ error: 'Parámetros inválidos' }, { status: 400 })
  }

  const { departamentos, niveles } = validacion.data
  const hayFiltros = (departamentos?.length ?? 0) > 0 || (niveles?.length ?? 0) > 0
  const resultado = hayFiltros
    ? await obtenerEvolucionMapa({
        ...(departamentos?.length ? { departamentos } : {}),
        ...(niveles?.length ? { niveles } : {}),
      })
    : await obtenerEvolucionMapa()

  return jsonComprimido(request, resultado, {
    headers: { 'Cache-Control': 'private, no-cache' },
  })
}

export const GET = ruta('mapas.infraestructura.evolucion.get', handleGET)
