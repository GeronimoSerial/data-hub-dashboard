import { z } from 'zod'
import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser, staffGuard } from '@/lib/session'
import { obtenerEstadoSituacion } from '@/lib/infraestructura/riesgo/situacion/consulta'
import { respuestaGuard } from '@/lib/infraestructura/respuesta-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Sólo staff (admin/editor): el Centro de Situación es un panel ejecutivo
// interno, mismo criterio de acceso que /admin/operacion y /admin/riesgo, NO
// la audiencia configurable por recurso que usa /mapas/infraestructura.
const filtrosSchema = z.object({
  territorioTipo: z.literal('departamento').optional(),
  territorioId: z.string().min(1).optional(),
})

export async function GET(request: Request) {
  const user = await getSessionUser()
  const guard = staffGuard(user)
  if (guard) return respuestaGuard(guard)

  await ensureSeeded()

  const { searchParams } = new URL(request.url)
  const parsed = filtrosSchema.safeParse({
    territorioTipo: searchParams.get('territorioTipo') ?? undefined,
    territorioId: searchParams.get('territorioId') ?? undefined,
  })
  if (!parsed.success) {
    return Response.json({ error: 'Parámetro inválido' }, { status: 400 })
  }
  const { territorioTipo, territorioId } = parsed.data
  if (territorioId && !territorioTipo) {
    return Response.json(
      { error: 'territorioId requiere territorioTipo' },
      { status: 400 },
    )
  }

  const estado = await obtenerEstadoSituacion({ territorioTipo, territorioId })

  return Response.json(
    {
      corte: estado.corte
        ? {
            id: estado.corte.id,
            generadoEn: estado.corte.generadoEn,
            kpis: estado.corte.kpis,
            conteosPorNivelRiesgo: estado.corte.conteosPorNivelRiesgo,
            fuentesSalud: estado.corte.fuentesSalud,
            episodiosAbiertos: estado.corte.episodiosAbiertos,
            episodiosCerradosDesdeAnterior: estado.corte.episodiosCerradosDesdeAnterior,
          }
        : null,
      briefing: estado.briefing,
      atraso: estado.atraso,
      prioridades: estado.prioridades,
    },
    { status: 200, headers: { 'Cache-Control': 'private, no-store' } },
  )
}
