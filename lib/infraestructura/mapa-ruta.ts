import { ensureSeeded } from '@/lib/db/seed'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { jsonComprimido } from '@/lib/http/respuesta-comprimida'

export function crearGetMapaInfraestructura<T>(listar: () => Promise<T>) {
  return async (request: Request) => {
    // Mantener el seed antes del ACL: las rutas existentes dependen de ese orden.
    await ensureSeeded()

    const acceso = await verificarAccesoLectura()
    if (!acceso.ok) {
      const error = acceso.status === 401 ? 'No autenticado' : 'No tiene acceso a este recurso'
      return Response.json({ error }, { status: acceso.status })
    }

    const resultado = await listar()
    return jsonComprimido(request, resultado, {
      headers: { 'Cache-Control': 'private, no-cache' },
    })
  }
}
