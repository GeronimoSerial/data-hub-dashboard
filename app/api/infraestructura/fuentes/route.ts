import { getDb } from '@/lib/db'
import { hazardSourceHealth } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  await ensureSeeded()

  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) {
    const error =
      acceso.status === 401 ? 'No autenticado' : 'No tiene acceso a este recurso'
    return Response.json({ error }, { status: acceso.status })
  }

  const filas = await getDb().select().from(hazardSourceHealth)

  // `frescuraMinutos` se deriva acá y no se persiste: es una función del reloj
  // en el momento de la lectura, no un atributo de la fuente.
  const fuentes = filas.map((f) => ({
    provider: f.provider,
    estado: f.estado,
    ultimoExitoEn: f.ultimoExitoEn,
    ultimoIntentoEn: f.ultimoIntentoEn,
    ultimoErrorSaneado: f.ultimoErrorSaneado,
    ttlMinutos: f.ttlMinutos,
    licencia: f.licencia,
    actualizadaEn: f.actualizadaEn,
    frescuraMinutos:
      f.ultimoExitoEn === null
        ? null
        : Math.round((Date.now() - new Date(f.ultimoExitoEn).getTime()) / 60000),
  }))

  return Response.json(
    { fuentes },
    { status: 200, headers: { 'Cache-Control': 'private, no-store' } },
  )
}
