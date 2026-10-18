import { cargarReferencias } from '@/lib/infraestructura/datasets/repositorio'
// Adapter real de PuertoRioPrefectura. Combina la localidad de la escuela
// (ge_localizacion), el tramo aprobado de su localidad (tramos-prefectura),
// la exposición física al río (susceptibilidad G1, distancia a punto de río
// o proximidad a la estación del tramo, ver DISTANCIA_ESTACION_MAX_KM)
// y la última lectura oficial de la estación (hidro_lectura).
//
// Estrategia de carga: UNA sola carga por instancia del adapter, memoizada
// en el closure (lazy, en la primera llamada a obtenerEvidencia). Nunca un
// SELECT por cueAnexo.
//
// Contrato: null es "sin evidencia". Nunca se imputa "normal" cuando falta
// tramo aprobado, exposición, lectura vigente o estado oficial.
import { eq, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import {
  hidroLectura,
  hidroReferencia,
  infraExposicionRioDem,
  infraExposicionRutaInundacion,
  infraGeoProfile,
  infraGeoRio,
  infraSusceptibilidadEstatica,
} from '@/lib/db/schema'
import { obtenerEstacionesPrefectura } from '@/lib/infraestructura/hidrometria/estaciones-prefectura'
import { estacionParaLocalidad } from '@/lib/infraestructura/hidrometria/tramos-prefectura'
import {
  estadoDeLectura,
  evaluarExposicionRio,
  lecturaVigente,
} from '../rio-prefectura'
import type { EvidenciaRioNoDisponible, EvidenciaRioPrefectura, PuertoRioPrefectura } from '../puertos'
import {
  anomaliaInterpolada,
  evaluarExposicionDinamica,
  nivelRioTramo,
  type DatosDemEscuela,
  type EstacionAnomalia,
} from '../exposicion-dinamica'
import { ultimaFilaConservadoraPorCue } from './susceptibilidad'
import type { ReglasMotor } from '../config'
import type { EscenarioSubidaEstacion } from '../escenarios-subida'
import { evaluarExposicionV04 } from '../exposicion-v04'
import { CEROS_EFECTIVOS_V04, type CeroEfectivo, type ReferenciaNivelEstacion } from '../referencia-nivel'
import { defensaDeLocalidad, type MaximosEscala } from '../altura-critica'
import { evidenciaSecoS2 } from '../evidencia-seco-s2'

// Valores numéricos pueden llegar como string desde pg (numeric/doublePrecision).
type Numerico = number | string | null

export interface FilaSusceptibilidadRio {
  claseRio: string | null
  peligroInundacionFluvial: Numerico
  distanciaAguaM: Numerico
  alturaSobreAguaM: Numerico
  juntoLaguna: boolean | null
  margenRp100M?: Numerico
}

export interface FilaLecturaRio {
  estacionId: string
  lecturaM: Numerico
  alertaM: Numerico
  evacuacionM: Numerico
  variacionM: Numerico
  medidaEn: string
  inconsistente: boolean | null
}

export interface DatosRio {
  localidadPorCue: Map<string, string | null>
  susceptibilidadPorCue: Map<string, FilaSusceptibilidadRio>
  distanciaRioKmPorCue: Map<string, Numerico>
  lecturas: FilaLecturaRio[]
  // Coordenadas de la escuela (infra_geo_profile), para el proxy de ribera.
  coordenadasPorCue?: Map<string, { lat: number; lon: number }>
  // Profundidad máxima RP100 sobre la ruta de acceso (infra_exposicion_ruta_inundacion).
  rutaProfundidadMaxMPorCue?: Map<string, Numerico>
  // Exposición estática DEM por escuela (infra_exposicion_rio_dem, última versión).
  demPorCue?: Map<string, DatosDemEscuela>
  // Mediana de 365 días por estación (hidro_referencia).
  medianaPorEstacion?: Map<string, number>
  // Memo interno: nivel DEM típico del río por estación de tramo.
  nivelTramoCache?: Map<string, number | null>
}

// Una coordenada PNA con menos de 4 decimales (~11 m) puede errar ~1 km: no
// alcanza para el proxy de 1.5 km.
const PRECISION_MINIMA_ESTACION = 4

function distanciaKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = (g: number) => (g * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

function distanciaAEstacionKm(datos: DatosRio, cueAnexo: string, estacionId: string): number | null {
  const escuela = datos.coordenadasPorCue?.get(cueAnexo)
  const estacion = obtenerEstacionesPrefectura().find((e) => e.estacionId === estacionId)?.coordenadas
  if (!escuela || !estacion || estacion.precisionDecimales < PRECISION_MINIMA_ESTACION) return null
  return distanciaKm(escuela, estacion)
}

export interface DependenciasAdapterRioPrefectura {
  // Punto de inyección para tests: por defecto consulta la DB real.
  cargarDatos?: () => Promise<DatosRio>
  reglas?: ReglasMotor
  // Reglas v0.4: escenarios de subida por estación (análogos, tendencia, onda).
  escenarios?: ReadonlyMap<string, EscenarioSubidaEstacion>
  // Reglas v0.4 (T10c): mediana de largo plazo y récord por estación (serie A5).
  referencias?: ReadonlyMap<string, ReferenciaNivelEstacion>
  // Reglas v0.4 (T10d): máximos por miembro de los análogos de cada escala.
  maximosEscala?: ReadonlyMap<string, MaximosEscala>
}

export type OpcionesEvidenciaRio = {
  reglas?: ReglasMotor
  escenarios?: ReadonlyMap<string, EscenarioSubidaEstacion>
  referencias?: ReadonlyMap<string, ReferenciaNivelEstacion>
  maximosEscala?: ReadonlyMap<string, MaximosEscala>
  // Ceros efectivos por estación (por defecto CEROS_EFECTIVOS_V04); los tests
  // de la rama DEM pasan {} para ejercitarla en estaciones calibradas.
  cerosEfectivos?: Readonly<Record<string, CeroEfectivo>>
}

// Convierte a número; null, vacío o NaN quedan como null.
function num(valor: Numerico | undefined): number | null {
  if (valor === null || valor === undefined) return null
  if (typeof valor === 'string' && valor.trim() === '') return null
  const n = Number(valor)
  return Number.isNaN(n) ? null : n
}

// Estaciones con una represa inmediatamente aguas arriba: la costa del embalse
// no está representada por su escala (dato estático de infraestructura).
// Ventana del nivel de referencia (sync-prefectura-historico).
const VENTANA_REFERENCIA_DIAS = 365

export function obtenerEstacionesConRepresa(): ReadonlySet<string> {
  return new Set(obtenerEstacionesPrefectura().filter((e) => e.represaAguasArriba).map((e) => e.estacionId))
}

// Última lectura publicada de una estación válida para asOf (ignora futuras,
// inconsistentes y no numéricas); null si no hay ninguna.
function ultimaLectura(datos: DatosRio, estacionId: string, asOfMs: number): FilaLecturaRio | null {
  let ultima: FilaLecturaRio | null = null
  let ultimaMs = Number.NEGATIVE_INFINITY
  for (const lectura of datos.lecturas) {
    if (lectura.estacionId !== estacionId) continue
    if (lectura.inconsistente === true || num(lectura.lecturaM) === null) continue
    const medidaMs = Date.parse(lectura.medidaEn)
    if (Number.isNaN(medidaMs) || medidaMs > asOfMs) continue
    if (medidaMs > ultimaMs) {
      ultima = lectura
      ultimaMs = medidaMs
    }
  }
  return ultima
}

// Anomalía actual de una estación: lectura vigente (<= 24 h) menos su mediana
// de 365 días (sync-prefectura-historico). null si falta cualquiera de los dos.
function anomaliaEstacion(datos: DatosRio, estacionId: string, asOf: string, asOfMs: number): number | null {
  const mediana = datos.medianaPorEstacion?.get(estacionId)
  if (mediana === undefined || mediana === null) return null
  const ultima = ultimaLectura(datos, estacionId, asOfMs)
  if (ultima === null || !lecturaVigente(ultima.medidaEn, asOf)) return null
  const lectura = num(ultima.lecturaM)
  return lectura === null ? null : lectura - mediana
}

// Nivel típico del río del tramo según el DEM: mediana del nivel de agua de las
// escuelas del tramo a <= 500 m del agua. Memoizado por estación.
function nivelRioDelTramo(datos: DatosRio, estacionId: string): number | null {
  datos.nivelTramoCache ??= new Map()
  const cacheado = datos.nivelTramoCache.get(estacionId)
  if (cacheado !== undefined) return cacheado
  const niveles: DatosDemEscuela[] = []
  for (const [cue, localidad] of datos.localidadPorCue) {
    if (!localidad || estacionParaLocalidad(localidad)?.estacionId !== estacionId) continue
    const dem = datos.demPorCue?.get(cue)
    if (dem) niveles.push(dem)
  }
  const nivel = nivelRioTramo(niveles)
  datos.nivelTramoCache.set(estacionId, nivel)
  return nivel
}

function anomaliaInterpoladaEscuela(
  datos: DatosRio,
  cueAnexo: string,
  rio: 'parana' | 'uruguay',
  asOf: string,
  asOfMs: number,
): number | null {
  const coordenadas = datos.coordenadasPorCue?.get(cueAnexo)
  if (!coordenadas) return null
  const estaciones: EstacionAnomalia[] = obtenerEstacionesPrefectura().filter(
    (e) => e.rol === 'corrientes' && e.rio === rio && e.coordenadas !== null,
  ).map((e) => ({
    estacionId: e.estacionId,
    lat: e.coordenadas!.lat,
    lon: e.coordenadas!.lon,
    anomaliaM: anomaliaEstacion(datos, e.estacionId, asOf, asOfMs),
  }))
  return anomaliaInterpolada(coordenadas, estaciones)?.anomaliaM ?? null
}

// Decide la evidencia del río para una escuela a partir de datos ya cargados.
// Función pura: sin base de datos ni reloj (asOf llega por parámetro).
//
// Exposición (cualquiera alcanza, en este orden):
// 1. DEM dinámico ("dem_estimado"): suelo de la escuela <= nivel de agua estimado
//    (nivel DEM del río junto a la escuela + anomalía actual interpolada entre
//    estaciones) + 1 m, a <= 500 m del río (ver motor/exposicion-dinamica.ts).
// 2. Criterios estáticos JRC/G1 (clase_rio, peligro fluvial, ruta RP100,
//    proximidad al agua, punto de río). El margen RP100 estático NO se usa: el
//    pipeline tenía un sesgo de ~10 m (ver odd/tasks/evidencia-riesgo-escuelas.md).
// 3. Fallback por cercanía a la estación, sólo sin datos de susceptibilidad.
// Costa de embalse aguas arriba de la represa => 'no_aplica'. Escuela expuesta
// sin lectura vigente (o sin referencia para el DEM) => 'sin_dato'.
export function resolverEvidenciaRio(
  datos: DatosRio,
  cueAnexo: string,
  asOf: string,
  opciones: OpcionesEvidenciaRio = {},
): EvidenciaRioPrefectura | EvidenciaRioNoDisponible | null {
  if (opciones.reglas === 'v0.4') return resolverEvidenciaRioV04(datos, cueAnexo, asOf, opciones)
  const localidad = datos.localidadPorCue.get(cueAnexo)
  if (!localidad) return null

  // Sólo tramos aprobados (comportamiento por defecto de estacionParaLocalidad).
  const tramo = estacionParaLocalidad(localidad)
  if (!tramo) return null

  const asOfMs = Date.parse(asOf)
  if (Number.isNaN(asOfMs)) return null
  const base = { cueAnexo, estacionId: tramo.estacionId, rio: tramo.rio }

  const dem = datos.demPorCue?.get(cueAnexo) ?? null
  const dinamica = evaluarExposicionDinamica(
    dem,
    nivelRioDelTramo(datos, tramo.estacionId),
    anomaliaInterpoladaEscuela(datos, cueAnexo, tramo.rio, asOf, asOfMs),
    obtenerEstacionesConRepresa().has(tramo.estacionId),
  )
  if (dinamica.tipo === 'no_aplica_embalse') {
    return { ...base, disponibilidad: 'no_aplica', motivo: `embalse aguas arriba de la represa: ${dinamica.detalle}` }
  }

  const susceptibilidad = datos.susceptibilidadPorCue.get(cueAnexo)
  const criterioEstatico = evaluarExposicionRio({
    claseRio: susceptibilidad?.claseRio ?? null,
    peligroInundacionFluvial: num(susceptibilidad?.peligroInundacionFluvial),
    distanciaAguaM: num(susceptibilidad?.distanciaAguaM),
    alturaSobreAguaM: num(susceptibilidad?.alturaSobreAguaM),
    juntoLaguna: susceptibilidad?.juntoLaguna ?? null,
    distanciaPuntoRioKm: num(datos.distanciaRioKmPorCue.get(cueAnexo)),
    margenRp100M: null,
    rutaProfundidadMaxM: num(datos.rutaProfundidadMaxMPorCue?.get(cueAnexo)),
    tieneDatosSusceptibilidad: susceptibilidad !== undefined,
    distanciaEstacionKm: distanciaAEstacionKm(datos, cueAnexo, tramo.estacionId),
  })
  const criterio =
    dinamica.tipo === 'expuesta' ? `dem_estimado: ${dinamica.detalle}` : criterioEstatico

  if (criterio === null) {
    // Sin criterio estático y el DEM no pudo evaluarse por falta de nivel
    // actual: posiblemente expuesta, nunca "no expuesta" por omisión.
    if (dinamica.tipo === 'sin_dato') {
      return { ...base, disponibilidad: 'sin_dato', motivo: `exposición DEM no evaluable: ${dinamica.detalle}` }
    }
    return null
  }

  const lectura = lecturaOficial(datos, tramo.estacionId, asOf, asOfMs)
  if ('motivo' in lectura) return { ...base, disponibilidad: 'sin_dato', motivo: lectura.motivo }
  return { ...base, ...lectura, criterioExposicion: criterio }
}

type LecturaOficial = Pick<EvidenciaRioPrefectura, 'lecturaM' | 'alertaM' | 'evacuacionM' | 'variacionM' | 'medidaEn' | 'estado'>

// Lectura vigente (<= 24 h) con estado oficial, o el motivo de sin_dato.
function lecturaOficial(datos: DatosRio, estacionId: string, asOf: string, asOfMs: number): LecturaOficial | { motivo: string } {
  const ultima = ultimaLectura(datos, estacionId, asOfMs)
  if (ultima === null || !lecturaVigente(ultima.medidaEn, asOf)) {
    return { motivo: `sin lectura vigente (<= 24 h) de ${estacionId}` }
  }
  const lecturaM = num(ultima.lecturaM)
  if (lecturaM === null) return { motivo: `lectura no numérica de ${estacionId}` }
  const alertaM = num(ultima.alertaM)
  const evacuacionM = num(ultima.evacuacionM)
  const estado = estadoDeLectura(lecturaM, alertaM, evacuacionM)
  if (estado === null) return { motivo: `${estacionId} sin umbrales oficiales` }
  return { lecturaM, alertaM, evacuacionM, variacionM: num(ultima.variacionM), medidaEn: ultima.medidaEn, estado }
}

// Reglas v0.4 (F3, motor/exposicion-v04.ts): el terreno contra el agua
// posible por horizonte decide el piso; las capas gruesas (WRI, ruta RP100,
// agua GSW, punto de río, cercanía a la estación) salen de la exposición y
// sólo `clase_rio` JRC queda como respaldo no evaluable. Con lectura vigente la
// evidencia se devuelve aunque ningún horizonte alcance: el cálculo decide (la
// zona modelada usa la probabilidad; el resto registra un factor sin peso).
// Referencia v0.4 de una estación (T10c): mediana de largo plazo; sin ella, la
// mediana de 365 días marcada como inestable.
function referenciaV04(
  datos: DatosRio,
  referencias: ReadonlyMap<string, ReferenciaNivelEstacion> | undefined,
  estacionId: string,
): { medianaM: number; inestable: boolean } | null {
  const larga = referencias?.get(estacionId)?.medianaLargoPlazoM ?? null
  if (larga !== null) return { medianaM: larga, inestable: false }
  const corta = datos.medianaPorEstacion?.get(estacionId)
  return corta === undefined || corta === null ? null : { medianaM: corta, inestable: true }
}

function lecturaVigenteM(datos: DatosRio, estacionId: string, asOf: string, asOfMs: number): number | null {
  const ultima = ultimaLectura(datos, estacionId, asOfMs)
  return ultima === null || !lecturaVigente(ultima.medidaEn, asOf) ? null : num(ultima.lecturaM)
}

// Anomalía interpolada v0.4; inestable si alguna estación usada no tiene
// referencia de largo plazo.
function anomaliaV04(
  datos: DatosRio,
  referencias: ReadonlyMap<string, ReferenciaNivelEstacion> | undefined,
  cueAnexo: string,
  rio: 'parana' | 'uruguay',
  asOf: string,
  asOfMs: number,
): { anomaliaM: number; inestable: boolean } | null {
  const coordenadas = datos.coordenadasPorCue?.get(cueAnexo)
  if (!coordenadas) return null
  const inestables = new Set<string>()
  const estaciones: EstacionAnomalia[] = obtenerEstacionesPrefectura().filter(
    (e) => e.rol === 'corrientes' && e.rio === rio && e.coordenadas !== null,
  ).map((e) => {
    const ref = referenciaV04(datos, referencias, e.estacionId)
    const h = lecturaVigenteM(datos, e.estacionId, asOf, asOfMs)
    if (ref?.inestable) inestables.add(e.estacionId)
    return { estacionId: e.estacionId, lat: e.coordenadas!.lat, lon: e.coordenadas!.lon, anomaliaM: ref && h !== null ? h - ref.medianaM : null }
  })
  const r = anomaliaInterpolada(coordenadas, estaciones)
  if (!r) return null
  return { anomaliaM: r.anomaliaM, inestable: inestables.has(r.desde) || (r.t > 0 && inestables.has(r.hasta)) }
}

function resolverEvidenciaRioV04(
  datos: DatosRio,
  cueAnexo: string,
  asOf: string,
  { escenarios, referencias, maximosEscala, cerosEfectivos = CEROS_EFECTIVOS_V04 }: OpcionesEvidenciaRio,
): EvidenciaRioPrefectura | EvidenciaRioNoDisponible | null {
  const localidad = datos.localidadPorCue.get(cueAnexo)
  if (!localidad) return null
  const tramo = estacionParaLocalidad(localidad)
  if (!tramo) return null
  const asOfMs = Date.parse(asOf)
  if (Number.isNaN(asOfMs)) return null
  const base = { cueAnexo, estacionId: tramo.estacionId, rio: tramo.rio }

  const anomalia = anomaliaV04(datos, referencias, cueAnexo, tramo.rio, asOf, asOfMs)
  const exposicion = evaluarExposicionV04({
    dem: datos.demPorCue?.get(cueAnexo) ?? null,
    nivelRioTramoM: nivelRioDelTramo(datos, tramo.estacionId),
    anomaliaM: anomalia?.anomaliaM ?? null,
    referencia: anomalia?.inestable ? 'mediana_365_inestable' : 'largo_plazo',
    h0M: lecturaVigenteM(datos, tramo.estacionId, asOf, asOfMs),
    ceroEfectivo: cerosEfectivos[tramo.estacionId] ?? null,
    hReferenciaM: referenciaV04(datos, referencias, tramo.estacionId)?.medianaM ?? null,
    record: referencias?.get(tramo.estacionId)?.record ?? null,
    represaAguasArriba: obtenerEstacionesConRepresa().has(tramo.estacionId),
    claseRio: datos.susceptibilidadPorCue.get(cueAnexo)?.claseRio ?? null,
    escenario: escenarios?.get(tramo.estacionId) ?? null,
    estacionId: tramo.estacionId,
    maximosEscala: maximosEscala?.get(tramo.estacionId) ?? null,
    evidenciaSeco: evidenciaSecoS2(cueAnexo),
    defensa: defensaDeLocalidad(localidad),
  })
  if (exposicion.tipo === 'no_aplica_embalse') {
    return { ...base, disponibilidad: 'no_aplica', motivo: `embalse aguas arriba de la represa: ${exposicion.detalle}` }
  }
  if (exposicion.tipo === 'sin_dato') {
    return { ...base, disponibilidad: 'sin_dato', motivo: `exposición v0.4 no evaluable: ${exposicion.detalle}` }
  }
  const alcanzable = Object.values(exposicion.porHorizonte).some((e) => e.alcance !== 'ninguno')
  const lectura = lecturaOficial(datos, tramo.estacionId, asOf, asOfMs)
  if ('motivo' in lectura) return alcanzable ? { ...base, disponibilidad: 'sin_dato', motivo: lectura.motivo } : null
  return {
    ...base,
    ...lectura,
    criterioExposicion: alcanzable ? 'exposicion_v0.4' : 'no_alcanzable_v0.4',
    exposicionV04: exposicion.porHorizonte,
  }
}

// Carga única de todas las fuentes necesarias. Cada tabla se lee en batch.
export async function cargarDatosRioDesdeDb(): Promise<DatosRio> {
  await cargarReferencias()
  const db = getDb()
  const [
    resLocalidad,
    filasSusceptibilidad,
    filasGeo,
    filasLectura,
    filasPerfil,
    filasRuta,
    filasDem,
    filasReferencia,
  ] = await Promise.all([
    db.execute(sql`select cue_anexo, localidad from ge.ge_localizacion`),
    db.select().from(infraSusceptibilidadEstatica),
    db.select().from(infraGeoRio),
    db
      .select({
        estacionId: hidroLectura.estacionId,
        lecturaM: hidroLectura.lecturaM,
        alertaM: hidroLectura.alertaM,
        evacuacionM: hidroLectura.evacuacionM,
        variacionM: hidroLectura.variacionM,
        medidaEn: hidroLectura.medidaEn,
        inconsistente: hidroLectura.inconsistente,
      })
      .from(hidroLectura),
    db
      .select({ cueAnexo: infraGeoProfile.cueAnexo, lat: infraGeoProfile.lat, lon: infraGeoProfile.lon })
      .from(infraGeoProfile),
    db
      .select({
        cueAnexo: infraExposicionRutaInundacion.cueAnexo,
        profundidadMaxM: infraExposicionRutaInundacion.profundidadMaxM,
      })
      .from(infraExposicionRutaInundacion),
    db.select().from(infraExposicionRioDem),
    db
      .select({ estacionId: hidroReferencia.estacionId, medianaM: hidroReferencia.medianaM })
      .from(hidroReferencia)
      .where(eq(hidroReferencia.ventanaDias, VENTANA_REFERENCIA_DIAS)),
  ])

  // El driver puede devolver { rows } o directamente el array.
  const filasLocalidad = (
    Array.isArray(resLocalidad) ? resLocalidad : ((resLocalidad as { rows?: unknown[] }).rows ?? [])
  ) as Array<{ cue_anexo: string; localidad: string | null }>

  const localidadPorCue = new Map<string, string | null>()
  for (const fila of filasLocalidad) {
    localidadPorCue.set(fila.cue_anexo, fila.localidad)
  }

  const susceptibilidadPorCue = new Map<string, FilaSusceptibilidadRio>()
  for (const [cue, fila] of ultimaFilaConservadoraPorCue(filasSusceptibilidad)) {
    susceptibilidadPorCue.set(cue, {
      claseRio: fila.claseRio,
      peligroInundacionFluvial: fila.peligroInundacionFluvial,
      distanciaAguaM: fila.distanciaAguaM,
      alturaSobreAguaM: fila.alturaSobreAguaM,
      juntoLaguna: fila.juntoLaguna,
      margenRp100M: fila.margenRp100M,
    })
  }

  const distanciaRioKmPorCue = new Map<string, Numerico>()
  for (const fila of filasGeo) {
    distanciaRioKmPorCue.set(fila.cueAnexo, fila.distanciaKm)
  }

  const coordenadasPorCue = new Map<string, { lat: number; lon: number }>()
  for (const fila of filasPerfil) {
    const lat = num(fila.lat)
    const lon = num(fila.lon)
    if (lat !== null && lon !== null) coordenadasPorCue.set(fila.cueAnexo, { lat, lon })
  }

  // Varias versiones por escuela: se toma la mayor profundidad (conservador).
  const rutaProfundidadMaxMPorCue = new Map<string, Numerico>()
  for (const fila of filasRuta) {
    const actual = num(rutaProfundidadMaxMPorCue.get(fila.cueAnexo))
    const nueva = num(fila.profundidadMaxM)
    if (nueva !== null && (actual === null || nueva > actual)) rutaProfundidadMaxMPorCue.set(fila.cueAnexo, nueva)
  }

  // Varias versiones por escuela: gana la de versionJob numéricamente mayor.
  const demPorCue = new Map<string, DatosDemEscuela>()
  const versionDemPorCue = new Map<string, number>()
  for (const fila of filasDem) {
    const version = Number(fila.versionJob)
    const previa = versionDemPorCue.get(fila.cueAnexo)
    if (previa !== undefined && !(version > previa)) continue
    versionDemPorCue.set(fila.cueAnexo, version)
    demPorCue.set(fila.cueAnexo, {
      sueloM: num(fila.sueloM),
      nivelRioDemM: num(fila.nivelRioDemM),
      distanciaRioM: num(fila.distanciaRioM),
    })
  }

  const medianaPorEstacion = new Map<string, number>()
  for (const fila of filasReferencia) {
    const mediana = num(fila.medianaM)
    if (mediana !== null) medianaPorEstacion.set(fila.estacionId, mediana)
  }

  return {
    demPorCue,
    medianaPorEstacion,
    coordenadasPorCue,
    rutaProfundidadMaxMPorCue,
    localidadPorCue,
    susceptibilidadPorCue,
    distanciaRioKmPorCue,
    lecturas: filasLectura,
  }
}

export function crearAdapterRioPrefectura(
  deps: DependenciasAdapterRioPrefectura = {},
): PuertoRioPrefectura {
  const cargarDatos = deps.cargarDatos ?? cargarDatosRioDesdeDb
  const opciones: OpcionesEvidenciaRio = { reglas: deps.reglas, escenarios: deps.escenarios, referencias: deps.referencias, maximosEscala: deps.maximosEscala }
  let cache: Promise<DatosRio> | null = null

  function cargar(): Promise<DatosRio> {
    if (cache === null) cache = cargarDatos()
    return cache
  }

  return {
    async obtenerEvidencia({ cueAnexo, asOf }) {
      const datos = await cargar()
      return resolverEvidenciaRio(datos, cueAnexo, asOf, opciones)
    },
  }
}
