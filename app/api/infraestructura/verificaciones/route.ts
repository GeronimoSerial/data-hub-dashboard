import { z } from 'zod'
import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser, staffGuard } from '@/lib/session'
import { jsonError } from '@/lib/infraestructura/respuesta-error'
import { jsonNoStore } from '@/lib/infraestructura/respuesta-no-store'
import { respuestaGuard } from '@/lib/infraestructura/respuesta-guard'
import { sinTokenHash } from '@/lib/infraestructura/verificacion-route'
import {
  crearVerificacion,
  listarVerificaciones,
} from '@/lib/infraestructura/verificaciones'
import { cambioAuditado, conAuditoria } from '@/lib/infraestructura/auditoria/servidor'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Gestión de verificaciones del batch E1: SOLO staff (admin/editor). No es una
// acción del director: el director responde por el enlace público, no por acá.
const ESTADOS = ['pendiente', 'respondida', 'cancelada'] as const

const crearVerificacionInputSchema = z.object({
  cueAnexo: z.string().trim().min(1),
  // Mismo criterio UTC estricto que tiempoUtcSchema (riesgo/tipos.ts):
  // offset:false exige la marca 'Z' y rechaza strings sin zona.
  vencimientoEn: z.iso.datetime({ offset: false }).optional(),
})

const NO_STORE = { 'Cache-Control': 'private, no-store' }

async function handleGET(request: Request) {
  await ensureSeeded()
  const user = await getSessionUser()
  const guard = staffGuard(user)
  if (guard) return respuestaGuard(guard)

  const params = new URL(request.url).searchParams
  const periodoId = params.get('periodoId')?.trim() || undefined
  const cueAnexo = params.get('cueAnexo')?.trim() || undefined
  const estadoRaw = params.get('estado')?.trim() || undefined
  if (estadoRaw && !ESTADOS.includes(estadoRaw as (typeof ESTADOS)[number])) {
    return Response.json({ error: 'Estado inválido' }, { status: 400, headers: NO_STORE })
  }
  const estado = estadoRaw as (typeof ESTADOS)[number] | undefined

  const verificaciones = await listarVerificaciones({ periodoId, cueAnexo, estado })
  return jsonNoStore({ ok: true, verificaciones })
}

async function handlePOST(request: Request) {
  await ensureSeeded()
  const user = await getSessionUser()
  const guard = staffGuard(user)
  if (guard) return respuestaGuard(guard)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400, headers: NO_STORE })
  }

  const parsed = crearVerificacionInputSchema.safeParse(body)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Cuerpo inválido', 400, NO_STORE)
  }

  const resultado = await cambioAuditado(
    () => crearVerificacion({
      cueAnexo: parsed.data.cueAnexo,
      solicitadaPorUserId: user!.id,
      vencimientoEn: parsed.data.vencimientoEn ?? null,
    }),
    valor => valor.ok
      ? {
        status: 201,
        objetoTipo: 'verificacion',
        objetoId: valor.verificacion.id,
        cueAnexo: parsed.data.cueAnexo,
        metadatos: { verificacionId: valor.verificacion.id },
      }
      : { status: valor.status, objetoTipo: 'verificacion', cueAnexo: parsed.data.cueAnexo },
  )

  if (!resultado.ok) {
    return jsonError('No hay un período vigente', resultado.status, NO_STORE)
  }

  // El token en claro viaja SOLO en esta respuesta: quien llama arma el enlace
  // público (origin + /problematicas/verificaciones/{id}?token=...). La ruta no
  // compone la URL completa, sólo devuelve el token crudo.
  return jsonNoStore(
    { ok: true, verificacion: sinTokenHash(resultado.verificacion), token: resultado.token },
    201,
  )
}

export const GET = ruta('infraestructura.verificaciones.get', handleGET)
export const POST = conAuditoria('verificacion.crear', '/api/infraestructura/verificaciones', ruta('infraestructura.verificaciones.post', handlePOST))
