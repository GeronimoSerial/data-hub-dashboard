import { createHash, randomUUID } from 'node:crypto'
import { and, asc, count, desc, eq, gte, lte, max, min } from 'drizzle-orm'
import type { getDb } from '@/lib/db'
import { hidroLectura } from '@/lib/db/schema'
import {
  obtenerEstacionesPrefectura,
  obtenerVersionCatalogoPrefectura,
  type EstacionPrefectura,
} from './estaciones-prefectura'
import {
  type CalidadPuntoHistorico,
  EDAD_MAXIMA_LECTURA_HORAS,
  type EstadoAltura,
  evaluarPuntoHistorico,
  type TendenciaAltura,
} from './estado-altura'
import type { FilaAlturaPrefectura } from './prefectura-parser'
import { zonaHorariaRegion } from '../formato-region'

// A parsed row already resolved to a catalogue station (`estacionId`).
export type LecturaResuelta = Pick<
  FilaAlturaPrefectura,
  | 'lecturaM'
  | 'variacionM'
  | 'periodoHoras'
  | 'medidaEn'
  | 'estadoPublicado'
  | 'lecturaAnteriorM'
  | 'medidaAnteriorEn'
  | 'alertaM'
  | 'evacuacionM'
  | 'inconsistente'
  | 'motivosInconsistencia'
> & { estacionId: string }

export type OpcionesGuardarLecturas = {
  capturadaEn: string
  catalogoVersion: string
}

export type ResultadoGuardarLecturas = {
  insertadas: number
  duplicadas: number
  sinFecha: number
}

export const RANGO_MAXIMO_HISTORIA_DIAS = 90
export const RANGO_MAXIMO_HISTORIA_MS = RANGO_MAXIMO_HISTORIA_DIAS * 24 * 60 * 60 * 1000
export const LIMITE_MAXIMO_LECTURAS_HISTORIA = 2500
export const UMBRAL_HUECO_HORAS_DEFAULT = EDAD_MAXIMA_LECTURA_HORAS

const MILISEGUNDOS_POR_HORA = 3_600_000
const PATRON_ESTACION_ID = /^[a-z0-9-]+$/
const PATRON_ISO_CON_ZONA =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/

export type CodigoErrorHistoriaEstacion =
  | 'estacion_id_invalido'
  | 'estacion_no_encontrada'
  | 'rango_invalido'
  | 'rango_excesivo'
  | 'limite_invalido'

export type ResultadoValidacionHistoriaEstacion =
  | {
      ok: true
      estacion: EstacionPrefectura
      desdeIso: string
      hastaIso: string
      desdeMs: number
      hastaMs: number
      horasSolicitadas: number
      limite: number
    }
  | {
      ok: false
      codigo: CodigoErrorHistoriaEstacion
      status: 400 | 404
      error: string
    }

export type PuntoHistoriaHidrometrica = {
  medidaEn: string
  capturadaEn: string
  fuente: string
  lecturaM: number | null
  alertaM: number | null
  evacuacionM: number | null
  estadoNivel: EstadoAltura
  calidad: CalidadPuntoHistorico
  inconsistente: boolean
  motivosInconsistencia: string[]
  variacionPublicada: {
    variacionM: number | null
    periodoHoras: number | null
    estadoPublicado: string
    lecturaAnteriorM: number | null
    medidaAnteriorEn: string | null
    tendencia: TendenciaAltura
    confiable: boolean
  }
  brechaDesdeAnteriorHoras: number | null
  huecoPrevio: boolean
}

export type HuecoSerieHidrometrica = {
  desdeMedidaEn: string
  hastaMedidaEn: string
  duracionHoras: number
}

export type CoberturaDisponibleEstacion = {
  totalLecturas: number
  primeraMedidaEn: string | null
  ultimaMedidaEn: string | null
  horasDisponibles: number
}

