// Lluvia observada por ámbito (provincia y departamento) para el veredicto diario
// (docs/propuestas/veredicto-diario-ia.md §6.1).
//
// Unidades: `hazard_observation` ya guarda el ACUMULADO de cada gránulo de media
// hora en mm (`precipitacion_observada_satelital`, unidad 'mm/30min'). La tasa
// IMERG en mm/h se convierte a acumulado (×0.5) en providers/imerg.ts, así que
// aquí se suma tal cual, sin volver a convertir.
//
// Pesos: el promedio es la media simple de las sumas diarias por celda. Las
// celdas de 0.1° son aproximadamente de igual área a esta latitud, así que el
// peso por área se reduce a peso igual.

import { and, desc, eq, gte, lt } from 'drizzle-orm'
import { hazardClimatology, hazardObservation } from '@/lib/db/schema'
import {
  PROVIDER_OBSERVADO,
  VARIABLE_OBSERVADA,
} from '@/lib/infraestructura/riesgo/peligro/observado'
import type { Db } from './repositorio'

// Gránulos IMERG de 30 min: 48 por día civil.
const GRANULOS_POR_DIA = 48

export type GranuloLluvia = { geometryRef: string; validoDesde: string; valor: number }

export type AmbitoLluvia = 'provincia' | `departamento:${string}`

export type LluviaObservadaAmbito = {
  ambito: AmbitoLluvia
  promMm: number
  maxMm: number
  celdaMax: string
  /** Gránulos recibidos / gránulos esperados del ámbito, en 0..1. */
  cobertura: number
  granulosEsperados: number
  granulosRecibidos: number
}

export function agregarLluviaObservada(params: {
  granulos: GranuloLluvia[]
  /** Celda (geometryRef) -> id de departamento. Solo las celdas presentes cuentan. */
  celdas: Map<string, string>
  /** Días civiles cubiertos por `granulos` (1 o 3). Solo afecta a los gránulos esperados. */
  dias: 1 | 3
}): LluviaObservadaAmbito[] {
  // Suma por celda y conjunto de instantes recibidos (un gránulo repetido cuenta una vez).
  const sumaPorCelda = new Map<string, number>()
  const instantesPorCelda = new Map<string, Set<string>>()
  for (const celda of params.celdas.keys()) {
    sumaPorCelda.set(celda, 0)
    instantesPorCelda.set(celda, new Set())
  }
  for (const granulo of params.granulos) {
    const instantes = instantesPorCelda.get(granulo.geometryRef)
    if (!instantes || instantes.has(granulo.validoDesde)) continue
    instantes.add(granulo.validoDesde)
    sumaPorCelda.set(granulo.geometryRef, (sumaPorCelda.get(granulo.geometryRef) ?? 0) + granulo.valor)
  }

  const celdasPorAmbito = new Map<AmbitoLluvia, string[]>()
  const agregar = (ambito: AmbitoLluvia, celda: string) => {
    const lista = celdasPorAmbito.get(ambito)
    if (lista) lista.push(celda)
    else celdasPorAmbito.set(ambito, [celda])
  }
  for (const [celda, departamento] of params.celdas) {
    agregar('provincia', celda)
    agregar(`departamento:${departamento}`, celda)
  }

  const ambitos = [...celdasPorAmbito.keys()].sort((a, b) => {
    if (a === 'provincia') return -1
    if (b === 'provincia') return 1
    return a.localeCompare(b)
  })

  return ambitos.map((ambito) => {
    const celdas = celdasPorAmbito.get(ambito) ?? []
    let suma = 0
    let maxMm = -Infinity
    let celdaMax = celdas[0] ?? ''
    let granulosRecibidos = 0
    for (const celda of celdas) {
      const sumaCelda = sumaPorCelda.get(celda) ?? 0
      suma += sumaCelda
      if (sumaCelda > maxMm) {
        maxMm = sumaCelda
        celdaMax = celda
      }
      granulosRecibidos += instantesPorCelda.get(celda)?.size ?? 0
    }
    const granulosEsperados = GRANULOS_POR_DIA * params.dias * celdas.length
    return {
      ambito,
      promMm: redondear1(suma / celdas.length),
      maxMm: redondear1(maxMm),
      celdaMax,
      cobertura: granulosEsperados === 0 ? 0 : granulosRecibidos / granulosEsperados,
      granulosEsperados,
      granulosRecibidos,
    }
  })
}

