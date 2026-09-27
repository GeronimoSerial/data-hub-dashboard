// Guarda de cupo compartida para TODOS los adapters de Open-Meteo (api.,
// ensemble-api., archive-api., flood-api., y sus variantes customer-* cuando
// hay OPEN_METEO_API_KEY). Ver docs/ejecucion-enos/OM-cupo/registro.md para
// el detalle completo de la decisión, las citas de la fuente y la estimación
// de costo por ciclo.
//
// Responsabilidades:
// 1. `pesoLlamada`: fórmula de peso de una request según cómo Open-Meteo
//    cuenta "múltiples llamadas" (ver cita textual abajo).
// 2. `reservarCupo`/`registrarCooldown`/`estaEnCooldown`: contabilidad
//    persistida en SQLite (tablas `om_cupo_contador`/`om_cupo_cooldown`,
//    ver lib/db/schema.ts), compartida entre procesos porque viven en la
//    base de datos, no en memoria de proceso.
// 3. `construirBaseUrl`/`agregarApiKey`: switch de host/query cuando hay
//    OPEN_METEO_API_KEY (plan pago).
//
// Techos duros (nunca superables por configuración, ver "Constraint update"
// del batch OM-cupo): 600/min, 5.000/hora, 10.000/día, 300.000/mes — estos
// son los límites del NIVEL GRATUITO publicados en
// https://open-meteo.com/en/pricing. La configuración por entorno sólo puede
// BAJARLOS; para superarlos hace falta `OPEN_METEO_API_KEY` (plan pago) Y el
// env `_PAGO` explícito de la ventana correspondiente.
import { and, eq, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { conReintentoPorBloqueo } from '@/lib/db/reintento'
import { omCupoContador, omCupoCooldown } from '@/lib/db/schema'

export type VentanaCupo = 'minuto' | 'hora' | 'dia' | 'mes'
const VENTANAS: readonly VentanaCupo[] = ['minuto', 'hora', 'dia', 'mes']

type Db = ReturnType<typeof getDb>

// IMPORTANTE: los techos de Open-Meteo son de CUENTA/IP, no por subdominio —
// https://open-meteo.com/en/pricing no distingue host por host, y trata
// "one API call corresponds to one HTTP API request" de forma uniforme para
// toda la API. Por eso la contabilidad de peso (y el cooldown post-429) NO
// se lleva por host literal (api./ensemble-api./archive-api./flood-api.):
// se colapsa a un único "bucket" compartido por plan (gratis vs pago), que
// es el pozo real que hay que no superar. `host` sigue siendo un parámetro
// de la API pública de este módulo (lo pasan los adapters con su literal:
// 'api', 'ensemble-api', etc.) sólo para fines informativos — nunca decide
// el límite.
function bucketCupo(apiKeyPresente: boolean): string {
  return apiKeyPresente ? 'open-meteo-pago' : 'open-meteo-free'
}

// -----------------------------------------------------------------------
// 1. Fórmula de peso
// -----------------------------------------------------------------------
//
// Fuente: https://open-meteo.com/en/pricing, sección "How API Requests Are
// Counted as Multiple Calls" (consultada 2026-09-27, citas textuales):
//
//   "Typically, one API call corresponds to one HTTP API request."
//   "Requests for data covering more than 10 weather variables or extending
//   over a period of more than 2 weeks for a single location are considered
//   multiple API calls."
//   "To calculate the number of API calls accurately, fractional counts are
//   used. For example, a request for 2 weeks of data with 15 weather
//   variables will be calculated as 1.5 API calls, while 4 weeks of data
//   equals 3.0 API calls."
//
// De los dos ejemplos se deriva la fórmula (verificable: 15 var / 10 = 1.5;
// con 28 días, 28/14 = 2; 1.5 * 2 = 3.0, matchea el segundo ejemplo):
//
//   factorVariables = max(1, variables / 10)
//   factorDias      = max(1, dias / 14)
//   pesoPorUbicacion = factorVariables * factorDias
//
// SUPUESTO documentado (la propia página dice, sobre multi-ubicación: "This
// distinction is crucial for developing future features such as APIs for
// multiple locations simultaneously" — es decir, Open-Meteo NO publica una
// regla cerrada de peso por multi-coordenada a la fecha de esta
// implementación): para no arriesgar 429 reales por subestimar el propio
// consumo, este módulo asume que el peso escala LINEALMENTE con la cantidad
// de ubicaciones del request (`peso_total = pesoPorUbicacion * ubicaciones`).
// Es la dirección conservadora: si Open-Meteo en realidad cobra menos por
// multi-ubicación, este cálculo sólo hace que reservemos cupo de más (nos
// frenamos antes de tiempo), nunca que lo subestimemos y terminemos
// golpeando un 429 real.
export function pesoLlamada(params: { ubicaciones: number; variables: number; dias: number }): number {
  const factorVariables = Math.max(1, params.variables / 10)
  const factorDias = Math.max(1, params.dias / 14)
  return params.ubicaciones * factorVariables * factorDias
}

// -----------------------------------------------------------------------
// 2. Límites configurables con techo duro
// -----------------------------------------------------------------------

const TECHO_GRATIS: Record<VentanaCupo, number> = {
  minuto: 600,
  hora: 5_000,
  dia: 10_000,
  mes: 300_000,
}

// Margen de seguridad por defecto: operar al 80% del techo real, no al 100%.
const MARGEN_SEGURIDAD_DEFAULT = 0.8

function nombreEnvVentana(ventana: VentanaCupo): string {
  return `OPEN_METEO_LIMITE_${ventana.toUpperCase()}`
}

/**
 * Resuelve el límite efectivo de una ventana. Regla (fijada por instrucción
 * explícita del producto, no negociable en código): el env base SÓLO puede
 * bajar el techo gratuito, nunca subirlo — un valor por encima del techo se
 * recorta (clamp) y se loguea un warning. La única forma de superar el techo
 * es con `OPEN_METEO_API_KEY` seteada Y el env `_PAGO` de esa ventana
 * presente y válido; ese valor NO se clampea (es la configuración explícita
 * del plan pago).
 */
export function limiteVentana(ventana: VentanaCupo, apiKeyPresente: boolean): number {
  const techo = TECHO_GRATIS[ventana]
  const nombreBase = nombreEnvVentana(ventana)
  const nombrePago = `${nombreBase}_PAGO`

  if (apiKeyPresente) {
    const crudoPago = process.env[nombrePago]
    if (crudoPago !== undefined) {
      const valorPago = Number(crudoPago)
      if (Number.isFinite(valorPago) && valorPago > 0) return valorPago
    }
  }

  const porDefecto = Math.floor(techo * MARGEN_SEGURIDAD_DEFAULT)
  const crudo = process.env[nombreBase]
  if (crudo === undefined) return porDefecto

  const valor = Number(crudo)
  if (!Number.isFinite(valor) || valor <= 0) return porDefecto

  if (valor > techo) {
    console.warn(
      `[cupo-om] ${nombreBase}=${valor} supera el techo gratuito de Open-Meteo para la ventana ` +
        `"${ventana}" (${techo}); se recorta a ${techo}. Para superarlo: configurar ` +
        `OPEN_METEO_API_KEY y ${nombrePago}.`,
    )
    return techo
  }

  return valor
}

export function obtenerLimites(apiKeyPresente: boolean): Record<VentanaCupo, number> {
  const limites = {} as Record<VentanaCupo, number>
  for (const ventana of VENTANAS) limites[ventana] = limiteVentana(ventana, apiKeyPresente)
  return limites
}

// -----------------------------------------------------------------------
// 3. Claves de ventana (UTC)
// -----------------------------------------------------------------------

function pad(n: number, largo = 2): string {
  return String(n).padStart(largo, '0')
}

function claveVentana(ventana: VentanaCupo, ahora: Date): string {
  const y = ahora.getUTCFullYear()
  const mo = pad(ahora.getUTCMonth() + 1)
  const d = pad(ahora.getUTCDate())
  const h = pad(ahora.getUTCHours())
  const mi = pad(ahora.getUTCMinutes())
  switch (ventana) {
    case 'minuto':
      return `${y}-${mo}-${d}T${h}:${mi}`
    case 'hora':
      return `${y}-${mo}-${d}T${h}`
    case 'dia':
      return `${y}-${mo}-${d}`
    case 'mes':
      return `${y}-${mo}`
  }
}

// -----------------------------------------------------------------------
// 4. Reserva atómica de cupo (persistida, compartida entre procesos)
// -----------------------------------------------------------------------

export type ResultadoReservaCupo =
  | { ok: true; esperoMs: number }
  | { ok: false; motivo: 'host_en_cooldown'; hastaEn: string; detalle: string }
  | { ok: false; motivo: 'cupo_agotado'; ventana: 'hora' | 'dia' | 'mes'; detalle: string }
  | { ok: false; motivo: 'cupo_minuto_agotado'; detalle: string }

/**
 * Motivos que significan que la guarda de cupo cortó ANTES de tocar la red:
 * ningún fetch real se disparó, así que no tiene sentido reintentar contra el
 * mismo bucket agotado y el caller debe cortar limpio (marcar la fuente
 * `degradado` y, en un job, dejar el job-run `fallido` para que la próxima
 * corrida retome — nunca `completado` con 0 filas).
 *
 * ÚNICA fuente de verdad (fix de la 2da revisión OM-cupo): antes,
 * `climatologia.ts`, `calcular-climatologia.ts`, `seasonal.ts`, `ensemble.ts`
 * y `ecmwf.ts` mantenían cada uno su propia copia local de este Set, y las 5
 * copias tenían el mismo bug — les faltaba `cupo_minuto_agotado` — así que un
 * corte por ventana de minuto no cortaba el resto del batch ni marcaba el
 * job-run `fallido`, dejándolo `completado` con 0 filas para siempre
 * (`adquirirLease` bloqueaba cualquier reintento). Todos esos archivos ahora
 * importan este único Set en vez de declarar el propio.
 */
export const MOTIVOS_CUPO_SIN_RED: ReadonlySet<string> = new Set([
  'cupo_agotado',
  'cupo_minuto_agotado',
  'host_en_cooldown',
])

/**
 * Guarda contra un peso de request que NINGUNA espera puede satisfacer: el
 * límite de cada ventana se evalúa completo por request (no se "consume a
 * medias" esperando), así que si `peso` por sí solo ya supera el límite de
 * minuto, ese request está condenado a `cupo_minuto_agotado` sin importar
 * cuánto se espere o reintente. En vez de dejar que el caller reintente en
 * loop indefinido, se corta acá con un error explícito: el caller
 * (`climatologia.ts`, `sync-seasonal.ts`) debe partir el request en menos
 * ubicaciones y/o menos días ANTES de intentarlo.
 */
export function asegurarPesoAlcanzable(params: { peso: number; apiKeyPresente?: boolean }): void {
  const limiteMinuto = limiteVentana('minuto', params.apiKeyPresente ?? false)
  if (params.peso > limiteMinuto) {
    throw new Error(
      `[cupo-om] peso de request (${params.peso.toFixed(2)}) supera el límite de la ventana de minuto ` +
        `(${limiteMinuto}); ningún reintento ni espera lo resuelve porque el límite se evalúa completo por ` +
        `request, no acumulado. Hay que partir el request en menos ubicaciones y/o menos días.`,
    )
  }
}

// Error interno usado sólo para cortar la transacción de reserva desde
// adentro del loop de ventanas; nunca se propaga fuera de este módulo.
class CupoAgotadoEnVentana extends Error {
  constructor(readonly ventana: VentanaCupo) {
    super(`cupo agotado en ventana ${ventana}`)
  }
}

/**
 * Intenta reservar `peso` en las 4 ventanas (minuto/hora/dia/mes) para
 * `host`, todo o nada: si CUALQUIER ventana superaría su límite, la
 * transacción entera se aborta y NINGUNA ventana queda incrementada (no
 * tiene sentido gastar cupo de minuto en una llamada que no se va a hacer
 * porque el mes ya está agotado). Atómico frente a otro proceso: cada
 * UPDATE condicionado evalúa el valor vigente en el momento de ejecutarse
 * (no un read previo), mismo patrón que `adquirirLease` en job-run.ts.
 *
 * Devuelve `null` si reservó las 4 ventanas, o la ventana que bloqueó.
 */
async function intentarReservarTodasLasVentanas(
  db: Db,
  bucket: string,
  peso: number,
  ahora: Date,
  limites: Record<VentanaCupo, number>,
): Promise<VentanaCupo | null> {
  const ahoraIso = ahora.toISOString()
  try {
    await db.transaction(async (tx) => {
      for (const ventana of VENTANAS) {
        const clave = claveVentana(ventana, ahora)
        const limite = limites[ventana]

        await tx
          .insert(omCupoContador)
          .values({ host: bucket, ventana, claveVentana: clave, pesoAcumulado: 0, actualizadaEn: ahoraIso })
          .onConflictDoNothing({
            target: [omCupoContador.host, omCupoContador.ventana, omCupoContador.claveVentana],
          })

        const [fila] = await tx
          .update(omCupoContador)
          .set({
            pesoAcumulado: sql`${omCupoContador.pesoAcumulado} + ${peso}`,
            actualizadaEn: ahoraIso,
          })
          .where(
            and(
              eq(omCupoContador.host, bucket),
              eq(omCupoContador.ventana, ventana),
              eq(omCupoContador.claveVentana, clave),
              sql`${omCupoContador.pesoAcumulado} + ${peso} <= ${limite}`,
            ),
          )
          .returning({ host: omCupoContador.host })

        if (!fila) throw new CupoAgotadoEnVentana(ventana)
      }
    })
  } catch (error) {
    if (error instanceof CupoAgotadoEnVentana) return error.ventana
    throw error
  }
  return null
}

function esperarReal(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Dos procesos (o, en test, dos clientes drizzle independientes) escribiendo
// al mismo archivo SQLite pueden chocar con `SQLITE_BUSY`/"database is
// locked" si el segundo llega mientras el primero todavía tiene la
// transacción abierta — es un detalle de implementación del driver, no una
// decisión de negocio. Se reutiliza `conReintentoPorBloqueo` (lib/db/reintento.ts,
// extraído de fix/parte-alta-concurrente) en vez de mantener una segunda
// implementación local del mismo reintento: mismo criterio de "reintentar el
// bloque completo", pero con backoff+jitter fijo (10–30ms) para no esperar de
// más frente a una colisión de milisegundos, con un techo alto de intentos
// (25) porque `intentarReservarTodasLasVentanas` puede competir con muchos
// escritores concurrentes en test.
async function conReintentoSiOcupado<T>(fn: () => Promise<T>): Promise<T> {
  return conReintentoPorBloqueo(() => fn(), {
    maxIntentos: 25,
    calcularEsperaMs: () => 10 + Math.random() * 20,
  })
}

/**
 * Reserva `peso` unidades de cupo antes de disparar una request. `host` es
 * SÓLO informativo (se usa en los mensajes de error y, si hay un 429, para
 * registrar cuál fue el host de origen); el límite real se aplica sobre el
 * BUCKET compartido de la cuenta (ver `bucketCupo` — los techos de
 * Open-Meteo son de cuenta/IP, no por subdominio).
 *
 * Comportamiento por ventana (contrato del batch OM-cupo):
 * - `minuto`: espera ACOTADA hasta el próximo minuto (nunca más de
 *   `esperaMaximaMs`) y reintenta UNA vez; si sigue bloqueado, se rinde
 *   (`cupo_minuto_agotado`). Nunca reintenta en loop indefinido.
 * - `hora`/`dia`/`mes`: no espera — son ventanas largas, bloquear el job por
 *   horas no tiene sentido. Devuelve `cupo_agotado` de inmediato para que el
 *   caller detenga el trabajo y marque la fuente degradada.
 * - cuenta en cooldown (post-429, ver `registrarCooldown`): tampoco espera,
 *   `host_en_cooldown` inmediato (bloquea TODOS los hosts del bucket, no
 *   sólo el que devolvió el 429 — mismo razonamiento: pozo compartido).
 */
export async function reservarCupo(params: {
  db?: Db
  host: string
  peso: number
  ahora: Date
  apiKeyPresente?: boolean
  esperar?: (ms: number) => Promise<void>
  esperaMaximaMs?: number
}): Promise<ResultadoReservaCupo> {
  const db = params.db ?? getDb()
  const esperar = params.esperar ?? esperarReal
  const esperaMaximaMs = params.esperaMaximaMs ?? 65_000
  const bucket = bucketCupo(params.apiKeyPresente ?? false)

  const cooldown = await estaEnCooldown({ db, apiKeyPresente: params.apiKeyPresente, ahora: params.ahora })
  if (cooldown.enCooldown) {
    return {
      ok: false,
      motivo: 'host_en_cooldown',
      hastaEn: cooldown.hastaEn,
      detalle: `cuenta Open-Meteo (${bucket}) en cooldown hasta ${cooldown.hastaEn} (origen: ${cooldown.hostOrigen ?? 'desconocido'})`,
    }
  }

  const limites = obtenerLimites(params.apiKeyPresente ?? false)
  let ahora = params.ahora
  let esperoMs = 0

  // Máximo 2 intentos: el primero directo, el segundo tras UNA espera
  // acotada — sólo tiene sentido reintentar si lo único que bloqueó fue la
  // ventana de minuto (las demás no se liberan esperando unos segundos).
  for (let intento = 0; intento < 2; intento++) {
    const bloqueante = await conReintentoSiOcupado(() =>
      intentarReservarTodasLasVentanas(db, bucket, params.peso, ahora, limites),
    )
    if (bloqueante === null) return { ok: true, esperoMs }

    if (bloqueante !== 'minuto') {
      return {
        ok: false,
        motivo: 'cupo_agotado',
        ventana: bloqueante,
        detalle: `cupo agotado en ventana "${bloqueante}" para la cuenta Open-Meteo (${bucket}, host "${params.host}")`,
      }
    }

    if (intento === 1) {
      return {
        ok: false,
        motivo: 'cupo_minuto_agotado',
        detalle: `cupo por minuto agotado para la cuenta Open-Meteo (${bucket}) tras esperar ${esperoMs}ms`,
      }
    }

    const msRestantesDelMinuto = 60_000 - ((ahora.getUTCSeconds() * 1000 + ahora.getUTCMilliseconds()) % 60_000)
    const espera = Math.min(msRestantesDelMinuto + 50, esperaMaximaMs)
    await esperar(espera)
    esperoMs += espera
    ahora = new Date(ahora.getTime() + espera)
  }

  // Inalcanzable (el for cubre los 2 intentos con return en ambos casos),
  // pero TypeScript no lo infiere del control flow del loop.
  return { ok: false, motivo: 'cupo_minuto_agotado', detalle: 'cupo por minuto agotado' }
}

// -----------------------------------------------------------------------
// 5. Cooldown post-429
// -----------------------------------------------------------------------

export async function registrarCooldown(params: {
  db?: Db
  host: string
  apiKeyPresente?: boolean
  retryAfterMs: number
  ahora: Date
}): Promise<void> {
  const db = params.db ?? getDb()
  const bucket = bucketCupo(params.apiKeyPresente ?? false)
  const ahoraIso = params.ahora.toISOString()
  const hastaEn = new Date(params.ahora.getTime() + params.retryAfterMs).toISOString()
  const retryAfterSegundos = Math.round(params.retryAfterMs / 1000)

  await db
    .insert(omCupoCooldown)
    .values({
      host: bucket,
      hostOrigen: params.host,
      hastaEn,
      motivoSaneado: 'http_429_retry_after',
      retryAfterSegundos,
      actualizadaEn: ahoraIso,
    })
    .onConflictDoUpdate({
      target: omCupoCooldown.host,
      set: {
        hostOrigen: params.host,
        hastaEn,
        motivoSaneado: 'http_429_retry_after',
        retryAfterSegundos,
        actualizadaEn: ahoraIso,
      },
    })
}

export async function estaEnCooldown(params: {
  db?: Db
  apiKeyPresente?: boolean
  ahora: Date
}): Promise<{ enCooldown: boolean; hastaEn: string; hostOrigen?: string }> {
  const db = params.db ?? getDb()
  const bucket = bucketCupo(params.apiKeyPresente ?? false)
  const [fila] = await db.select().from(omCupoCooldown).where(eq(omCupoCooldown.host, bucket))
  if (!fila) return { enCooldown: false, hastaEn: '' }
  return {
    enCooldown: fila.hastaEn > params.ahora.toISOString(),
    hastaEn: fila.hastaEn,
    hostOrigen: fila.hostOrigen,
  }
}

// -----------------------------------------------------------------------
// 6. Controlador inyectable en cliente-http.ts
// -----------------------------------------------------------------------

export interface ControladorCupoOM {
  reservar(): Promise<ResultadoReservaCupo>
  /** No-op si `retryAfterMs` es `null` (sin header no sabemos cuánto durar el cooldown). */
  registrar429(retryAfterMs: number | null): Promise<void>
}

export function crearControladorCupo(params: {
  host: string
  peso: number
  db?: Db
  apiKeyPresente?: boolean
  ahora?: () => Date
  esperar?: (ms: number) => Promise<void>
  esperaMaximaMs?: number
}): ControladorCupoOM {
  const obtenerAhora = params.ahora ?? (() => new Date())
  return {
    reservar: () =>
      reservarCupo({
        db: params.db,
        host: params.host,
        peso: params.peso,
        ahora: obtenerAhora(),
        apiKeyPresente: params.apiKeyPresente,
        esperar: params.esperar,
        esperaMaximaMs: params.esperaMaximaMs,
      }),
    registrar429: async (retryAfterMs) => {
      if (retryAfterMs === null) return
      await registrarCooldown({
        db: params.db,
        host: params.host,
        apiKeyPresente: params.apiKeyPresente,
        retryAfterMs,
        ahora: obtenerAhora(),
      })
    },
  }
}

// -----------------------------------------------------------------------
// 7. Host / API key (customer-api.*)
// -----------------------------------------------------------------------

// Nombres de host tal como los usan los adapters (sin protocolo ni sufijo de
// dominio) — coinciden con el prefijo real de cada endpoint de Open-Meteo.
// `seasonal-api` (SEASONAL, ver providers/seasonal.ts) gasta del MISMO bucket
// compartido que los otros 4 (ver `bucketCupo` arriba): el techo de
// Open-Meteo es de cuenta/IP, no por subdominio.
export type HostOpenMeteo = 'api' | 'ensemble-api' | 'archive-api' | 'flood-api' | 'seasonal-api'

/**
 * Arma la URL base según haya o no API key. Fuente:
 * https://open-meteo.com/en/docs (sección de uso comercial): "The server URL
 * requires the prefix customer-" — o sea `api.open-meteo.com` pasa a ser
 * `customer-api.open-meteo.com` (y análogo para los otros 3 hosts).
 */
export function construirBaseUrl(host: HostOpenMeteo, ruta: string, apiKey: string | undefined): string {
  const prefijo = apiKey ? 'customer-' : ''
  return `https://${prefijo}${host}.open-meteo.com${ruta}`
}

/** Agrega `apikey=` a la URL si hay API key configurada; si no, la deja igual. */
export function agregarApiKey(url: string, apiKey: string | undefined): string {
  if (!apiKey) return url
  const conApiKey = new URL(url)
  conApiKey.searchParams.set('apikey', apiKey)
  return conApiKey.toString()
}

/** Lee `OPEN_METEO_API_KEY` del entorno; `undefined` si no está seteada o vacía. */
export function apiKeyDesdeEntorno(): string | undefined {
  const valor = process.env.OPEN_METEO_API_KEY
  return valor && valor.length > 0 ? valor : undefined
}

// -----------------------------------------------------------------------
// 8. Resumen para /admin/operacion
// -----------------------------------------------------------------------

export type FilaResumenCupo = {
  /** Bucket compartido ('open-meteo-free'/'open-meteo-pago'), no un host literal. */
  host: string
  ventana: VentanaCupo
  usado: number
  limite: number
  porcentaje: number
  agotado: boolean
}

export type ResumenCupo = {
  filas: FilaResumenCupo[]
  cooldowns: Array<{ host: string; hostOrigen: string; hastaEn: string; motivoSaneado: string }>
}

/**
 * Uso actual por bucket/ventana (sólo las claves de ventana VIGENTES al
 * momento de la consulta) más los cooldowns activos. Sólo lectura, para
 * mostrar en /admin/operacion.
 */
export async function obtenerResumenCupo(params?: {
  db?: Db
  ahora?: Date
  apiKeyPresente?: boolean
}): Promise<ResumenCupo> {
  const db = params?.db ?? getDb()
  const ahora = params?.ahora ?? new Date()
  const limites = obtenerLimites(params?.apiKeyPresente ?? false)

  const todasLasFilas = await db.select().from(omCupoContador)
  const clavesVigentes: Record<VentanaCupo, string> = {
    minuto: claveVentana('minuto', ahora),
    hora: claveVentana('hora', ahora),
    dia: claveVentana('dia', ahora),
    mes: claveVentana('mes', ahora),
  }

  const filas: FilaResumenCupo[] = todasLasFilas
    .filter((fila) => fila.claveVentana === clavesVigentes[fila.ventana as VentanaCupo])
    .map((fila) => {
      const ventana = fila.ventana as VentanaCupo
      const limite = limites[ventana]
      const usado = fila.pesoAcumulado
      return {
        host: fila.host,
        ventana,
        usado,
        limite,
        porcentaje: limite > 0 ? Math.round((usado / limite) * 100) : 0,
        agotado: usado >= limite,
      }
    })
    .sort((a, b) => a.host.localeCompare(b.host) || VENTANAS.indexOf(a.ventana) - VENTANAS.indexOf(b.ventana))

  const filasCooldown = await db.select().from(omCupoCooldown)
  const cooldowns = filasCooldown
    .filter((fila) => fila.hastaEn > ahora.toISOString())
    .map((fila) => ({
      host: fila.host,
      hostOrigen: fila.hostOrigen,
      hastaEn: fila.hastaEn,
      motivoSaneado: fila.motivoSaneado,
    }))

  return { filas, cooldowns }
}
