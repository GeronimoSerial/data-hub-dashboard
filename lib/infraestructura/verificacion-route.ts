import type { z } from 'zod'
import { respuestaAuditada } from './auditoria/servidor'
import { actorAuditoria, describirAuditoria } from './auditoria/contexto'
import { ensureSeeded } from '@/lib/db/seed'
import { getClientIp, ipExcedeLimite } from '@/lib/infraestructura/limites'
import type { VerificacionRow } from '@/lib/infraestructura/verificaciones'

// Never cache credential responses or let referrers forward a token-bearing URL.
export const CACHE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
}

// Public messages deliberately hide the technical reason from school staff.
export const MENSAJES_CREDENCIAL: Record<string, string> = {
  credencial_invalida: 'El enlace no es válido.',
  credencial_revocada: 'Este enlace fue revocado.',
  credencial_vencida: 'Este enlace venció.',
  solicitud_cancelada: 'Esta solicitud fue cancelada.',
  no_existe: 'La solicitud no existe.',
}

export type ResultadoEndpointVerificacion =
  | { ok: true; verificacion: VerificacionRow }
  | { ok: false; motivo: string; status: number }

type OpcionesPost<T> = {
  bodySchema: z.ZodType<T>
  mensajes: Record<string, string>
  mensajeDefault: string
  ejecutar: (id: string, body: T) => Promise<ResultadoEndpointVerificacion>
  responderExito?: (verificacion: Omit<VerificacionRow, 'tokenHash'>, id: string) => Response
}

export function sinTokenHash(verificacion: VerificacionRow): Omit<VerificacionRow, 'tokenHash'> {
  // The token hash is internal credential material and must never enter JSON: it is the
  // only secret that lets the link be redeemed. The plain token is returned only once, at creation.
  const { tokenHash: _tokenHash, ...resto } = verificacion
  return resto
}

export function crearPostVerificacion<T>(opciones: OpcionesPost<T>) {
  return async (request: Request, context: { params: Promise<{ id: string }> }) => {
    // Credential-bearing requests use POST so tokens stay out of URLs and access logs.
    await ensureSeeded()

    if (ipExcedeLimite(getClientIp(request))) {
      return Response.json(
        { error: 'Demasiadas solicitudes. Intente nuevamente más tarde.' },
        { status: 429, headers: CACHE_HEADERS },
      )
    }

    const { id } = await context.params
    describirAuditoria({ objetoTipo: 'verificacion', objetoId: id })
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Cuerpo inválido' }, { status: 400, headers: CACHE_HEADERS })
    }

    const parsed = opciones.bodySchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: 'Cuerpo inválido' }, { status: 400, headers: CACHE_HEADERS })
    }

    return respuestaAuditada(async () => {
      const resultado = await opciones.ejecutar(id, parsed.data)
      if (!resultado.ok) {
        return Response.json(
          { error: opciones.mensajes[resultado.motivo] ?? opciones.mensajeDefault },
          { status: resultado.status, headers: CACHE_HEADERS },
        )
      }

      const verificacion = sinTokenHash(resultado.verificacion)
      actorAuditoria({ actorTipo: 'enlace', actorId: verificacion.id, actorRol: null, viaAcceso: 'token_verificacion' })
      describirAuditoria({ cueAnexo: verificacion.cueAnexo,
        resultado: 'replay' in resultado && resultado.replay ? 'repetido' : 'exito',
        metadatos: { verificacionId: verificacion.id, movimientoId: verificacion.movimientoId } })
      return opciones.responderExito?.(verificacion, id) ?? Response.json(
        { ok: true, verificacion },
        { status: 200, headers: CACHE_HEADERS },
      )
    })
  }
}