function redondear1(valor: number): number {
  return Math.round(valor * 10) / 10
}

/** Gránulos IMERG de lluvia observada con inicio en [desdeIso, hastaIso) (ventana ART en UTC). */
export async function leerGranulosImerg(
  db: Db,
  desdeIso: string,
  hastaIso: string,
): Promise<GranuloLluvia[]> {
  return db
    .select({
      geometryRef: hazardObservation.geometryRef,
      validoDesde: hazardObservation.validoDesde,
      valor: hazardObservation.valor,
    })
    .from(hazardObservation)
    .where(
      and(
        eq(hazardObservation.provider, PROVIDER_OBSERVADO),
        eq(hazardObservation.variable, VARIABLE_OBSERVADA),
        gte(hazardObservation.validoDesde, desdeIso),
        lt(hazardObservation.validoDesde, hastaIso),
      ),
    )
}

export type PercentilLluvia = 'bajo_p90' | 'p90' | 'p95' | 'p99'

export type UmbralesLluvia = { p90?: number; p95?: number; p99?: number }

/**
 * Posición de un valor diario frente a los umbrales climatológicos: el mayor
 * percentil alcanzado (`>=`). Con umbrales ausentes se usa sólo lo disponible;
 * sin ningún umbral no hay clasificación (null).
 */
export function percentilClimatologico(
  valor: number,
  umbrales: UmbralesLluvia,
): PercentilLluvia | null {
  if (umbrales.p90 === undefined && umbrales.p95 === undefined && umbrales.p99 === undefined) {
    return null
  }
  if (umbrales.p99 !== undefined && valor >= umbrales.p99) return 'p99'
  if (umbrales.p95 !== undefined && valor >= umbrales.p95) return 'p95'
  if (umbrales.p90 !== undefined && valor >= umbrales.p90) return 'p90'
  return 'bajo_p90'
}

/**
 * Umbrales p90/p95/p99 de `precipitacion_diaria` (muestra `dias_humedos`) para la
 * celda IMERG `geometryRef`.
 *
 * Clave: `hazard_climatology.geometry_ref` es la misma clave 0.1° (`lat_lon`) que
 * `hazard_observation`. climatologia.ts pide una serie por celda ERA5 y la replica
 * a todas las celdas 0.1° miembro, así que se consulta por la clave directa sin
 * mapeo a la celda ERA5.
 *
 * Versión: mismo orden que nivel.ts (periodoHasta, version, calculadoEn
 * descendentes); se toma la primera fila de cada percentil. Un percentil faltante
 * queda fuera del objeto.
 */
export async function leerUmbralesLluviaDiaria(
  db: Db,
  geometryRef: string,
): Promise<UmbralesLluvia> {
  const filas = await db
    .select({
      percentil: hazardClimatology.percentil,
      valor: hazardClimatology.valor,
    })
    .from(hazardClimatology)
    .where(
      and(
        eq(hazardClimatology.geometryRef, geometryRef),
        eq(hazardClimatology.variable, 'precipitacion_diaria'),
        eq(hazardClimatology.muestra, 'dias_humedos'),
      ),
    )
    .orderBy(
      desc(hazardClimatology.periodoHasta),
      desc(hazardClimatology.version),
      desc(hazardClimatology.calculadoEn),
    )

  const umbrales: UmbralesLluvia = {}
  for (const fila of filas) {
    const clave = fila.percentil
    if ((clave === 'p90' || clave === 'p95' || clave === 'p99') && umbrales[clave] === undefined) {
      umbrales[clave] = fila.valor
    }
  }
  return umbrales
}
