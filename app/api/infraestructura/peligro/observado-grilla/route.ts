import { z } from 'zod'
import { getDb } from '@/lib/db'
import { ensureSeeded } from '@/lib/db/seed'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { jsonNoStore } from '@/lib/infraestructura/respuesta-no-store'
import { celdaAPoligono, obtenerGrillaObservada } from '@/lib/infraestructura/riesgo/peligro/observado-grilla'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const horasSchema = z.enum(['24', '72']).default('24')

// IMERG Early tiene ~4 h de latencia y el job corre cada hora: una observación
// con más de 6 h de antigüedad se marca como vencida para que la UI lo indique.
const EDAD_MAXIMA_OBSERVACION_HORAS = 6
const MS_POR_HORA = 60 * 60 * 1000

// Acumulado de lluvia observada (NASA IMERG Early) por celda de 0.1° para toda
// la provincia, como FeatureCollection GeoJSON. Las celdas con cobertura
// insuficiente se devuelven con `parcial: true` y su suma tal cual.
async function handleGET(request: Request) {
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

  const hastaMs = grilla.hasta === null ? NaN : Date.parse(grilla.hasta)
  const edadHoras =
    grilla.hasta === null || Number.isNaN(hastaMs)
      ? null
      : Math.round(((Date.now() - hastaMs) / MS_POR_HORA) * 10) / 10
  const vencida = edadHoras === null || edadHoras > EDAD_MAXIMA_OBSERVACION_HORAS

  return jsonNoStore({
    horas,
    desde: grilla.desde,
    hasta: grilla.hasta,
    vencida,
    edadHoras,
    fuente: 'NASA IMERG Early',
    geojson: { type: 'FeatureCollection' as const, features },
  })
}

export const GET = ruta('infraestructura.peligro.observado-grilla.get', handleGET)
