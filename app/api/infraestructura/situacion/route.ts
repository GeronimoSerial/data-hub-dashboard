import { z } from 'zod'
import { ensureSeeded } from '@/lib/db/seed'
import { staffGuard } from '@/lib/session'
import { obtenerEstadoSituacion } from '@/lib/infraestructura/riesgo/situacion/consulta'
import { obtenerEstadoDatosSeguro } from '@/lib/infraestructura/riesgo/estado-datos/consulta'
import { jsonError } from '@/lib/infraestructura/respuesta-error'
import { respuestaGuard } from '@/lib/infraestructura/respuesta-guard'
import { verificarAccesoSeccion } from '@/lib/infraestructura/acceso-lectura'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'

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
  const acceso = await verificarAccesoSeccion('situation')
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)
  const guard = staffGuard(acceso.user)
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
    return jsonError('territorioId requiere territorioTipo', 400)
  }

  const [estado, estadoDatos] = await Promise.all([
    obtenerEstadoSituacion({ territorioTipo, territorioId }),
    obtenerEstadoDatosSeguro(),
  ])

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
      estadoDatos,
    },
    { status: 200, headers: { 'Cache-Control': 'private, no-store' } },
  )
}
