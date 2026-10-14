// Señales de pronóstico por día ART: caudal de ríos (GloFAS), probabilidades de
// ensamble por celda y avisos SMN. Cada lector filtra `valido_en` dentro del
// rango UTC del día y usa sólo la corrida más reciente por clave de geometría.
import { and, desc, eq, gte, inArray, lt } from 'drizzle-orm'
import { normalizarNombreDepartamento } from '@/lib/mapas/normalizar-departamento'
import { hazardClimatology, hazardEnsembleProb, hazardForecast, smnAlerta } from '@/lib/db/schema'
import { PUNTOS_RIO, puntoRioPorId } from '@/lib/infraestructura/riesgo/puntos-rio'
import { departamentoDeCelda, departamentoDeCoordenada } from './celda-departamento'
import { rangoUtcDeDiaArt, sumarDias } from './dia'
import {
  percentilClimatologico,
  type AmbitoLluvia,
  type PercentilLluvia,
  type UmbralesLluvia,
} from './lluvia-observada'
import type { Db } from './repositorio'

// Muestra de la climatología de caudal: siempre todos los días (a diferencia de
// precipitación, que también usa `dias_humedos`).
const MUESTRA_CAUDAL = 'todos_los_dias'
const VARIABLE_CLIMATOLOGIA_CAUDAL = 'caudal_diario'
const VARIABLE_CAUDAL = 'caudal'

export type CaudalDia = {
  puntoId: string
  nombre: string
  departamento: string | null
  picoM3s: number
  picoEn: string
  corridaEn: string
  percentil: PercentilLluvia | null
}

export type EnsambleDia = {
  departamento: string
  probP95Max: number
  probP99Max: number
  corridaEn: string
}

export type NivelAvisoSmn = 'amarillo' | 'naranja' | 'rojo'

export type AvisoSmnDia = {
  departamento: string
  nivel: NivelAvisoSmn
  avisoId: string
  evento: string
  desde: string
  hasta: string
}

// `smn_alerta.nivel_sat` se persiste siempre nulo (`radar-meteo/smn-alertas.ts:446`),
// así que el color sale de la `severity` CAP según la equivalencia del SMN:
// Moderate = amarillo, Severe = naranja, Extreme = rojo. Minor/Unknown no cuentan.
const SEVERIDAD_CAP_A_COLOR: Record<string, NivelAvisoSmn> = {
  Moderate: 'amarillo',
  Severe: 'naranja',
  Extreme: 'rojo',
}
const GRAVEDAD_NIVEL: Record<NivelAvisoSmn, number> = { amarillo: 1, naranja: 2, rojo: 3 }

// Umbrales de caudal por punto: última versión de cada percentil (mismo criterio
// de orden que `leerUmbralesLluviaDiaria`).
async function leerUmbralesCaudal(db: Db, geometryRefs: string[]): Promise<Map<string, UmbralesLluvia>> {
  const umbralesPorPunto = new Map<string, UmbralesLluvia>()
  if (geometryRefs.length === 0) return umbralesPorPunto
  const filas = await db
    .select({
      geometryRef: hazardClimatology.geometryRef,
      percentil: hazardClimatology.percentil,
      valor: hazardClimatology.valor,
    })
    .from(hazardClimatology)
    .where(
      and(
        inArray(hazardClimatology.geometryRef, geometryRefs),
        eq(hazardClimatology.variable, VARIABLE_CLIMATOLOGIA_CAUDAL),
        eq(hazardClimatology.muestra, MUESTRA_CAUDAL),
      ),
    )
    .orderBy(
      desc(hazardClimatology.periodoHasta),
      desc(hazardClimatology.version),
      desc(hazardClimatology.calculadoEn),
    )
  for (const fila of filas) {
    const umbrales = umbralesPorPunto.get(fila.geometryRef) ?? {}
    const clave = fila.percentil
    if ((clave === 'p90' || clave === 'p95' || clave === 'p99') && umbrales[clave] === undefined) {
      umbrales[clave] = fila.valor
    }
    umbralesPorPunto.set(fila.geometryRef, umbrales)
  }
  return umbralesPorPunto
}

/**
 * Pico diario de caudal por punto de río (`PUNTOS_RIO`) para el día ART `fecha`,
 * usando la corrida más reciente que cubre ese día. `percentil` compara el pico
 * con la climatología `caudal_diario` (muestra `todos_los_dias`).
 */
