// Job de descarga progresiva de precipitación para la climatología (E2): recorre
// las celdas con perfil geográfico válido, planifica lotes (año, celdas ERA5)
// que faltan en `hazard_precipitacion_serie` y los baja dentro del cupo diario
// de Open-Meteo. Cada lote se guarda apenas llega, así un corte de cupo no pierde
// lo ya descargado.
//
// No programado desde el 2026-10-18 (paquete "Cuota Open-Meteo",
// docs/datos/cuota-open-meteo.md): los umbrales del motor salen de la
// climatología IMERG y ERA5 queda como respaldo ya cargado. Se conserva para
// corridas manuales (`node scripts/jobs.mjs climatologia-precipitacion`).
//
// Idempotencia: `infra_job_run` (ver job-run.ts) usa la claveIdempotente
// período+versión+fecha UTC, así que el job corre una vez por día para la misma
// versión. Cada corrida retoma sólo los pares (celda ERA5, año) que faltan.
//
// Un corte por cupo (`MOTIVOS_CUPO_SIN_RED`) corta el loop y deja la corrida
// 'completado': el progreso ya está guardado y la próxima corrida retoma.
// Una celda caída NO tumba el job: se agrega a `celdasConError` y se sigue.
//
// Al terminar las descargas, cada celda ERA5 con al menos 10 años completos
// guardados recalcula sus percentiles y escribe `hazard_climatology` con cobertura
// para cada geometryRef del grupo. Las filas anteriores no se borran (historial as-of).
import { randomUUID } from 'node:crypto'
import { eq, isNotNull, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { hazardClimatology, infraGeoProfile } from '@/lib/db/schema'
import { adquirirLease, publicarResultado } from '../job-run'
import { planificarDescargas, type CeldaPlanificable } from '../climatologia/planificador'
import { aniosDescargadosPorCelda, cargarSerieCelda, guardarAnioSerie } from '../climatologia/serie-diaria'
import { calcularUmbralesAcumulados } from '../climatologia/umbrales'
import {
  agruparPuntosPorEra5,
  descargarAnioPrecipitacion,
  type PuntoClimatologia,
} from '../providers/climatologia'
import { apiKeyDesdeEntorno, crearControladorCupo, limiteVentana, MOTIVOS_CUPO_SIN_RED } from '../providers/cupo-om'

export type ResultadoCalcularClimatologia = {
  /** Pares (celda ERA5, año) descargados y guardados en esta corrida. */
  celdasAnioDescargadas: number
  /** Requests a Open-Meteo hechas en esta corrida (incluye la que cortó por cupo). */
  requests: number
  /** Celdas ERA5 con >= 10 años completos cuyos umbrales progresivos se escribieron. */
  celdasConUmbral: number
  /** geometryRef sin perfil válido o cuyo lote falló por motivo que no es cupo. */
  celdasConError: string[]
  /**
   * `true` si el cupo se agotó (o el host entró en cooldown) antes de terminar
   * los lotes planificados. No es una falla: la corrida queda 'completado' y la
   * próxima retoma lo pendiente.
   */
  cortadoPorCupo: boolean
}

const TIPO_JOB = 'calculo-climatologia'
const DURACION_LEASE_MS = 10 * 60 * 1000
const PERIODO_DESDE_DEFAULT = '1991-01-01'
const PERIODO_HASTA_DEFAULT = '2020-12-31'
const VERSION_DEFAULT = 'climatologia-v2-progresiva'
/**
 * Peso máximo que este job gasta por corrida (unidades OM-cupo). El cupo
 * gratuito de Open-Meteo es 10k diarios; el margen deja espacio para los demás
 * jobs de Open-Meteo dentro del mismo día.
 */
const PESO_MAXIMO_POR_CORRIDA = 5000
/** Variables pedidas por lote (sólo precipitación). Igual a CANTIDAD_VARIABLES_CLIMATOLOGIA del provider, que no se exporta. */
const VARIABLES_CLIMATOLOGIA = 1

export async function ejecutarCalculoClimatologia(params?: {
  ahora?: Date
  periodoDesde?: string
  periodoHasta?: string
  version?: string
  descargarAnio?: typeof descargarAnioPrecipitacion
}): Promise<
  | { ok: true; resultado: ResultadoCalcularClimatologia }
  | { ok: false; motivo: 'lease_no_disponible' }
> {
  const db = getDb()
  const ahora = params?.ahora ?? new Date()
  const periodoDesde = params?.periodoDesde ?? PERIODO_DESDE_DEFAULT
  const periodoHasta = params?.periodoHasta ?? PERIODO_HASTA_DEFAULT
  const version = params?.version ?? VERSION_DEFAULT
  const descargarAnio = params?.descargarAnio ?? descargarAnioPrecipitacion

  const fechaUtc = ahora.toISOString().slice(0, 10)
  const claveIdempotente = `${periodoDesde}_${periodoHasta}_${version}_${fechaUtc}`
  const lease = await adquirirLease({
    tipo: TIPO_JOB,
    claveIdempotente,
    version,
    duracionLeaseMs: DURACION_LEASE_MS,
    ahora,
  })
  if (!lease.adquirido) {
    return { ok: false, motivo: 'lease_no_disponible' }
  }

  // Corrección de bug real (mismo hallazgo que sync-pronostico-caudal.ts): sin
  // este try/catch, cualquier excepción posterior a adquirir el lease escapa
  // sin publicar resultado y `infra_job_run` queda 'en_progreso' hasta que el
  // lease venza solo. Se envuelve todo el cuerpo para que un fallo siempre
  // marque 'fallido' antes de relanzar la excepción original.
  try {
    return await ejecutarCuerpoDelJobClimatologia({
      db,
      ahora,
      periodoDesde,
      periodoHasta,
      version,
      descargarAnio,
      lease,
    })
  } catch (error) {
    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'fallido',
      errorSaneado: 'fallo al ejecutar calculo-climatologia',
      ahora,
    })
    throw error
  }
}

