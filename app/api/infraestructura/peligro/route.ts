import { asc, desc, eq } from 'drizzle-orm'
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
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Validación deliberadamente laxa: `geometryRef` es la celda de grilla de 0.1°
// ("lat_lon") para variables atmosféricas, pero también el id de un punto de
// río para caudal. Un regex numérico estricto rechazaría ids de río válidos;
// sólo se acota presencia y longitud.
const geometryRefSchema = z.string().min(1).max(50).optional()

async function handleGET(request: Request) {
  await ensureSeeded()

  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)

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

export const GET = ruta('infraestructura.peligro.get', handleGET)
