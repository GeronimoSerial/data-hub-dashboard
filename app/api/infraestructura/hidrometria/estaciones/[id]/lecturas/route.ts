import { getDb } from '@/lib/db'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { cargarReferencias } from '@/lib/infraestructura/datasets/repositorio'
import {
  consultarHistoriaEstacion,
  validarConsultaHistoriaEstacion,
} from '@/lib/infraestructura/hidrometria/lecturas-repo'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { jsonNoStore } from '@/lib/infraestructura/respuesta-no-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: Request, ctx: Ctx) {
  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)

  await cargarReferencias()

  const { id } = await ctx.params
  const { searchParams } = new URL(request.url)

  const validacion = validarConsultaHistoriaEstacion({
    estacionId: id,
    desde: searchParams.get('desde'),
    hasta: searchParams.get('hasta'),
    limite: searchParams.get('limite'),
  })

  if (!validacion.ok) {
    return jsonNoStore(
      { error: validacion.error, codigo: validacion.codigo },
      validacion.status,
    )
  }

  const respuesta = await consultarHistoriaEstacion(getDb(), {
    estacionId: validacion.estacion.estacionId,
    desde: validacion.desdeIso,
    hasta: validacion.hastaIso,
    limite: validacion.limite,
  })

  return jsonNoStore(respuesta)
}
