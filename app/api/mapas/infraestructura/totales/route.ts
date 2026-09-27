import { ensureSeeded } from '@/lib/db/seed'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { esCategoria } from '@/lib/infraestructura/categorias'
import { obtenerTotalesMapa } from '@/lib/infraestructura/totales-mapa'
import type { EstadoServicioGeneral } from '@/lib/infraestructura/trayectoria-tipos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Mismo guard que el endpoint hermano (app/api/mapas/infraestructura/route.ts):
// `servicio` es derivado (spec §3.4, nunca persistido) y no hay función pública
// en el modelo de dominio para validarlo, así que sólo existen estos tres
// valores. Se replica en vez de exportarlo desde el otro route.
const SERVICIOS_VALIDOS: readonly EstadoServicioGeneral[] = ['normal', 'parcial', 'suspendido']

function servicioValido(valor: string | null): EstadoServicioGeneral | undefined {
  return valor !== null && (SERVICIOS_VALIDOS as readonly string[]).includes(valor)
    ? (valor as EstadoServicioGeneral)
    : undefined
}

export async function GET(request: Request) {
  await ensureSeeded()

  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) {
    const error =
      acceso.status === 401 ? 'No autenticado' : 'No tiene acceso a este recurso'
    return Response.json({ error }, { status: acceso.status })
  }

  const { searchParams } = new URL(request.url)
  const categoriaParam = searchParams.get('categoria')

  const filtros = {
    territorio: searchParams.get('territorio') ?? undefined,
    nivel: searchParams.get('nivel') ?? undefined,
    cueAnexo: searchParams.get('establecimiento') ?? undefined,
    motivo: searchParams.get('motivo') ?? undefined,
    severidad: searchParams.get('severidad') ?? undefined,
    categoria: categoriaParam !== null && esCategoria(categoriaParam) ? categoriaParam : undefined,
    servicio: servicioValido(searchParams.get('servicio')),
  }

  // obtenerTotalesMapa devuelve SÓLO conteos agregados (departamentos +
  // provincia): nunca datos nominales. El resultado se pasa tal cual, sin
  // agregar campos.
  const resultado = await obtenerTotalesMapa(filtros)

  return Response.json(resultado, {
    status: 200,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
