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
export const POST = crearPostVerificacion({
  bodySchema,
  mensajes: MENSAJES_CREDENCIAL,
  mensajeDefault: 'No se pudo validar el enlace.',
  ejecutar: (id, body) => validarCredencial({ verificacionId: id, token: body.token }),
})
