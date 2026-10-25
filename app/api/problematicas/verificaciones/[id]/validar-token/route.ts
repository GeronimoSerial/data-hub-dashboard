import { z } from 'zod'
import { validarCredencial } from '@/lib/infraestructura/verificaciones'
import {
  crearPostVerificacion,
  MENSAJES_CREDENCIAL,
} from '@/lib/infraestructura/verificacion-route'
import { crearLimitador } from '@/lib/http/limitador'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const limitador = crearLimitador({ ventanaMs: 60_000, max: 20 })

const bodySchema = z.object({ token: z.string().trim().min(1) })

// Lectura sin sesión: validarCredencial no consume ni rota el token.
// POST carries the token in the body; a GET query would expose it in access logs.
const handlePOST = crearPostVerificacion({
  bodySchema,
  mensajes: MENSAJES_CREDENCIAL,
  mensajeDefault: 'No se pudo validar el enlace.',
  ejecutar: (id, body) => validarCredencial({ verificacionId: id, token: body.token }),
})

export const POST = ruta('problematicas.verificaciones.id.validar-token.post', handlePOST, { limite: { limitador } })
