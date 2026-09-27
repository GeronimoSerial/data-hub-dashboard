// Job de sync de pronóstico hidrometeorológico (E2): junta las celdas únicas
// con perfil geográfico válido (ECMWF) y los puntos de río curados (caudal
// GloFAS/Flood) y persiste ambos en `hazard_forecast`, actualizando además la
// salud por proveedor en `hazard_source_health`.
//
// Idempotencia en dos capas:
// 1. `infra_job_run` (ver job-run.ts): la claveIdempotente es el bloque de 6h
//    UTC, así dos invocaciones dentro de la misma ventana compiten por el
//    MISMO job run y sólo una lo ejecuta. Repetir el sync no re-consulta ni
//    re-escribe.
// 2. `hazard_forecast_uidx` (provider+variable+geometryRef+corridaEn+validoEn):
//    si por alguna razón se vuelven a pedir los mismos puntos de la misma
//    corrida, el upsert actualiza valor/unidad/pasoHoras/ingeridoEn en vez de
//    duplicar.
//
// Una fuente degradada NO tumba el job: cada proveedor reporta los errores por
// celda/punto y el sync completa igual; el estado queda reflejado en
// `hazard_source_health`.
import { randomUUID } from 'node:crypto'
import { isNotNull, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { hazardForecast, hazardSourceHealth, infraGeoProfile } from '@/lib/db/schema'
import { PUNTOS_RIO } from '../puntos-rio'
import { crearProviderEcmwf } from '../providers/ecmwf'
import {
  crearProviderFlood,
  obtenerPronosticoConDiagnostico as pronosticoFloodConDiagnostico,
} from '../providers/flood'
import type { HazardForecastPunto } from '../tipos-hazard'
import { adquirirLease, publicarResultado } from '../job-run'

// Ambigüedad resuelta: el contrato `HazardProvider` de tipos-hazard.ts sólo
// declara `obtenerPronostico`; el método con diagnóstico por celda lo agrega
// `HazardProviderEcmwf` y, en flood.ts, vive como función suelta (la factory
// `crearProviderFlood()` no lo expone). No podemos tocar esos archivos en este
// cambio, así que el job depende de esta interfaz estructural mínima. Los
// providers reales la satisfacen y los tests pueden inyectar fakes sin red.
export interface ProveedorConDiagnostico {
  readonly nombreProveedor: string
  obtenerPronosticoConDiagnostico(params: {
    geometryRefs: string[]
    ahora: Date
  }): Promise<{ puntos: HazardForecastPunto[]; erroresPorCelda: Record<string, string> }>
}

export type ResultadoSyncPronosticoCaudal = {
  celdasConsultadas: number
  puntosRioConsultados: number
  llamadasRealizadas: number
  filasInsertadas: number
  proveedoresConError: string[]
}

const TIPO_JOB = 'sync-hazard-pronostico-caudal'
const VERSION_JOB = 'v1'
const DURACION_LEASE_MS = 5 * 60 * 1000
const TTL_MINUTOS = 360
const LICENCIA = 'CC-BY 4.0 no comercial — Open-Meteo + ECMWF, nivel gratuito'
const LARGO_MAX_ERROR = 300

type Db = ReturnType<typeof getDb>

// Bloque de 6h UTC: 00, 06, 12, 18. Dos corridas dentro del mismo bloque
// comparten claveIdempotente y por lo tanto son la MISMA corrida.
function claveIdempotenteDeBloque(ahora: Date): string {
  const bloqueHoras = Math.floor(ahora.getUTCHours() / 6) * 6
  const anio = ahora.getUTCFullYear()
  const mes = String(ahora.getUTCMonth() + 1).padStart(2, '0')
  const dia = String(ahora.getUTCDate()).padStart(2, '0')
  const hora = String(bloqueHoras).padStart(2, '0')
  return `${anio}-${mes}-${dia}T${hora}`
}

// Corrección de revisión (hallazgo H3, docs/ejecucion-enos/E2/registro.md
// §5): `corridaEn` identifica LA CORRIDA del modelo, no el instante en que
// este proceso la consultó. Si se pasara `ahora` (wall-clock) tal cual a los
// providers, dos invocaciones dentro del MISMO bloque de 6h (ej. una
// recuperación de lease vencido) generarían `corridaEn` distintos por
// milisegundos — el índice único de `hazard_forecast` no dedupicaría, pese a
// ser la misma ventana. Se ancla `corridaEn` (y con él, el horizonte
// horas-desde-la-corrida) al INICIO del bloque de 6h, que es estable para
// toda invocación dentro de esa ventana.
function inicioDeBloqueUtc(ahora: Date): Date {
  const bloqueHoras = Math.floor(ahora.getUTCHours() / 6) * 6
  return new Date(
    Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate(), bloqueHoras, 0, 0, 0),
  )
}

