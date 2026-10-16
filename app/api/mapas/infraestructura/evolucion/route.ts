import { z } from 'zod'
import { ensureSeeded } from '@/lib/db/seed'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { obtenerEvolucionMapa } from '@/lib/infraestructura/evolucion'
import { jsonComprimido } from '@/lib/http/respuesta-comprimida'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const parametrosSchema = z.object({
  departamentos: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
  niveles: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
  direcciones: z.array(z.coerce.number().int().positive()).max(100).optional(),
})

export async function GET(request: Request) {
  await ensureSeeded()

  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)

  const url = new URL(request.url)
  const validacion = parametrosSchema.safeParse({
    departamentos: url.searchParams.getAll('departamento'),
    niveles: url.searchParams.getAll('nivel'),
    direcciones: url.searchParams.getAll('direccion'),
  })
  if (!validacion.success) {
    return Response.json({ error: 'Parámetros inválidos' }, { status: 400 })
  }

  const { departamentos, niveles, direcciones } = validacion.data
  const hayFiltros =
    (departamentos?.length ?? 0) > 0 || (niveles?.length ?? 0) > 0 || (direcciones?.length ?? 0) > 0
  const resultado = hayFiltros
    ? await obtenerEvolucionMapa({
        ...(departamentos?.length ? { departamentos } : {}),
        ...(niveles?.length ? { niveles } : {}),
        ...(direcciones?.length ? { direcciones } : {}),
      })
    : await obtenerEvolucionMapa()

  return jsonComprimido(request, resultado, {
    headers: { 'Cache-Control': 'private, no-cache' },
  })
}
