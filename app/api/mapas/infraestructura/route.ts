import { getDb } from '@/lib/db'
import { ensureSeeded } from '@/lib/db/seed'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { listarAlertasActivas } from '@/lib/infraestructura/consulta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  await ensureSeeded()

  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) {
    const error =
      acceso.status === 401 ? 'No autenticado' : 'No tiene acceso a este recurso'
    return Response.json({ error }, { status: acceso.status })
  }

  const { searchParams } = new URL(request.url)
  const filtros = {
    territorio: searchParams.get('territorio') ?? undefined,
    nivel: searchParams.get('nivel') ?? undefined,
    cueAnexo: searchParams.get('establecimiento') ?? undefined,
    motivo: searchParams.get('motivo') ?? undefined,
    severidad: searchParams.get('severidad') ?? undefined,
  }

  const db = getDb()
  const client = db.$client
  const resultado = await listarAlertasActivas(client, filtros)

  return Response.json(resultado, {
    status: 200,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
