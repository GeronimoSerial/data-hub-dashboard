import { z } from 'zod'
import { getDb } from '@/lib/db'
import { ensureSeeded } from '@/lib/db/seed'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { jsonNoStore } from '@/lib/infraestructura/respuesta-no-store'
import { celdaAPoligono, obtenerGrillaObservada } from '@/lib/infraestructura/riesgo/peligro/observado-grilla'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const horasSchema = z.enum(['24', '72']).default('24')

// Acumulado de lluvia observada (NASA IMERG Early) por celda de 0.1° para toda
// la provincia, como FeatureCollection GeoJSON. Las celdas con cobertura
// insuficiente se devuelven con `parcial: true` y su suma tal cual.
export async function GET(request: Request) {
  await ensureSeeded()

  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)

  const { searchParams } = new URL(request.url)
  const parsed = horasSchema.safeParse(searchParams.get('horas') ?? undefined)
  if (!parsed.success) {
    return jsonNoStore({ error: 'horas inválido: use 24 o 72' }, 400)
  }
  const horas = Number(parsed.data) as 24 | 72

  const grilla = await obtenerGrillaObservada(getDb(), horas)
  const features = grilla.celdas.flatMap((celda) => {
    const geometry = celdaAPoligono(celda.geometryRef)
    if (!geometry) return []
    return [{ type: 'Feature' as const, geometry, properties: celda }]
  })

  return jsonNoStore({
    horas,
    desde: grilla.desde,
    hasta: grilla.hasta,
    fuente: 'NASA IMERG Early',
    geojson: { type: 'FeatureCollection' as const, features },
  })
}
