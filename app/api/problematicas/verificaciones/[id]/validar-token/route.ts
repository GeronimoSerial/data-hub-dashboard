import { conAuditoria } from '@/lib/infraestructura/auditoria/servidor'
import { z } from 'zod'
import { validarCredencial } from '@/lib/infraestructura/verificaciones'
import {
  crearPostVerificacion,
  MENSAJES_CREDENCIAL,
} from '@/lib/infraestructura/verificacion-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({ token: z.string().trim().min(1) })

// Lectura sin sesión: validarCredencial no consume ni rota el token.
// POST carries the token in the body; a GET query would expose it in access logs.
const atenderPOST = crearPostVerificacion({
  bodySchema,
  mensajes: MENSAJES_CREDENCIAL,
  mensajeDefault: 'No se pudo validar el enlace.',
  ejecutar: (id, body) => validarCredencial({ verificacionId: id, token: body.token }),
})

export const POST = conAuditoria('verificacion.validar_token', '/api/problematicas/verificaciones/[id]/validar-token', atenderPOST)
