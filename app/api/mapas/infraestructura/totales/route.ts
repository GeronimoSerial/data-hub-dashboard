import { obtenerTotalesMapa } from '@/lib/infraestructura/totales-mapa'
import { crearGetMapaInfraestructura } from '@/lib/infraestructura/mapa-ruta'
import { crearLimitador } from '@/lib/http/limitador'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const limitador = crearLimitador({ ventanaMs: 60_000, max: 300 })

export const GET = ruta(
  'mapas.infraestructura.totales.get',
  crearGetMapaInfraestructura((filtros) => obtenerTotalesMapa(filtros)),
  { limite: { limitador } },
)