// La factory de flood no expone el diagnóstico por punto; se lo agregamos
// apoyándonos en la función suelta que ella misma usa internamente.
function crearProviderFloodConDiagnostico(): ProveedorConDiagnostico {
  const base = crearProviderFlood()
  return {
    nombreProveedor: base.nombreProveedor,
    obtenerPronosticoConDiagnostico: (params) => pronosticoFloodConDiagnostico(params),
  }
}

// Un proveedor que lanza (no sólo que reporta errores por celda) no debe
// tumbar el job: se traduce a error en todas sus celdas y se sigue.
async function consultarProveedor(
  provider: ProveedorConDiagnostico,
  geometryRefs: string[],
  ahora: Date,
): Promise<{ puntos: HazardForecastPunto[]; erroresPorCelda: Record<string, string> }> {
  try {
    return await provider.obtenerPronosticoConDiagnostico({ geometryRefs, ahora })
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error)
    const erroresPorCelda: Record<string, string> = {}
    for (const ref of geometryRefs) {
      erroresPorCelda[ref] = `proveedor_throw: ${mensaje}`
    }
    return { puntos: [], erroresPorCelda }
  }
}

async function persistirPuntos(
  db: Db,
  provider: string,
  puntos: HazardForecastPunto[],
  ingeridoEn: string,
): Promise<number> {
  if (puntos.length === 0) return 0

  const filas = puntos.map((punto) => ({
    id: randomUUID(),
    provider,
    variable: punto.variable,
    geometryRef: punto.geometryRef,
    corridaEn: punto.corridaEn,
    validoEn: punto.validoEn,
    horizonteHoras: punto.horizonteHoras,
    valor: punto.valor,
    unidad: punto.unidad,
    pasoHoras: punto.pasoHoras,
    // En producción acá se escribiría el payload crudo bajo
    // getDataDir()+'/hazard-raw/' y se guardaría su ruta. Fuera del alcance de
    // esta tarea: rawRef queda null y no se conserva el archivo.
    rawRef: null,
    ingeridoEn,
  }))

  await db
    .insert(hazardForecast)
    .values(filas)
    .onConflictDoUpdate({
      target: [
        hazardForecast.provider,
        hazardForecast.variable,
        hazardForecast.geometryRef,
        hazardForecast.corridaEn,
        hazardForecast.validoEn,
      ],
      set: {
        valor: sql`excluded.valor`,
        unidad: sql`excluded.unidad`,
        pasoHoras: sql`excluded.paso_horas`,
        ingeridoEn: sql`excluded.ingerido_en`,
      },
    })

  return filas.length
}

async function actualizarSalud(
  db: Db,
  provider: string,
  erroresPorCelda: Record<string, string>,
  ahoraIso: string,
): Promise<void> {
  const mensajes = Object.values(erroresPorCelda)
  const hayError = mensajes.length > 0
  const primerError = hayError ? mensajes[0].slice(0, LARGO_MAX_ERROR) : null

  await db
    .insert(hazardSourceHealth)
    .values({
      provider,
      // Un insert degradado no conoce un éxito previo: null.
      ultimoExitoEn: hayError ? null : ahoraIso,
      ultimoIntentoEn: ahoraIso,
      estado: hayError ? 'degradado' : 'ok',
      ultimoErrorSaneado: primerError,
      ttlMinutos: TTL_MINUTOS,
      licencia: LICENCIA,
      actualizadaEn: ahoraIso,
    })
    .onConflictDoUpdate({
      target: hazardSourceHealth.provider,
      set: {
        estado: hayError ? 'degradado' : 'ok',
        ultimoIntentoEn: ahoraIso,
        ultimoErrorSaneado: primerError,
        ttlMinutos: TTL_MINUTOS,
        licencia: LICENCIA,
        actualizadaEn: ahoraIso,
        // En degraded se preserva el último éxito conocido; en ok se actualiza.
        ...(hayError ? {} : { ultimoExitoEn: ahoraIso }),
      },
    })
}

