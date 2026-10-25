import { z } from 'zod'
import { responderPorEnlace } from '@/lib/infraestructura/verificaciones'
import {
  crearPostVerificacion,
  MENSAJES_CREDENCIAL,
} from '@/lib/infraestructura/verificacion-route'
import { crearLimitador } from '@/lib/http/limitador'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const limitador = crearLimitador({ ventanaMs: 60_000, max: 20 })

const bodySchema = z.object({
  token: z.string().trim().min(1),
  movimientoId: z.string().trim().min(1),
})

const handlePOST = crearPostVerificacion({
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

export const POST = ruta('problematicas.verificaciones.id.vincular-movimiento.post', handlePOST, { limite: { limitador } })
