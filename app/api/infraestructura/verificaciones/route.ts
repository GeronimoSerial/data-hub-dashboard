import { z } from 'zod'
import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser, staffGuard } from '@/lib/session'
import {
  crearVerificacion,
  listarVerificaciones,
  type VerificacionRow,
} from '@/lib/infraestructura/verificaciones'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Gestión de verificaciones del batch E1: SOLO staff (admin/editor). No es una
// acción del director: el director responde por el enlace público, no por acá.
const ESTADOS = ['pendiente', 'respondida', 'cancelada'] as const

const crearVerificacionInputSchema = z.object({
  episodioId: z.string().trim().min(1),
  cueAnexo: z.string().trim().min(1),
  // Mismo criterio UTC estricto que tiempoUtcSchema (riesgo/tipos.ts):
  // offset:false exige la marca 'Z' y rechaza strings sin zona.
  vencimientoEn: z.iso.datetime({ offset: false }).optional(),
})

// tokenHash NUNCA viaja al cliente: es el único secreto que permite canjear el
// enlace. El token en claro sólo se devuelve una vez, al crear.
function sinTokenHash(v: VerificacionRow): Omit<VerificacionRow, 'tokenHash'> {
  const { tokenHash: _tokenHash, ...resto } = v
  return resto
}

const NO_STORE = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request) {
  await ensureSeeded()
  const user = await getSessionUser()
  const guard = staffGuard(user)
  if (guard) {
    return Response.json({ error: guard.error }, { status: guard.status, headers: NO_STORE })
  }

  const params = new URL(request.url).searchParams
  const episodioId = params.get('episodioId')?.trim() || undefined
  const cueAnexo = params.get('cueAnexo')?.trim() || undefined
  const estadoRaw = params.get('estado')?.trim() || undefined
  if (estadoRaw && !ESTADOS.includes(estadoRaw as (typeof ESTADOS)[number])) {
    return Response.json({ error: 'Estado inválido' }, { status: 400, headers: NO_STORE })
  }
  const estado = estadoRaw as (typeof ESTADOS)[number] | undefined

  const verificaciones = await listarVerificaciones({ episodioId, cueAnexo, estado })
  return Response.json(
    { ok: true, verificaciones: verificaciones.map(sinTokenHash) },
    { status: 200, headers: NO_STORE },
  )
}

export async function POST(request: Request) {
  await ensureSeeded()
  const user = await getSessionUser()
  const guard = staffGuard(user)
  if (guard) {
    return Response.json({ error: guard.error }, { status: guard.status, headers: NO_STORE })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400, headers: NO_STORE })
  }

  const parsed = crearVerificacionInputSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? 'Cuerpo inválido' },
      { status: 400, headers: NO_STORE },
    )
  }

  const resultado = await crearVerificacion({
    episodioId: parsed.data.episodioId,
    cueAnexo: parsed.data.cueAnexo,
    solicitadaPorUserId: user!.id,
    vencimientoEn: parsed.data.vencimientoEn ?? null,
  })

  if (!resultado.ok) {
    const [status, error] =
      resultado.motivo === 'episodio_no_existe'
        ? [404, 'El episodio no existe']
        : [409, 'El episodio está cerrado']
    return Response.json({ error }, { status, headers: NO_STORE })
  }

  // El token en claro viaja SOLO en esta respuesta: quien llama arma el enlace
  // público (origin + /problematicas/verificaciones/{id}?token=...). La ruta no
  // compone la URL completa, sólo devuelve el token crudo.
  return Response.json(
    { ok: true, verificacion: sinTokenHash(resultado.verificacion), token: resultado.token },
    { status: 201, headers: NO_STORE },
  )
}
