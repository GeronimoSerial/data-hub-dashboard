import { ensureSeeded } from '@/lib/db/seed'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { esCategoria } from '@/lib/infraestructura/categorias'
import { listarPartesVigentes } from '@/lib/infraestructura/parte-mapa'
import type { EstadoServicioGeneral } from '@/lib/infraestructura/trayectoria-tipos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// `servicio` es derivado (spec §3.4, nunca persistido), así que el filtro de
// query string necesita su propio guard en vez de esCategoria: no hay una
// función pública en el modelo de dominio para validarlo, y sólo son estos
// tres valores.
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

  // listarPartesVigentes resuelve su propio Client (getDb().$client interno)
  // en vez de recibirlo por parámetro.
  const resultado = await listarPartesVigentes(filtros)

  return Response.json(resultado, {
    status: 200,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
