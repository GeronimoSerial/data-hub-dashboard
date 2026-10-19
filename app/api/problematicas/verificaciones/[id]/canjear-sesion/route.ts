import { conAuditoria } from '@/lib/infraestructura/auditoria/servidor'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  validarCredencial,
  verificacionHabilitaSesionEscritura,
} from '@/lib/infraestructura/verificaciones'
import {
  crearSesionVerificacion,
  NOMBRE_COOKIE_SESION_VERIFICACION,
  opcionesCookieSesionVerificacion,
} from '@/lib/infraestructura/verificacion-sesion'
import {
  CACHE_HEADERS,
  crearPostVerificacion,
  MENSAJES_CREDENCIAL,
} from '@/lib/infraestructura/verificacion-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({ token: z.string().trim().min(1) })

// POST carries the token in its body, never in a GET URL or access log.
// no-store protects credential responses; no-referrer prevents outbound leakage.
const atenderPOST = crearPostVerificacion({
  bodySchema,
  mensajes: {
    ...MENSAJES_CREDENCIAL,
    solicitud_ya_respondida: 'Esta solicitud ya fue respondida.',
  },
  mensajeDefault: 'No se pudo validar el enlace.',
  ejecutar: async (id, body) => {
    const resultado = await validarCredencial({ verificacionId: id, token: body.token })
    if (!resultado.ok) return resultado
    // The credential itself remains valid; a completed request state warrants 409, not 403/410.
    if (!(await verificacionHabilitaSesionEscritura(id))) {
      return { ok: false, motivo: 'solicitud_ya_respondida', status: 409 }
    }
    return resultado
  },
  responderExito: (verificacion, id) => {
    // This read-only exchange does not consume the token; the cookie is scoped to this exact CUE.
    const { valorCookie, expiraEn } = crearSesionVerificacion(id, verificacion.cueAnexo)
    const respuesta = NextResponse.json(
      { ok: true, verificacion },
      { status: 200, headers: CACHE_HEADERS },
    )
    respuesta.cookies.set(
      NOMBRE_COOKIE_SESION_VERIFICACION,
      valorCookie,
      opcionesCookieSesionVerificacion(expiraEn),
    )
    return respuesta
  },
})

export const POST = conAuditoria('verificacion.canjear_sesion', '/api/problematicas/verificaciones/[id]/canjear-sesion', atenderPOST)
