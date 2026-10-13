// Job de descarga progresiva de precipitación para la climatología (E2): recorre
// las celdas con perfil geográfico válido, planifica lotes (año, celdas ERA5)
// que faltan en `hazard_precipitacion_serie` y los baja dentro del cupo diario
// de Open-Meteo. Cada lote se guarda apenas llega, así un corte de cupo no pierde
// lo ya descargado.
//
// Idempotencia: `infra_job_run` (ver job-run.ts) usa la claveIdempotente
// período+versión+fecha UTC, así que el job corre una vez por día para la misma
// versión. Cada corrida retoma sólo los pares (celda ERA5, año) que faltan.
//
// Un corte por cupo (`MOTIVOS_CUPO_SIN_RED`) corta el loop y deja la corrida
// 'completado': el progreso ya está guardado y la próxima corrida retoma.
// Una celda caída NO tumba el job: se agrega a `celdasConError` y se sigue.
//
// TODO(T23b): recalcular percentiles y escribir `hazard_climatology` desde
// `hazard_precipitacion_serie` con cobertura. El cálculo de umbrales se retiró de
// este job porque ya no descarga el período completo de una vez.
import { eq, isNotNull } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { infraGeoProfile } from '@/lib/db/schema'
import { adquirirLease, publicarResultado } from '../job-run'
import { planificarDescargas, type CeldaPlanificable } from '../climatologia/planificador'
import { aniosDescargadosPorCelda, guardarAnioSerie } from '../climatologia/serie-diaria'
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

  await publicarResultado({
    jobRunId: lease.jobRunId,
    leaseOwner: lease.leaseOwner,
    estado: 'completado',
    contadores: { celdasAnioDescargadas, requests },
    ahora,
  })

  return {
    ok: true,
    resultado: { celdasAnioDescargadas, requests, celdasConError, cortadoPorCupo },
  }
}
