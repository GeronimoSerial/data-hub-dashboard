// GET /api/infraestructura/replay (batch E7b, decisión de N1 #2 del brief).
//
// De solo lectura, ACL staff (mismo recurso que el resto de /api/infraestructura,
// verificarAccesoLectura), sin datos nominales, Cache-Control: private, no-store.
// La validación de parámetros y el motor de consulta viven en
// lib/infraestructura/replay/{tipos,consulta}.ts; esta ruta sólo traduce
// query params <-> Response.
import { z } from 'zod'
import { ensureSeeded } from '@/lib/db/seed'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { jsonNoStore } from '@/lib/infraestructura/respuesta-no-store'
import { generarReplay } from '@/lib/infraestructura/replay/consulta'
import { PASO_REPLAY_HORAS_DEFAULT, vistaReplaySchema } from '@/lib/infraestructura/replay/tipos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const queryReplaySchema = z.object({
  territorioTipo: z.literal('departamento').default('departamento'),
  territorioId: z.string().min(1).optional(),
  desde: z.iso.datetime({ offset: false }).optional(),
  hasta: z.iso.datetime({ offset: false }).optional(),
  paso: z.coerce.number().int().positive().default(PASO_REPLAY_HORAS_DEFAULT),
  vista: vistaReplaySchema,
  episodioDerivadoId: z.string().min(1).optional(),
})

export async function GET(request: Request) {
  // ACL primero: una request sin sesión no debe disparar trabajo de DB
  // (ensureSeeded, luego el motor de replay) antes de fallar.
  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)

  await ensureSeeded()

  const { searchParams } = new URL(request.url)
  const parsed = queryReplaySchema.safeParse({
    territorioTipo: searchParams.get('territorioTipo') ?? undefined,
    territorioId: searchParams.get('territorioId') ?? undefined,
    desde: searchParams.get('desde') ?? undefined,
    hasta: searchParams.get('hasta') ?? undefined,
    paso: searchParams.get('paso') ?? undefined,
    vista: searchParams.get('vista') ?? undefined,
    episodioDerivadoId: searchParams.get('episodioDerivadoId') ?? undefined,
  })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return Response.json({ error: `Parámetro inválido: ${issue.path.join('.') || issue.message}` }, { status: 400 })
  }

  try {
    const resultado = await generarReplay(parsed.data)
    return jsonNoStore(resultado)
  } catch (error) {
    // generarReplay lanza Error con mensaje ya saneado (episodio no
    // encontrado, falta desde/hasta): 404 para el primer caso, 400 para el
    // resto. No hay datos sensibles en el mensaje (ver lib/infraestructura/replay/consulta.ts).
    const mensaje = error instanceof Error ? error.message : 'Error al generar el replay'
    const status = mensaje.includes('no encontrado') ? 404 : 400
    return Response.json({ error: mensaje }, { status })
  }
}