export async function leerCaudalDia(db: Db, fecha: string): Promise<CaudalDia[]> {
  // GloFAS publica caudal DIARIO anclado a `${fecha}T00:00:00Z`: se filtra por
  // día calendario UTC (no por el rango ART, que tomaría el valor de D+1).
  const desde = `${fecha}T00:00:00`
  const hasta = `${sumarDias(fecha, 1)}T00:00:00`
  const filas = await db
    .select()
    .from(hazardForecast)
    .where(
      and(
        eq(hazardForecast.variable, VARIABLE_CAUDAL),
        gte(hazardForecast.validoEn, desde),
        lt(hazardForecast.validoEn, hasta),
        inArray(hazardForecast.geometryRef, PUNTOS_RIO.map((p) => p.id)),
      ),
    )

  // Corrida más reciente por punto, sólo entre las filas del día.
  const ultimaCorrida = new Map<string, string>()
  for (const fila of filas) {
    const actual = ultimaCorrida.get(fila.geometryRef)
    if (actual === undefined || fila.corridaEn > actual) ultimaCorrida.set(fila.geometryRef, fila.corridaEn)
  }

  const umbrales = await leerUmbralesCaudal(db, [...ultimaCorrida.keys()])
  const salida: CaudalDia[] = []
  for (const [puntoId, corridaEn] of ultimaCorrida) {
    const punto = puntoRioPorId(puntoId)
    if (!punto) continue
    const pico = filas
      .filter((f) => f.geometryRef === puntoId && f.corridaEn === corridaEn)
      .reduce((mejor, f) => (mejor === null || f.valor > mejor.valor ? f : mejor), null as (typeof filas)[number] | null)
    if (!pico) continue
    salida.push({
      puntoId,
      nombre: punto.localidad,
      departamento: departamentoDeCoordenada(punto.lat, punto.lon),
      picoM3s: pico.valor,
      picoEn: pico.validoEn,
      corridaEn,
      percentil: percentilClimatologico(pico.valor, umbrales.get(puntoId) ?? {}),
    })
  }
  return salida
}

/**
 * Máximo de probabilidad P95/P99 de ensamble por departamento para el día ART
 * `fecha`. Las probabilidades se devuelven tal como están guardadas (fracción
 * 0..1, p. ej. 0.6 = 60 %). Se usa la corrida más reciente por celda y variable;
 * las celdas sin departamento se descartan.
 */
export async function leerEnsambleDia(db: Db, fecha: string): Promise<EnsambleDia[]> {
  const { desde, hasta } = rangoUtcDeDiaArt(fecha)
  const filas = await db
    .select()
    .from(hazardEnsembleProb)
    .where(and(gte(hazardEnsembleProb.validoEn, desde), lt(hazardEnsembleProb.validoEn, hasta)))

  const ultimas = new Map<string, (typeof filas)[number]>()
  for (const fila of filas) {
    const clave = `${fila.geometryRef}|${fila.variable}`
    const actual = ultimas.get(clave)
    if (!actual || fila.corridaEn > actual.corridaEn) ultimas.set(clave, fila)
  }

  const porDepartamento = new Map<string, EnsambleDia>()
  for (const fila of ultimas.values()) {
    const departamento = departamentoDeCelda(fila.geometryRef)
    if (departamento === null) continue
    const previo = porDepartamento.get(departamento)
    porDepartamento.set(departamento, {
      departamento,
      probP95Max: Math.max(previo?.probP95Max ?? -Infinity, fila.probabilidadP95),
      probP99Max: Math.max(previo?.probP99Max ?? -Infinity, fila.probabilidadP99),
      corridaEn: previo && previo.corridaEn > fila.corridaEn ? previo.corridaEn : fila.corridaEn,
    })
  }
  return [...porDepartamento.values()]
}

export const PROVEEDOR_LLUVIA_ECMWF = 'open-meteo-ecmwf'
const VARIABLE_LLUVIA_ECMWF = 'precipitacion'
// Una celda con menos horas que esto tiene horizonte parcial: no cuenta para el día.
const MIN_HORAS_LLUVIA_PRONOSTICO = 20

export type LluviaPronosticadaDia = {
  ambito: AmbitoLluvia
  maxMm: number
  celdaMax: string
  horas: number
}