export type RespuestaHistoriaEstacion = {
  estacion: {
    estacionId: string
    nombre: string
    rio: 'parana' | 'uruguay'
    rol: 'corrientes' | 'contexto-aguas-arriba'
    idHistorico: number
    lat: number | null
    lon: number | null
    coordenadasVerificadas: false
    catalogoVersion: string
  }
  rangoSolicitado: {
    desde: string
    hasta: string
    horasSolicitadas: number
    limiteAplicado: number
  }
  umbrales: {
    alertaM: number | null
    evacuacionM: number | null
    referenciaMedidaEn: string | null
    variaronEnVentana: boolean
  }
  cobertura: {
    sinLecturas: boolean
    totalEnVentana: number
    puntosDevueltos: number
    limiteAplicado: number
    truncada: boolean
    primeraMedidaEn: string | null
    ultimaMedidaEn: string | null
    horasCubiertas: number
    brechaMinHoras: number | null
    brechaMaxHoras: number | null
    huecos: HuecoSerieHidrometrica[]
    disponibleEstacion: CoberturaDisponibleEstacion
  }
  calidad: {
    totalPuntos: number
    puntosValidos: number
    puntosInconsistentes: number
    puntosSinUmbrales: number
    puntosSinLectura: number
    cantidadHuecos: number
    umbralHuecoHoras: number
  }
  fuente: {
    codigo: string
    nombre: string
    tabla: 'hidro_lectura'
    unidadAltura: 'm'
    zonaHorariaReferencia: string
    edadMaximaVigenciaHoras: number
    notaReferenciaAnual: string
  }
  lecturas: PuntoHistoriaHidrometrica[]
}

export type OpcionesConsultaHistoriaEstacion = {
  estacionId: string
  desde: string
  hasta: string
  limite?: number
  umbralHuecoHoras?: number
}

type Db = ReturnType<typeof getDb>

// Keeps each INSERT well below the Postgres bind-parameter limit.
const TAMANO_LOTE = 500

function tieneFecha(
  lectura: LecturaResuelta,
): lectura is LecturaResuelta & { medidaEn: string } {
  return lectura.medidaEn !== null
}

function redondearHoras(ms: number): number {
  return Math.round((ms / MILISEGUNDOS_POR_HORA) * 100) / 100
}

function parsearIsoConZona(valor: unknown): number | null {
  if (typeof valor !== 'string') return null
  const limpio = valor.trim()
  if (!PATRON_ISO_CON_ZONA.test(limpio)) return null
  const ms = Date.parse(limpio)
  return Number.isNaN(ms) ? null : ms
}

export function obtenerEstacionCatalogo(estacionId: string): EstacionPrefectura | null {
  return obtenerEstacionesPrefectura().find((e) => e.estacionId === estacionId) ?? null
}

export function validarConsultaHistoriaEstacion(entrada: {
  estacionId: unknown
  desde: unknown
  hasta: unknown
  limite?: unknown
}): ResultadoValidacionHistoriaEstacion {
  if (
    typeof entrada.estacionId !== 'string' ||
    entrada.estacionId.trim().length === 0 ||
    entrada.estacionId.length > 80 ||
    !PATRON_ESTACION_ID.test(entrada.estacionId)
  ) {
    return {
      ok: false,
      codigo: 'estacion_id_invalido',
      status: 400,
      error: 'Identificador de estación inválido',
    }
  }

  const estacion = obtenerEstacionCatalogo(entrada.estacionId)
  if (!estacion) {
    return {
      ok: false,
      codigo: 'estacion_no_encontrada',
      status: 404,
      error: 'Estación no encontrada en el catálogo hidrométrico',
    }
  }

  const desdeMs = parsearIsoConZona(entrada.desde)
  const hastaMs = parsearIsoConZona(entrada.hasta)
  if (desdeMs === null || hastaMs === null) {
    return {
      ok: false,
      codigo: 'rango_invalido',
      status: 400,
      error: 'Parámetros desde y hasta obligatorios en formato ISO-8601 con zona horaria',
    }
  }

  if (desdeMs > hastaMs) {
    return {
      ok: false,
      codigo: 'rango_invalido',
      status: 400,
      error: 'Rango inválido: desde no puede ser posterior a hasta',
    }
  }

  const duracionMs = hastaMs - desdeMs
  if (duracionMs > RANGO_MAXIMO_HISTORIA_MS) {
    return {
      ok: false,
      codigo: 'rango_excesivo',
      status: 400,
      error: `Rango excesivo: la ventana máxima permitida es de ${RANGO_MAXIMO_HISTORIA_DIAS} días`,
    }
  }

  let limite = LIMITE_MAXIMO_LECTURAS_HISTORIA
  if (entrada.limite !== undefined && entrada.limite !== null && entrada.limite !== '') {
    const num =
      typeof entrada.limite === 'number'
        ? entrada.limite
        : typeof entrada.limite === 'string' && /^\d+$/.test(entrada.limite.trim())
          ? Number(entrada.limite.trim())
          : Number.NaN
    if (!Number.isInteger(num) || num < 1 || num > LIMITE_MAXIMO_LECTURAS_HISTORIA) {
      return {
        ok: false,
        codigo: 'limite_invalido',
        status: 400,
        error: `Parámetro limite inválido: debe ser un entero entre 1 y ${LIMITE_MAXIMO_LECTURAS_HISTORIA}`,
      }
    }
    limite = num
  }

  return {
    ok: true,
    estacion,
    desdeIso: new Date(desdeMs).toISOString(),
    hastaIso: new Date(hastaMs).toISOString(),
    desdeMs,
    hastaMs,
    horasSolicitadas: redondearHoras(duracionMs),
    limite,
  }
}

