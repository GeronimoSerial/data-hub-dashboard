import { crearLimitador } from '@/lib/http/limitador'
import { ruta } from '@/lib/http/ruta'
import { hubApiAccessResponse, serverHubPathAllowedByExistingAcl } from '@/lib/hub-entry-server'
import { getSessionUser } from '@/lib/session'
import type { DatasetV29 } from '@/lib/reorganizacion/tipos'
import datosV29 from '@/lib/reorganizacion/data/v29.json'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Contiene importes salariales por establecimiento: nunca debe servirse desde public/.
const RECURSO = '/mapas/reorganizacion'
const CABECERAS = { 'Cache-Control': 'private, no-store' }
const DATASET = datosV29 as DatasetV29

const limitador = crearLimitador({ ventanaMs: 60_000, max: 30 })

function error(status: number, codigo: string) {
  return Response.json({ error: codigo }, { status, headers: CABECERAS })
}

export const GET = ruta(
  'mapas.reorganizacion.datos.get',
  async () => {
    const user = await getSessionUser()
    if (!user) return error(401, 'No autenticado')
    const denegado = await hubApiAccessResponse(user, RECURSO)
    if (denegado) return denegado
    if (!(await serverHubPathAllowedByExistingAcl(user, RECURSO))) {
      return error(403, 'No tiene acceso a este recurso')
    }

    return Response.json(DATASET, { headers: CABECERAS })
  },
  { limite: { limitador } },
)
