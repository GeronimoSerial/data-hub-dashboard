import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import { hazardClimatology, hazardForecast } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Validación deliberadamente laxa: `geometryRef` es la celda de grilla de 0.1°
// ("lat_lon") para variables atmosféricas, pero también el id de un punto de
// río para caudal. Un regex numérico estricto rechazaría ids de río válidos;
// sólo se acota presencia y longitud.
const geometryRefSchema = z.string().min(1).max(50).optional()

export async function GET(request: Request) {
  await ensureSeeded()

  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) {
    const error =
      acceso.status === 401 ? 'No autenticado' : 'No tiene acceso a este recurso'
    return Response.json({ error }, { status: acceso.status })
  }

  const { searchParams } = new URL(request.url)
  const parsed = geometryRefSchema.safeParse(
    searchParams.get('geometryRef') ?? undefined,
  )
  if (!parsed.success) {
    return Response.json({ error: 'geometryRef inválido' }, { status: 400 })
  }
  const geometryRef = parsed.data

  const db = getDb()
  const forecastBase = db.select().from(hazardForecast)
  const forecastRows =
    geometryRef === undefined
      ? await forecastBase.orderBy(asc(hazardForecast.validoEn))
      : await forecastBase
          .where(eq(hazardForecast.geometryRef, geometryRef))
          .orderBy(asc(hazardForecast.validoEn))

  const climBase = db.select().from(hazardClimatology)
  const climRows =
    geometryRef === undefined
      ? await climBase
      : await climBase.where(eq(hazardClimatology.geometryRef, geometryRef))

  const pronostico = forecastRows.map((r) => ({
    geometryRef: r.geometryRef,
    provider: r.provider,
    variable: r.variable,
    corridaEn: r.corridaEn,
    validoEn: r.validoEn,
    horizonteHoras: r.horizonteHoras,
    valor: r.valor,
    unidad: r.unidad,
    pasoHoras: r.pasoHoras,
  }))

  const climatologia = climRows.map((r) => ({
    geometryRef: r.geometryRef,
    variable: r.variable,
    percentil: r.percentil,
    muestra: r.muestra,
    valor: r.valor,
    unidad: r.unidad,
    periodoDesde: r.periodoDesde,
    periodoHasta: r.periodoHasta,
  }))

  return Response.json(
    { pronostico, climatologia },
    { status: 200, headers: { 'Cache-Control': 'private, no-store' } },
  )
}