// sha256 over the normalized source row, in a fixed field order so the same input
// always yields the same hash.
export function hashLecturaOriginal(lectura: LecturaResuelta): string {
  const canonica = JSON.stringify([
    lectura.estacionId,
    lectura.medidaEn,
    lectura.lecturaM,
    lectura.variacionM,
    lectura.periodoHoras,
    lectura.estadoPublicado,
    lectura.lecturaAnteriorM,
    lectura.medidaAnteriorEn,
    lectura.alertaM,
    lectura.evacuacionM,
  ])
  return createHash('sha256').update(canonica).digest('hex')
}

/**
 * Stores readings idempotently. A reading already stored for the same
 * (estacion, medida) is skipped and never overwritten. Rows without `medidaEn`
 * cannot be keyed and are counted as `sinFecha`.
 */
export async function guardarLecturasPrefectura(
  db: Db,
  lecturas: readonly LecturaResuelta[],
  { capturadaEn, catalogoVersion }: OpcionesGuardarLecturas,
): Promise<ResultadoGuardarLecturas> {
  const conFecha = lecturas.filter(tieneFecha)
  const sinFecha = lecturas.length - conFecha.length
  let insertadas = 0

  for (let inicio = 0; inicio < conFecha.length; inicio += TAMANO_LOTE) {
    const lote = conFecha.slice(inicio, inicio + TAMANO_LOTE).map((lectura) => ({
      id: randomUUID(),
      estacionId: lectura.estacionId,
      lecturaM: lectura.lecturaM,
      variacionM: lectura.variacionM,
      periodoHoras: lectura.periodoHoras,
      medidaEn: lectura.medidaEn,
      estadoPublicado: lectura.estadoPublicado,
      lecturaAnteriorM: lectura.lecturaAnteriorM,
      medidaAnteriorEn: lectura.medidaAnteriorEn,
      alertaM: lectura.alertaM,
      evacuacionM: lectura.evacuacionM,
      inconsistente: lectura.inconsistente,
      motivosInconsistencia: lectura.motivosInconsistencia,
      hashOriginal: hashLecturaOriginal(lectura),
      catalogoVersion,
      capturadaEn,
    }))

    const creadas = await db
      .insert(hidroLectura)
      .values(lote)
      .onConflictDoNothing({
        target: [hidroLectura.estacionId, hidroLectura.medidaEn],
      })
      .returning({ id: hidroLectura.id })
    insertadas += creadas.length
  }

  return { insertadas, duplicadas: conFecha.length - insertadas, sinFecha }
}

/**
 * Most recent stored reading of a station, by `medidaEn` (descending), or
 * `null` when the station has none.
 */
export async function ultimaLecturaEstacion(db: Db, estacionId: string) {
  const [fila] = await db
    .select()
    .from(hidroLectura)
    .where(eq(hidroLectura.estacionId, estacionId))
    .orderBy(desc(hidroLectura.medidaEn))
    .limit(1)
  return fila ?? null
}

/**
 * Queries real stored observations for a catalogue station within [desde, hasta]
 * in ascending chronological order. Never extrapolates or interpolates missing intervals,
 * and never fabricates time-series points from `hidro_referencia`.
 */
