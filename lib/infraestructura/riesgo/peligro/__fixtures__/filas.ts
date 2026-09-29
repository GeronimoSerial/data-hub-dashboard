import { randomUUID } from 'node:crypto'
import type { getDb } from '@/lib/db'
import { hazardClimatology } from '@/lib/db/schema'
import type { hazardEnsembleProb, hazardForecast } from '@/lib/db/schema'

const CORRIDA_DEFAULT = '2026-09-26T00:00:00.000Z'

export function filaEnsemble(params: {
  geometryRef: string
  corridaEn?: string
  horizonteHoras: number
  validoEn: string
  probabilidadP95: number
  probabilidadP99: number
}): typeof hazardEnsembleProb.$inferInsert {
  const corridaEn = params.corridaEn ?? CORRIDA_DEFAULT
  return {
    id: randomUUID(),
    variable: 'precipitacion_24h',
    corridaEn,
    miembrosTotal: 51,
    miembrosValidos: 51,
    dispersion: 0,
    version: 'ensemble-v1',
    ingeridoEn: corridaEn,
    ...params,
  }
}

export function filaPronostico(params: {
  geometryRef: string
  variable: 'precipitacion' | 'caudal'
  corridaEn?: string
  horizonteHoras: number
  validoEn: string
  valor: number
}): typeof hazardForecast.$inferInsert {
  const corridaEn = params.corridaEn ?? CORRIDA_DEFAULT
  return {
    id: randomUUID(),
    provider: 'test',
    unidad: params.variable === 'caudal' ? 'm3/s' : 'mm',
    pasoHoras: 1,
    rawRef: null,
    corridaEn,
    ingeridoEn: corridaEn,
    ...params,
  }
}

export function filaClimatologia(params: {
  geometryRef: string
  variable: 'precipitacion_diaria' | 'caudal_diario'
  percentil: 'p90' | 'p95' | 'p99'
  valor: number
  calculadoEn?: string
}): typeof hazardClimatology.$inferInsert {
  return {
    id: randomUUID(),
    muestra: 'todos_los_dias',
    unidad: 'mm',
    periodoDesde: '1991-01-01',
    periodoHasta: '2020-12-31',
    version: 'climatologia-v1',
    calculadoEn: params.calculadoEn ?? CORRIDA_DEFAULT,
    ...params,
  }
}

export async function insertarClimatologia(
  db: ReturnType<typeof getDb>,
  geometryRef: string,
  variable: 'precipitacion_diaria' | 'caudal_diario',
  valores: { p90: number; p95: number; p99: number },
): Promise<void> {
  await db.insert(hazardClimatology).values([
    filaClimatologia({ geometryRef, variable, percentil: 'p90', valor: valores.p90 }),
    filaClimatologia({ geometryRef, variable, percentil: 'p95', valor: valores.p95 }),
    filaClimatologia({ geometryRef, variable, percentil: 'p99', valor: valores.p99 }),
  ])
}
