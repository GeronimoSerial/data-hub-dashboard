import { obtenerTotalesMapa } from '@/lib/infraestructura/totales-mapa'
import { crearGetMapaInfraestructura } from '@/lib/infraestructura/mapa-ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = crearGetMapaInfraestructura(obtenerTotalesMapa)