async function ejecutarCuerpoDelJobClimatologia(ctx: {
  db: ReturnType<typeof getDb>
  ahora: Date
  periodoDesde: string
  periodoHasta: string
  version: string
  descargarAnio: typeof descargarAnioPrecipitacion
  lease: { adquirido: true; jobRunId: string; leaseOwner: string }
}): Promise<
  | { ok: true; resultado: ResultadoCalcularClimatologia }
  | { ok: false; motivo: 'lease_no_disponible' }
> {
  const { db, ahora, periodoDesde, periodoHasta, descargarAnio, lease } = ctx

  // selectDistinct ya entrega las celdas deduplicadas; el filtro de nulos
  // reafirma el tipo para el resto del bucle.
  const filasGeo = await db
    .selectDistinct({ geometryRef: infraGeoProfile.geometryRef })
    .from(infraGeoProfile)
    .where(isNotNull(infraGeoProfile.geometryRef))
  const celdas = filasGeo
    .map((fila) => fila.geometryRef)
    .filter((ref): ref is string => ref !== null)

  const celdasConError: string[] = []
  const puntos: PuntoClimatologia[] = []
  for (const celda of celdas) {
    const [perfil] = await db
      .select()
      .from(infraGeoProfile)
      .where(eq(infraGeoProfile.geometryRef, celda))
      .limit(1)

    if (!perfil || perfil.lat === null || perfil.lon === null) {
      celdasConError.push(celda)
      continue
    }
    puntos.push({ geometryRef: celda, lat: perfil.lat, lon: perfil.lon })
  }

  // Las celdas de descarga son las ERA5 (~0.25°): varios geometryRef de 0.1° caen
  // en la misma celda y se bajan una sola vez.
  const grupos = agruparPuntosPorEra5(puntos)
  const miembrosPorCelda = new Map(grupos.map((grupo) => [grupo.claveEra5, grupo.miembros]))
  const celdasEra5: CeldaPlanificable[] = grupos.map((grupo) => ({
    celdaEra5: grupo.claveEra5,
    lat: grupo.lat,
    lon: grupo.lon,
  }))

  const aniosGuardados = await aniosDescargadosPorCelda(db)
  const paresGuardados = new Set<string>()
  for (const [celdaEra5, anios] of aniosGuardados) {
    for (const anio of anios) paresGuardados.add(`${celdaEra5}:${anio}`)
  }

  const apiKey = apiKeyDesdeEntorno()
  const apiKeyPresente = Boolean(apiKey)
  const lotes = planificarDescargas({
    celdas: celdasEra5,
    aniosGuardados: paresGuardados,
    anioDesde: Number(periodoDesde.slice(0, 4)),
    anioHasta: Number(periodoHasta.slice(0, 4)),
    pesoMaximoPorRequest: limiteVentana('minuto', apiKeyPresente),
    pesoDisponible: PESO_MAXIMO_POR_CORRIDA,
    variables: VARIABLES_CLIMATOLOGIA,
  })

  let celdasAnioDescargadas = 0
  let requests = 0
  let cortadoPorCupo = false

  for (const lote of lotes) {
    requests += 1
    const resultado = await descargarAnio({
      anio: lote.anio,
      celdas: lote.celdas,
      apiKey,
      controladorCupoFactory: (peso) =>
        crearControladorCupo({ host: 'archive-api', peso, apiKeyPresente, db }),
    })

    if (!resultado.ok) {
      if (MOTIVOS_CUPO_SIN_RED.has(resultado.motivo)) {
        cortadoPorCupo = true
        break
      }
      for (const celda of lote.celdas) {
        celdasConError.push(...(miembrosPorCelda.get(celda.celdaEra5) ?? []))
      }
      continue
    }

    // Se guarda cada par apenas llega: un corte en el lote siguiente no pierde esto.
    for (const serie of resultado.series) {
      const celda = lote.celdas.find((candidata) => candidata.celdaEra5 === serie.celdaEra5)
      if (!celda) continue
      await guardarAnioSerie(db, {
        celdaEra5: serie.celdaEra5,
        anio: lote.anio,
        lat: celda.lat,
        lon: celda.lon,
        valores: serie.valores,
        descargadoEn: ahora.toISOString(),
      })
      celdasAnioDescargadas += 1
    }
  }

  // Umbrales progresivos: se usan los años guardados de cada celda ERA5, también
  // tras un corte por cupo. Con menos de 10 años completos la celda no escribe nada.
  const ahoraIso = ahora.toISOString()
  let celdasConUmbral = 0
  for (const grupo of grupos) {
    const anios = await cargarSerieCelda(db, grupo.claveEra5)
    const umbrales = calcularUmbralesAcumulados({ geometryRef: grupo.miembros[0], anios })
    if (!umbrales) continue

    const filas = grupo.miembros.flatMap((geometryRef) =>
      umbrales.puntos.map((punto) => ({
        id: randomUUID(),
        geometryRef,
        variable: punto.variable,
        percentil: punto.percentil,
        muestra: punto.muestra,
        valor: punto.valor,
        unidad: punto.unidad,
        periodoDesde: umbrales.periodoDesde,
        periodoHasta: umbrales.periodoHasta,
        version: ctx.version,
        calculadoEn: ahoraIso,
        aniosCobertura: umbrales.aniosCobertura,
        diasCobertura: umbrales.diasCobertura,
      })),
    )
    if (filas.length === 0) continue

    await db
      .insert(hazardClimatology)
      .values(filas)
      .onConflictDoUpdate({
        target: [
          hazardClimatology.geometryRef,
          hazardClimatology.variable,
          hazardClimatology.percentil,
          hazardClimatology.muestra,
          hazardClimatology.periodoDesde,
          hazardClimatology.periodoHasta,
          hazardClimatology.version,
        ],
        set: {
          valor: sql`excluded.valor`,
          unidad: sql`excluded.unidad`,
          calculadoEn: sql`excluded.calculado_en`,
          aniosCobertura: sql`excluded.anios_cobertura`,
          diasCobertura: sql`excluded.dias_cobertura`,
        },
      })
    celdasConUmbral += 1
  }

  await publicarResultado({
    jobRunId: lease.jobRunId,
    leaseOwner: lease.leaseOwner,
    estado: 'completado',
    contadores: { celdasAnioDescargadas, requests, celdasConUmbral },
    ahora,
  })

  return {
    ok: true,
    resultado: { celdasAnioDescargadas, requests, celdasConUmbral, celdasConError, cortadoPorCupo },
  }
}
