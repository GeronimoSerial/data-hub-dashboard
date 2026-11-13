import { describe, expect, it } from 'vitest'
import {
  crearPlan, TABLAS_IGNORADAS, TABLAS_VACIAS, tablasReconstruidas,
} from './lib/reconstruir-staging-plan.mjs'
import { validarClasificacion } from './reconstruir-staging.mjs'

const AUDITORIA = 'public.auditoria_evento'

describe('auditoria_evento en la reconstrucción de staging', () => {
  it('acepta una lista de tablas que incluye auditoria_evento', () => {
    const plan = crearPlan()
    const tablas = [...plan.map((p) => p.tabla), ...TABLAS_VACIAS, AUDITORIA]
    expect(() => validarClasificacion(tablas, plan)).not.toThrow()
  })

  it('no la copia desde producción ni la incluye en el TRUNCATE de staging', () => {
    const plan = crearPlan()
    const tablasDestino = [...plan.map((p) => p.tabla), ...TABLAS_VACIAS, AUDITORIA]
    expect(TABLAS_IGNORADAS).toContain(AUDITORIA)
    expect(plan.map((p) => p.tabla)).not.toContain(AUDITORIA)
    expect(tablasReconstruidas(tablasDestino)).not.toContain(AUDITORIA)
    expect(tablasReconstruidas(tablasDestino)).toEqual(expect.arrayContaining(['public.user', 'public.infra_parte']))
  })
})