function acumularMaximo(
  mapa: Map<AmbitoLluvia, LluviaPronosticadaDia>,
  ambito: AmbitoLluvia,
  celda: string,
  mm: number,
  horas: number,
): void {
  const previo = mapa.get(ambito)
  if (!previo) {
    mapa.set(ambito, { ambito, maxMm: mm, celdaMax: celda, horas })
    return
  }
  const gana = mm > previo.maxMm
  mapa.set(ambito, {
    ambito,
    maxMm: gana ? mm : previo.maxMm,
    celdaMax: gana ? celda : previo.celdaMax,
    horas: Math.min(previo.horas, horas),
  })
}

/**
 * Lluvia pronosticada (ECMWF vía Open-Meteo, horaria en mm) para el día ART `fecha`.
 * Usa la corrida más reciente por celda, suma sus horas dentro del día ART y
 * descarta celdas con menos de 20 h. Devuelve la provincia (máximo de todas las
 * celdas con departamento) y el máximo por departamento.
 */
export async function leerLluviaPronosticadaDia(db: Db, fecha: string): Promise<LluviaPronosticadaDia[]> {
  const { desde, hasta } = rangoUtcDeDiaArt(fecha)
  const filas = await db
    .select()
    .from(hazardForecast)
    .where(
      and(
        eq(hazardForecast.provider, PROVEEDOR_LLUVIA_ECMWF),
        eq(hazardForecast.variable, VARIABLE_LLUVIA_ECMWF),
        gte(hazardForecast.validoEn, desde),
        lt(hazardForecast.validoEn, hasta),
      ),
    )

  const ultimaCorrida = new Map<string, string>()
  for (const fila of filas) {
    const actual = ultimaCorrida.get(fila.geometryRef)
    if (actual === undefined || fila.corridaEn > actual) ultimaCorrida.set(fila.geometryRef, fila.corridaEn)
  }

  const porCelda = new Map<string, { suma: number; horas: number }>()
  for (const fila of filas) {
    if (fila.corridaEn !== ultimaCorrida.get(fila.geometryRef)) continue
    const acum = porCelda.get(fila.geometryRef) ?? { suma: 0, horas: 0 }
    acum.suma += fila.valor
    acum.horas += 1
    porCelda.set(fila.geometryRef, acum)
  }

  const salida = new Map<AmbitoLluvia, LluviaPronosticadaDia>()
  for (const [celda, { suma, horas }] of porCelda) {
    if (horas < MIN_HORAS_LLUVIA_PRONOSTICO) continue
    const departamento = departamentoDeCelda(celda)
    if (departamento === null) continue
    const mm = Math.round(suma * 10) / 10
    acumularMaximo(salida, 'provincia', celda, mm, horas)
    acumularMaximo(salida, `departamento:${departamento}`, celda, mm, horas)
  }
  return [...salida.values()]
}

/**
 * Avisos SMN no cancelados cuyo intervalo [onset, expires) se superpone con el
 * día ART `fecha`. Por departamento (nombre normalizado) queda el peor nivel;
 * a igual nivel gana el primer aviso encontrado. `nivel_sat` se traduce con
 * NIVEL_SAT_A_COLOR; valores desconocidos se ignoran.
 */
export async function leerAvisosSmnDia(db: Db, fecha: string): Promise<AvisoSmnDia[]> {
  const { desde, hasta } = rangoUtcDeDiaArt(fecha)
  const desdeMs = Date.parse(desde)
  const hastaMs = Date.parse(hasta)
  const filas = await db
    .select()
    .from(smnAlerta)
    .where(eq(smnAlerta.cancelada, false))
    .orderBy(desc(smnAlerta.sent))

  const porDepartamento = new Map<string, AvisoSmnDia>()
  for (const alerta of filas) {
    if (!alerta.onset || !alerta.expires) continue
    const nivel = SEVERIDAD_CAP_A_COLOR[alerta.severity]
    if (nivel === undefined) continue
    const onsetMs = Date.parse(alerta.onset)
    const expiresMs = Date.parse(alerta.expires)
    if (!(onsetMs < hastaMs && expiresMs > desdeMs)) continue

    for (const depto of alerta.departamentos) {
      const departamento = normalizarNombreDepartamento(depto.nombre)
      const previo = porDepartamento.get(departamento)
      if (previo && GRAVEDAD_NIVEL[previo.nivel] >= GRAVEDAD_NIVEL[nivel]) continue
      porDepartamento.set(departamento, {
        departamento,
        nivel,
        avisoId: alerta.id,
        evento: alerta.event,
        desde: alerta.onset,
        hasta: alerta.expires,
      })
    }
  }
  return [...porDepartamento.values()]
}
