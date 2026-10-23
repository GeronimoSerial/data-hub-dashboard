import { and, asc, desc, eq, inArray, lte, max, min, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import {
  hazardClimatology,
  hazardForecast,
  hazardObservation,
} from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { jsonNoStore } from '@/lib/infraestructura/respuesta-no-store'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { obtenerAcumuladosObservados } from '@/lib/infraestructura/riesgo/peligro/observado'
import {
  obtenerNivelCaudal,
  obtenerNivelesPeligro,
} from '@/lib/infraestructura/riesgo/peligro/nivel'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Validación deliberadamente laxa: `geometryRef` es la celda de grilla de 0.1°
// ("lat_lon") para variables atmosféricas, pero también el id de un punto de
// río para caudal. Un regex numérico estricto rechazaría ids de río válidos;
// sólo se acota presencia y longitud.
const geometryRefSchema = z.string().min(1).max(50).optional()

export async function GET(request: Request) {
  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)

  await ensureSeeded()

  const { searchParams } = new URL(request.url)
  const parsed = geometryRefSchema.safeParse(
    searchParams.get('geometryRef') ?? undefined,
  )
  if (!parsed.success) {
    return Response.json({ error: 'geometryRef inválido' }, { status: 400 })
  }
  const geometryRef = parsed.data

  const parsedPunto = geometryRefSchema.safeParse(
    searchParams.get('puntoRioId') ?? undefined,
  )
  if (!parsedPunto.success) {
    return Response.json({ error: 'puntoRioId inválido' }, { status: 400 })
  }
  const puntoRioId = parsedPunto.data

  const db = getDb()
  const ahoraIso = new Date().toISOString()
  const forecastConditions = [lte(hazardForecast.corridaEn, ahoraIso)]
  if (geometryRef !== undefined) {
    forecastConditions.push(eq(hazardForecast.geometryRef, geometryRef))
  }
  // Keep every valid horizon from the newest eligible run for each cell,
  // variable and provider. In particular, don't limit forecast steps: consumers
  // sum the returned array to calculate accumulated precipitation.
  const latestForecastRuns = db
    .select({
      provider: hazardForecast.provider,
      variable: hazardForecast.variable,
      geometryRef: hazardForecast.geometryRef,
      corridaEn: max(hazardForecast.corridaEn).as('ultima_corrida_en'),
    })
    .from(hazardForecast)
    .where(and(...forecastConditions))
    .groupBy(hazardForecast.provider, hazardForecast.variable, hazardForecast.geometryRef)
    .as('latest_forecast_runs')

  const forecastRows = await db
    .select({
      geometryRef: hazardForecast.geometryRef,
      provider: hazardForecast.provider,
      variable: hazardForecast.variable,
      corridaEn: hazardForecast.corridaEn,
      validoEn: hazardForecast.validoEn,
      horizonteHoras: hazardForecast.horizonteHoras,
      valor: hazardForecast.valor,
      unidad: hazardForecast.unidad,
      pasoHoras: hazardForecast.pasoHoras,
    })
    .from(hazardForecast)
    .innerJoin(
      latestForecastRuns,
      and(
        eq(hazardForecast.provider, latestForecastRuns.provider),
        eq(hazardForecast.variable, latestForecastRuns.variable),
        eq(hazardForecast.geometryRef, latestForecastRuns.geometryRef),
        eq(hazardForecast.corridaEn, latestForecastRuns.corridaEn),
      ),
    )
    .orderBy(asc(hazardForecast.validoEn))

  // A usable reference is a complete p90/p95/p99 set from one cell, variable,
  // sample, period, version and calculation. Keep samples as independent groups:
  // the climatology calculation intentionally emits both daily samples, and the
  // response contract exposes `muestra` so consumers can choose deliberately.
  // Prefer complete IMERG precipitation within each sample, then the most recent
  // complete reference, without loading every historical version.
  const completeClimatologyGroups = db
    .select({
      geometryRef: hazardClimatology.geometryRef,
      variable: hazardClimatology.variable,
      muestra: hazardClimatology.muestra,
      periodoDesde: hazardClimatology.periodoDesde,
      periodoHasta: hazardClimatology.periodoHasta,
      version: hazardClimatology.version,
      calculadoEn: hazardClimatology.calculadoEn,
      id: min(hazardClimatology.id).as('id_tie_breaker'),
      ranking: sql<number>`row_number() over (
        partition by ${hazardClimatology.geometryRef}, ${hazardClimatology.variable}, ${hazardClimatology.muestra}
        order by
          case when ${hazardClimatology.variable} = 'precipitacion'
            and ${hazardClimatology.version} like 'climatologia-imerg%' then 1 else 0 end desc,
          ${hazardClimatology.periodoHasta} desc,
          ${hazardClimatology.version} desc,
          ${hazardClimatology.calculadoEn} desc,
          ${hazardClimatology.periodoDesde} desc,
          ${min(hazardClimatology.id)} asc
      )`.as('ranking'),
    })
    .from(hazardClimatology)
    .where(inArray(hazardClimatology.percentil, ['p90', 'p95', 'p99']))
    .groupBy(
      hazardClimatology.geometryRef,
      hazardClimatology.variable,
      hazardClimatology.muestra,
      hazardClimatology.periodoDesde,
      hazardClimatology.periodoHasta,
      hazardClimatology.version,
      hazardClimatology.calculadoEn,
    )
    .having(sql`count(distinct ${hazardClimatology.percentil}) = 3`)
    .as('complete_climatology_groups')

  const climatologyConditions = [eq(completeClimatologyGroups.ranking, 1)]
  if (geometryRef !== undefined) {
    climatologyConditions.push(eq(hazardClimatology.geometryRef, geometryRef))
  }
  const climRows = await db
    .select({
      geometryRef: hazardClimatology.geometryRef,
      variable: hazardClimatology.variable,
      percentil: hazardClimatology.percentil,
      muestra: hazardClimatology.muestra,
      id: hazardClimatology.id,
      valor: hazardClimatology.valor,
      unidad: hazardClimatology.unidad,
      periodoDesde: hazardClimatology.periodoDesde,
      periodoHasta: hazardClimatology.periodoHasta,
    })
    .from(hazardClimatology)
    .innerJoin(
      completeClimatologyGroups,
      and(
        eq(hazardClimatology.geometryRef, completeClimatologyGroups.geometryRef),
        eq(hazardClimatology.variable, completeClimatologyGroups.variable),
        eq(hazardClimatology.muestra, completeClimatologyGroups.muestra),
        eq(hazardClimatology.periodoDesde, completeClimatologyGroups.periodoDesde),
        eq(hazardClimatology.periodoHasta, completeClimatologyGroups.periodoHasta),
        eq(hazardClimatology.version, completeClimatologyGroups.version),
        eq(hazardClimatology.calculadoEn, completeClimatologyGroups.calculadoEn),
      ),
    )
    .where(and(...climatologyConditions))
    .orderBy(desc(hazardClimatology.periodoDesde), asc(hazardClimatology.id))

  const pronostico = forecastRows

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

  // La capa de nivel se calcula sólo para la celda pedida: sin geometryRef no
  // se recorre todo el padrón acá (sería una consulta cara ajena a este
  // endpoint puntual), así que el arreglo va vacío.
  const niveles =
    geometryRef === undefined
      ? []
      : await obtenerNivelesPeligro({ geometryRefs: [geometryRef] })

  const caudal =
    puntoRioId === undefined ? null : await obtenerNivelCaudal(puntoRioId)

  // Sólo las 5 lecturas satelitales más recientes de la celda: un endpoint de
  // lectura puntual no necesita el histórico completo.
  const observado =
    geometryRef === undefined
      ? []
      : await db
          .select({
            geometryRef: hazardObservation.geometryRef,
            provider: hazardObservation.provider,
            variable: hazardObservation.variable,
            valor: hazardObservation.valor,
            unidad: hazardObservation.unidad,
            observadoEn: hazardObservation.observadoEn,
            validoDesde: hazardObservation.validoDesde,
            validoHasta: hazardObservation.validoHasta,
          })
          .from(hazardObservation)
          .where(eq(hazardObservation.geometryRef, geometryRef))
          .orderBy(desc(hazardObservation.observadoEn))
          .limit(5)

  // MAJOR de la revisión de gate N1 (docs/ejecucion-enos/E3a/registro.md,
  // §"Correcciones del gate N1"): acumulados 24h/72h de lluvia observada por
  // celda, con cobertura explícita. Campo additivo, no rompe el contrato
  // existente de `observado` (las 5 lecturas puntuales más recientes).
  const observadoAcumulado =
    geometryRef === undefined ? [] : await obtenerAcumuladosObservados({ geometryRef })

  return jsonNoStore({ pronostico, climatologia, niveles, caudal, observado, observadoAcumulado })
}