export async function consultarHistoriaEstacion(
  db: Db,
  opciones: OpcionesConsultaHistoriaEstacion,
): Promise<RespuestaHistoriaEstacion> {
  const validacion = validarConsultaHistoriaEstacion(opciones)
  if (!validacion.ok) {
    throw new Error(validacion.error)
  }

  const { estacion, desdeIso, hastaIso, horasSolicitadas, limite } = validacion
  const umbralHuecoHoras = opciones.umbralHuecoHoras ?? UMBRAL_HUECO_HORAS_DEFAULT

  const condicionVentana = and(
    eq(hidroLectura.estacionId, estacion.estacionId),
    gte(hidroLectura.medidaEn, desdeIso),
    lte(hidroLectura.medidaEn, hastaIso),
  )

  const [filasVentana, [resumenEstacion]] = await Promise.all([
    db
      .select()
      .from(hidroLectura)
      .where(condicionVentana)
      .orderBy(asc(hidroLectura.medidaEn), asc(hidroLectura.id))
      .limit(limite + 1),
    db
      .select({
        totalLecturas: count(),
        primeraMedidaEn: min(hidroLectura.medidaEn),
        ultimaMedidaEn: max(hidroLectura.medidaEn),
      })
      .from(hidroLectura)
      .where(eq(hidroLectura.estacionId, estacion.estacionId)),
  ])

  const truncada = filasVentana.length > limite
  const filasDevueltas = truncada ? filasVentana.slice(0, limite) : filasVentana

  let totalEnVentana = filasDevueltas.length
  if (truncada) {
    const [conteoVentana] = await db
      .select({ total: count() })
      .from(hidroLectura)
      .where(condicionVentana)
    totalEnVentana = Number(conteoVentana?.total ?? filasVentana.length)
  }

  const huecos: HuecoSerieHidrometrica[] = []
  const brechasHoras: number[] = []
  let puntosValidos = 0
  let puntosInconsistentes = 0
  let puntosSinUmbrales = 0
  let puntosSinLectura = 0

  const lecturas: PuntoHistoriaHidrometrica[] = filasDevueltas.map((fila, indice) => {
    const previa = indice > 0 ? filasDevueltas[indice - 1] : undefined
    const brechaDesdeAnteriorHoras = previa
      ? redondearHoras(Date.parse(fila.medidaEn) - Date.parse(previa.medidaEn))
      : null

    if (brechaDesdeAnteriorHoras !== null) {
      brechasHoras.push(brechaDesdeAnteriorHoras)
    }

    const huecoPrevio =
      brechaDesdeAnteriorHoras !== null && brechaDesdeAnteriorHoras > umbralHuecoHoras

    if (huecoPrevio && previa) {
      huecos.push({
        desdeMedidaEn: previa.medidaEn,
        hastaMedidaEn: fila.medidaEn,
        duracionHoras: brechaDesdeAnteriorHoras,
      })
    }

    const evaluacion = evaluarPuntoHistorico({
      lecturaM: fila.lecturaM,
      variacionM: fila.variacionM,
      periodoHoras: fila.periodoHoras,
      medidaEn: fila.medidaEn,
      estadoPublicado: fila.estadoPublicado,
      alertaM: fila.alertaM,
      evacuacionM: fila.evacuacionM,
      inconsistente: fila.inconsistente,
      motivosInconsistencia: fila.motivosInconsistencia,
    })

    if (evaluacion.calidad === 'valida') puntosValidos += 1
    else if (evaluacion.calidad === 'inconsistente') puntosInconsistentes += 1
    else if (evaluacion.calidad === 'sin_umbrales') puntosSinUmbrales += 1
    else if (evaluacion.calidad === 'sin_lectura') puntosSinLectura += 1

    return {
      medidaEn: fila.medidaEn,
      capturadaEn: fila.capturadaEn,
      fuente: fila.fuente,
      lecturaM: fila.lecturaM,
      alertaM: fila.alertaM,
      evacuacionM: fila.evacuacionM,
      estadoNivel: evaluacion.estadoNivel,
      calidad: evaluacion.calidad,
      inconsistente: fila.inconsistente,
      motivosInconsistencia: [...fila.motivosInconsistencia],
      variacionPublicada: {
        variacionM: fila.variacionM,
        periodoHoras: fila.periodoHoras,
        estadoPublicado: fila.estadoPublicado,
        lecturaAnteriorM: fila.lecturaAnteriorM,
        medidaAnteriorEn: fila.medidaAnteriorEn,
        tendencia: evaluacion.variacionPublicada.tendencia,
        confiable: evaluacion.variacionPublicada.confiable,
      },
      brechaDesdeAnteriorHoras,
      huecoPrevio,
    }
  })

  const primeraVentana = lecturas[0]?.medidaEn ?? null
  const ultimaVentana = lecturas[lecturas.length - 1]?.medidaEn ?? null
  const horasCubiertas =
    primeraVentana && ultimaVentana
      ? redondearHoras(Date.parse(ultimaVentana) - Date.parse(primeraVentana))
      : 0

  const totalGlobal = Number(resumenEstacion?.totalLecturas ?? 0)
  const primeraGlobal = resumenEstacion?.primeraMedidaEn ?? null
  const ultimaGlobal = resumenEstacion?.ultimaMedidaEn ?? null
  const horasDisponibles =
    primeraGlobal && ultimaGlobal
      ? redondearHoras(Date.parse(ultimaGlobal) - Date.parse(primeraGlobal))
      : 0

  const ultimaFilaConUmbral = [...filasDevueltas]
    .reverse()
    .find((f) => f.alertaM !== null || f.evacuacionM !== null)
  const paresUmbral = new Set(
    filasDevueltas.map((f) => `${f.alertaM ?? 'null'}:${f.evacuacionM ?? 'null'}`),
  )

  return {
    estacion: {
      estacionId: estacion.estacionId,
      nombre: estacion.nombrePna,
      rio: estacion.rio,
      rol: estacion.rol,
      idHistorico: estacion.idHistorico,
      lat: estacion.coordenadas?.lat ?? null,
      lon: estacion.coordenadas?.lon ?? null,
      coordenadasVerificadas: false,
      catalogoVersion: obtenerVersionCatalogoPrefectura(),
    },
    rangoSolicitado: {
      desde: desdeIso,
      hasta: hastaIso,
      horasSolicitadas,
      limiteAplicado: limite,
    },
    umbrales: {
      alertaM: ultimaFilaConUmbral?.alertaM ?? null,
      evacuacionM: ultimaFilaConUmbral?.evacuacionM ?? null,
      referenciaMedidaEn: ultimaFilaConUmbral?.medidaEn ?? null,
      variaronEnVentana: paresUmbral.size > 1,
    },
    cobertura: {
      sinLecturas: lecturas.length === 0,
      totalEnVentana,
      puntosDevueltos: lecturas.length,
      limiteAplicado: limite,
      truncada,
      primeraMedidaEn: primeraVentana,
      ultimaMedidaEn: ultimaVentana,
      horasCubiertas,
      brechaMinHoras: brechasHoras.length > 0 ? Math.min(...brechasHoras) : null,
      brechaMaxHoras: brechasHoras.length > 0 ? Math.max(...brechasHoras) : null,
      huecos,
      disponibleEstacion: {
        totalLecturas: totalGlobal,
        primeraMedidaEn: primeraGlobal,
        ultimaMedidaEn: ultimaGlobal,
        horasDisponibles,
      },
    },
    calidad: {
      totalPuntos: lecturas.length,
      puntosValidos,
      puntosInconsistentes,
      puntosSinUmbrales,
      puntosSinLectura,
      cantidadHuecos: huecos.length,
      umbralHuecoHoras,
    },
    fuente: {
      codigo: lecturas[0]?.fuente ?? 'prefectura',
      nombre: 'Prefectura Naval Argentina (PNA)',
      tabla: 'hidro_lectura',
      unidadAltura: 'm',
      zonaHorariaReferencia: zonaHorariaRegion(),
      edadMaximaVigenciaHoras: EDAD_MAXIMA_LECTURA_HORAS,
      notaReferenciaAnual:
        'Las estadísticas de hidro_referencia son agregados anuales (p10, mediana, p90) y nunca se interpolan como puntos de la serie.',
    },
    lecturas,
  }
}