export async function ejecutarSyncPronosticoCaudal(params?: {
  ahora?: Date
  ecmwfProvider?: ProveedorConDiagnostico
  floodProvider?: ProveedorConDiagnostico
}): Promise<
  | { ok: true; resultado: ResultadoSyncPronosticoCaudal }
  | { ok: false; motivo: 'lease_no_disponible' }
> {
  const db = getDb()
  const ahora = params?.ahora ?? new Date()
  const ahoraIso = ahora.toISOString()

  const claveIdempotente = claveIdempotenteDeBloque(ahora)
  const lease = await adquirirLease({
    tipo: TIPO_JOB,
    claveIdempotente,
    version: VERSION_JOB,
    duracionLeaseMs: DURACION_LEASE_MS,
    ahora,
  })
  if (!lease.adquirido) {
    return { ok: false, motivo: 'lease_no_disponible' }
  }

  // El selectDistinct ya entrega las celdas deduplicadas: geo-perfil.ts agrupó
  // por celdaDeCoordenada al calcular el perfil, así que acá no hace falta
  // volver a agrupar.
  const filasGeo = await db
    .selectDistinct({ geometryRef: infraGeoProfile.geometryRef })
    .from(infraGeoProfile)
    .where(isNotNull(infraGeoProfile.geometryRef))
  const celdas = filasGeo
    .map((fila) => fila.geometryRef)
    .filter((ref): ref is string => ref !== null)

  const puntosRio = PUNTOS_RIO.map((punto) => punto.id)

  const ecmwfProvider = params?.ecmwfProvider ?? crearProviderEcmwf()
  const floodProvider = params?.floodProvider ?? crearProviderFloodConDiagnostico()

  // `corridaEn` (dentro de los providers) se deriva de este `inicioBloque`,
  // no del wall-clock `ahora` — ver comentario de `inicioDeBloqueUtc`.
  const inicioBloque = inicioDeBloqueUtc(ahora)
  const diagnosticoEcmwf = await consultarProveedor(ecmwfProvider, celdas, inicioBloque)
  const diagnosticoFlood = await consultarProveedor(floodProvider, puntosRio, inicioBloque)

  const filasEcmwf = await persistirPuntos(
    db,
    ecmwfProvider.nombreProveedor,
    diagnosticoEcmwf.puntos,
    ahoraIso,
  )
  const filasFlood = await persistirPuntos(
    db,
    floodProvider.nombreProveedor,
    diagnosticoFlood.puntos,
    ahoraIso,
  )

  const proveedoresConError: string[] = []
  if (Object.keys(diagnosticoEcmwf.erroresPorCelda).length > 0) {
    proveedoresConError.push(ecmwfProvider.nombreProveedor)
  }
  if (Object.keys(diagnosticoFlood.erroresPorCelda).length > 0) {
    proveedoresConError.push(floodProvider.nombreProveedor)
  }

  await actualizarSalud(db, ecmwfProvider.nombreProveedor, diagnosticoEcmwf.erroresPorCelda, ahoraIso)
  await actualizarSalud(db, floodProvider.nombreProveedor, diagnosticoFlood.erroresPorCelda, ahoraIso)

  // Aproximación del conteo de llamadas HTTP: una por celda ECMWF y una por
  // punto de río. Los adapters pueden reintentar internamente (backoff/429),
  // pero ese detalle queda encapsulado en cliente-http.ts; acá contamos la
  // unidad de consulta del job.
  const llamadasRealizadas = celdas.length + puntosRio.length
  const filasInsertadas = filasEcmwf + filasFlood

  await publicarResultado({
    jobRunId: lease.jobRunId,
    leaseOwner: lease.leaseOwner,
    estado: 'completado',
    contadores: { llamadas: llamadasRealizadas, filas: filasInsertadas },
    ahora,
  })

  return {
    ok: true,
    resultado: {
      celdasConsultadas: celdas.length,
      puntosRioConsultados: puntosRio.length,
      llamadasRealizadas,
      filasInsertadas,
      proveedoresConError,
    },
  }
}
