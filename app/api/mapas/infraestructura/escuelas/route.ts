import { listarEscuelasMapaEnriquecidas } from '@/lib/infraestructura/parte-mapa'
import { crearGetMapaInfraestructura } from '@/lib/infraestructura/mapa-ruta'
import { crearLimitador } from '@/lib/http/limitador'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const limitador = crearLimitador({ ventanaMs: 60_000, max: 300 })

export const GET = ruta(
  'mapas.infraestructura.escuelas.get',
  crearGetMapaInfraestructura((filtros) => listarEscuelasMapaEnriquecidas(filtros)),
  { limite: { limitador } },
)
