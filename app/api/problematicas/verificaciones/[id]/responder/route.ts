import { conAuditoria } from '@/lib/infraestructura/auditoria/servidor'
import { z } from 'zod'
import { responderPorEnlace } from '@/lib/infraestructura/verificaciones'
import {
  crearPostVerificacion,
  MENSAJES_CREDENCIAL,
} from '@/lib/infraestructura/verificacion-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 'con_afectacion' is intentionally excluded: it uses the part form and a
// separate endpoint to link the resulting movement.
const bodySchema = z.object({
  token: z.string().trim().min(1),
  resultado: z.enum(['sin_afectacion', 'no_disponible']),
})

const atenderPOST = crearPostVerificacion({
  bodySchema,
  mensajes: {
    ...MENSAJES_CREDENCIAL,
    respuesta_contradictoria: 'Ya se registró una respuesta distinta para esta solicitud.',
  },
  mensajeDefault: 'No se pudo registrar la respuesta.',
  ejecutar: (id, body) => responderPorEnlace({
    verificacionId: id,
    token: body.token,
    resultado: body.resultado,
    movimientoId: null,
  }),
})

export const POST = conAuditoria('verificacion.responder', '/api/problematicas/verificaciones/[id]/responder', atenderPOST)
