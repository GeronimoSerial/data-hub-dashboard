import { ensureSeeded } from '@/lib/db/seed'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { esCategoria } from '@/lib/infraestructura/categorias'
import type { FiltrosMapa } from '@/lib/infraestructura/parte-mapa'
import type { EstadoServicioGeneral } from '@/lib/infraestructura/trayectoria-tipos'
import { jsonComprimido } from '@/lib/http/respuesta-comprimida'

const SERVICIOS_VALIDOS: readonly EstadoServicioGeneral[] = ['normal', 'parcial', 'suspendido']

function servicioValido(valor: string | null): EstadoServicioGeneral | undefined {
  return valor !== null && (SERVICIOS_VALIDOS as readonly string[]).includes(valor)
    ? (valor as EstadoServicioGeneral)
    : undefined
}

function leerFiltros(searchParams: URLSearchParams): FiltrosMapa {
  const categoria = searchParams.get('categoria')
  return {
    territorio: searchParams.get('territorio') ?? undefined,
    nivel: searchParams.get('nivel') ?? undefined,
    cueAnexo: searchParams.get('establecimiento') ?? undefined,
    motivo: searchParams.get('motivo') ?? undefined,
    severidad: searchParams.get('severidad') ?? undefined,
    categoria: categoria !== null && esCategoria(categoria) ? categoria : undefined,
    servicio: servicioValido(searchParams.get('servicio')),
  }
}

export function crearGetMapaInfraestructura<T>(listar: (filtros: FiltrosMapa) => Promise<T>) {
  return async (request: Request) => {
    // Mantener el seed antes del ACL: las rutas existentes dependen de ese orden.
    await ensureSeeded()

    const acceso = await verificarAccesoLectura()
    if (!acceso.ok) {
      const error = acceso.status === 401 ? 'No autenticado' : 'No tiene acceso a este recurso'
      return Response.json({ error }, { status: acceso.status })
    }

    const filtros = leerFiltros(new URL(request.url).searchParams)
    const resultado = await listar(filtros)
    return jsonComprimido(request, resultado, {
      headers: { 'Cache-Control': 'private, no-cache' },
    })
  }
}
