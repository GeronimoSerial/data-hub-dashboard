import { ensureSeeded } from '@/lib/db/seed'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { jsonComprimido } from '@/lib/http/respuesta-comprimida'
import { alcanceMapa, filtrosDeAlcance } from '@/lib/infraestructura/alcance-mapa'
import type { FiltrosMapa } from '@/lib/infraestructura/parte-mapa'

// `listar` recibe el alcance del usuario (nivel jurisdiccional) ya resuelto:
// el filtro se aplica en la consulta, no en la UI.
export function crearGetMapaInfraestructura<T>(listar: (filtros: FiltrosMapa) => Promise<T>) {
  return async (request: Request) => {
    // Mantener el seed antes del ACL: las rutas existentes dependen de ese orden.
    await ensureSeeded()

    const acceso = await verificarAccesoLectura({ section: 'infrastructure' })
    if (!acceso.ok) {
      const error = acceso.status === 401 ? 'No autenticado' : 'No tiene acceso a este recurso'
      return Response.json({ error }, { status: acceso.status, headers: { 'Cache-Control': 'private, no-store' } })
    }

    const alcance = alcanceMapa(acceso.user)
    if (alcance.tipo === 'ninguno') {
      return Response.json({ error: 'No tiene acceso a este recurso' }, { status: 403, headers: { 'Cache-Control': 'private, no-store' } })
    }

    const resultado = await listar(filtrosDeAlcance(alcance))
    return jsonComprimido(request, resultado, {
      headers: { 'Cache-Control': 'private, no-cache' },
    })
  }
}
