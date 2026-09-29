import { z } from 'zod'
import { responderPorEnlace } from '@/lib/infraestructura/verificaciones'
import {
  crearPostVerificacion,
  MENSAJES_CREDENCIAL,
} from '@/lib/infraestructura/verificacion-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  token: z.string().trim().min(1),
  movimientoId: z.string().trim().min(1),
})

export const POST = crearPostVerificacion({
  bodySchema,
  mensajes: {
    ...MENSAJES_CREDENCIAL,
    respuesta_contradictoria: 'Ya se registró una respuesta distinta para esta solicitud.',
  },
  mensajeDefault: 'No se pudo registrar la respuesta.',
  // A mismatched CUE returns 409 'movimiento_cue_no_coincide' without writing.
  ejecutar: (id, body) => responderPorEnlace({
    verificacionId: id,
    token: body.token,
    resultado: 'con_afectacion',
    movimientoId: body.movimientoId,
  }),
})
