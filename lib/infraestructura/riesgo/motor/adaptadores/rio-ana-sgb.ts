// Adapters neutrales de nivel de río para el puerto PuertoNivelRio: ANA
// (estaciones telemétricas del dataset `estacoes-ana`, cuenca Negro o Solimões)
// y SGB (estación MAO - Manaus del SACE, Río Negro).
//
// Exposición: sólo por proximidad a la ribera (distancia de la escuela al río
// <= DISTANCIA_RIBERA_MAXIMA_KM). Sin terreno (B12.4) no se infiere exposición:
// una escuela que no es ribereña devuelve null, nunca una exposición inventada.
//
// Contrato: null es "sin evidencia". Nunca se imputa "normal" cuando falta
// umbral, lectura vigente o lectura numérica consistente.
import { sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { infraGeoProfile, infraGeoRio } from '@/lib/db/schema'
import { estacionesAnaTelemetricas } from '@/lib/infraestructura/hidrometria/estaciones-ana'
import { ESTACION_SGB_MANAUS } from '@/lib/infraestructura/hidrometria/sgb/estacion-sgb'
import { EDAD_MAXIMA_LECTURA_HORAS } from '@/lib/infraestructura/hidrometria/estado-altura'
import type { EvidenciaRioNoDisponible, EvidenciaRioPrefectura, PuertoNivelRio } from '../puertos'

export type EstacionNivel = {
  estacionId: string
  rio: 'negro' | 'solimoes'
  lat: number
  lon: number
  alertaM: number | null
  evacuacionM: number | null
}

export type LecturaNivel = {
  estacionId: string
  lecturaM: number | null
  variacionM: number | null
  medidaEn: string
  inconsistente: boolean | null
}

export type DatosNivelRio = {
  estaciones: EstacionNivel[]
  // Última lectura por estación (la más reciente de cada estacionId).
  ultimaLecturaPorEstacion: Map<string, LecturaNivel>
  coordenadasPorCue: Map<string, { lat: number; lon: number }>
  distanciaRioKmPorCue: Map<string, number | string | null>
}

export const RADIO_MAXIMO_ESTACION_KM = 60
export const DISTANCIA_RIBERA_MAXIMA_KM = 1

// Una lectura posterior a asOf por más de esto se descarta (reloj de la fuente).
const TOLERANCIA_FUTURO_MS = 15 * 60 * 1000
const MS_POR_HORA = 3_600_000

type Numerico = number | string | null | undefined

// Convierte a número; null, vacío o NaN quedan como null.
function num(valor: Numerico): number | null {
  if (valor === null || valor === undefined) return null
  if (typeof valor === 'string' && valor.trim() === '') return null
  const n = Number(valor)
  return Number.isNaN(n) ? null : n
}

function distanciaKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = (g: number) => (g * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

function estacionMasCercana(
  estaciones: readonly EstacionNivel[],
  punto: { lat: number; lon: number },
): { estacion: EstacionNivel; distanciaKm: number } | null {
  let mejor: { estacion: EstacionNivel; distanciaKm: number } | null = null
  for (const estacion of estaciones) {
    const d = distanciaKm(punto, estacion)
    if (mejor === null || d < mejor.distanciaKm) mejor = { estacion, distanciaKm: d }
  }
  return mejor
}

// Decide la evidencia del río para una escuela a partir de datos ya cargados.
// Función pura: sin base de datos ni reloj (asOf llega por parámetro).
export function resolverEvidenciaNivelRio(
  datos: DatosNivelRio,
  cueAnexo: string,
  asOf: string,
): EvidenciaRioPrefectura | EvidenciaRioNoDisponible | null {
  const coordenadas = datos.coordenadasPorCue.get(cueAnexo)
  const distanciaRio = num(datos.distanciaRioKmPorCue.get(cueAnexo))
  if (!coordenadas || distanciaRio === null || distanciaRio > DISTANCIA_RIBERA_MAXIMA_KM) return null

  const asOfMs = Date.parse(asOf)
  if (Number.isNaN(asOfMs)) return null

  const cercana = estacionMasCercana(datos.estaciones, coordenadas)
  if (cercana === null || cercana.distanciaKm > RADIO_MAXIMO_ESTACION_KM) return null
  const estacion = cercana.estacion
  const base = { cueAnexo, estacionId: estacion.estacionId, rio: estacion.rio }
  const sinDato = (motivo: string): EvidenciaRioNoDisponible => ({ ...base, disponibilidad: 'sin_dato', motivo })

  if (estacion.alertaM === null || estacion.evacuacionM === null) return sinDato('estación sin umbrales')

  const ultima = datos.ultimaLecturaPorEstacion.get(estacion.estacionId)
  if (ultima === undefined) return sinDato('sin lectura')
  if (ultima.inconsistente === true) return sinDato('lectura inconsistente')
  if (ultima.lecturaM === null || Number.isNaN(ultima.lecturaM)) return sinDato('lectura no numérica')

  const medidaMs = Date.parse(ultima.medidaEn)
  if (Number.isNaN(medidaMs)) return sinDato('fecha de lectura inválida')
  if (medidaMs > asOfMs + TOLERANCIA_FUTURO_MS) return sinDato('lectura posterior a asOf')
  if (asOfMs - medidaMs > EDAD_MAXIMA_LECTURA_HORAS * MS_POR_HORA) {
    return sinDato(`lectura vencida (> ${EDAD_MAXIMA_LECTURA_HORAS} h)`)
  }

  const lecturaM = ultima.lecturaM
  const estado =
    lecturaM >= estacion.evacuacionM ? 'evacuacion' : lecturaM >= estacion.alertaM ? 'alerta' : 'normal'
  return {
    ...base,
    lecturaM,
    alertaM: estacion.alertaM,
    evacuacionM: estacion.evacuacionM,
    variacionM: ultima.variacionM,
    medidaEn: ultima.medidaEn,
    estado,
    criterioExposicion: 'proximidad_ribera',
  }
}

export type DependenciasAdapterRioNivel = {
  // Punto de inyección para tests: por defecto consulta la DB real.
  cargarDatos?: () => Promise<DatosNivelRio>
}

// Carga de DB para una fuente de lecturas (`ana` | `sgb`). Estaciones y
// umbrales vienen del catálogo; la DB aporta lecturas y geometría de escuelas.
async function cargarDatosNivelDesdeDb(
  fuente: 'ana' | 'sgb',
  estaciones: EstacionNivel[],
): Promise<DatosNivelRio> {
  const db = getDb()
  const [resLecturas, filasPerfil, filasGeo] = await Promise.all([
    db.execute(
      sql`select distinct on (estacion_id) estacion_id, lectura_m, variacion_m, medida_en, inconsistente
          from hidro_lectura where fuente = ${fuente} order by estacion_id, medida_en desc`,
    ),
    db.select({ cueAnexo: infraGeoProfile.cueAnexo, lat: infraGeoProfile.lat, lon: infraGeoProfile.lon }).from(infraGeoProfile),
    db.select({ cueAnexo: infraGeoRio.cueAnexo, distanciaKm: infraGeoRio.distanciaKm }).from(infraGeoRio),
  ])

  // El driver puede devolver { rows } o directamente el array.
  const filasLectura = (
    Array.isArray(resLecturas) ? resLecturas : ((resLecturas as { rows?: unknown[] }).rows ?? [])
  ) as Array<{
    estacion_id: string
    lectura_m: Numerico
    variacion_m: Numerico
    medida_en: string
    inconsistente: boolean | null
  }>

  const ultimaLecturaPorEstacion = new Map<string, LecturaNivel>()
  for (const fila of filasLectura) {
    ultimaLecturaPorEstacion.set(fila.estacion_id, {
      estacionId: fila.estacion_id,
      lecturaM: num(fila.lectura_m),
      variacionM: num(fila.variacion_m),
      medidaEn: fila.medida_en,
      inconsistente: fila.inconsistente,
    })
  }

  const coordenadasPorCue = new Map<string, { lat: number; lon: number }>()
  for (const fila of filasPerfil) {
    const lat = num(fila.lat)
    const lon = num(fila.lon)
    if (lat !== null && lon !== null) coordenadasPorCue.set(fila.cueAnexo, { lat, lon })
  }

  const distanciaRioKmPorCue = new Map<string, number | string | null>()
  for (const fila of filasGeo) {
    distanciaRioKmPorCue.set(fila.cueAnexo, fila.distanciaKm)
  }

  return { estaciones, ultimaLecturaPorEstacion, coordenadasPorCue, distanciaRioKmPorCue }
}

function estacionesAnaParaNivel(): EstacionNivel[] {
  return estacionesAnaTelemetricas().map((e) => ({
    estacionId: e.estacionId,
    rio: /negro/i.test(e.rio ?? '') ? 'negro' : 'solimoes',
    lat: e.lat,
    lon: e.lon,
    alertaM: e.alertaM,
    evacuacionM: e.evacuacionM,
  }))
}

const ESTACIONES_SGB_PARA_NIVEL: EstacionNivel[] = [
  {
    estacionId: ESTACION_SGB_MANAUS.estacionId,
    rio: ESTACION_SGB_MANAUS.rio,
    lat: ESTACION_SGB_MANAUS.lat,
    lon: ESTACION_SGB_MANAUS.lon,
    alertaM: ESTACION_SGB_MANAUS.alertaM,
    evacuacionM: ESTACION_SGB_MANAUS.evacuacionM,
  },
]

// Adapter con una sola carga por instancia (memoizada en el closure).
function crearAdapterRioNivel(cargarDatos: () => Promise<DatosNivelRio>): PuertoNivelRio {
  let cache: Promise<DatosNivelRio> | null = null
  return {
    async obtenerEvidencia({ cueAnexo, asOf }) {
      if (cache === null) cache = cargarDatos()
      return resolverEvidenciaNivelRio(await cache, cueAnexo, asOf)
    },
  }
}

export function crearAdapterRioAna(deps: DependenciasAdapterRioNivel = {}): PuertoNivelRio {
  return crearAdapterRioNivel(deps.cargarDatos ?? (() => cargarDatosNivelDesdeDb('ana', estacionesAnaParaNivel())))
}

export function crearAdapterRioSgb(deps: DependenciasAdapterRioNivel = {}): PuertoNivelRio {
  return crearAdapterRioNivel(deps.cargarDatos ?? (() => cargarDatosNivelDesdeDb('sgb', ESTACIONES_SGB_PARA_NIVEL)))
}
