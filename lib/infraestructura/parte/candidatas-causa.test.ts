import { describe, expect, it } from 'vitest'
import { armarCandidatasCausa, type CandidataCausa } from './candidatas-causa'

const ahora = new Date('2026-10-05T12:00:00.000Z')

function candidata(id: string, fecha: string, activa: boolean, motivo = id): CandidataCausa {
  return { id, fecha, activa, motivo }
}

describe('armarCandidatasCausa', () => {
  it('deduplica por situación y prioriza el registro activo', () => {
    const candidatas = armarCandidatasCausa([
      candidata('a', '2026-10-04T10:00:00.000Z', false, 'Cerrada duplicada'),
      candidata('a', '2026-10-01T10:00:00.000Z', true, 'Tormenta severa'),
      candidata('a', '2026-10-03T10:00:00.000Z', false, 'Cerrada duplicada'),
    ], ahora)

    expect(candidatas).toEqual([candidata('a', '2026-10-01T10:00:00.000Z', true, 'Tormenta severa')])
  })

  it('ordena activas primero y por fecha descendente dentro de cada grupo', () => {
    const candidatas = armarCandidatasCausa([
      candidata('cerrada-vieja', '2026-10-04T10:00:00.000Z', false),
      candidata('activa-vieja', '2026-10-01T10:00:00.000Z', true),
      candidata('cerrada-nueva', '2026-10-05T10:00:00.000Z', false),
      candidata('activa-nueva', '2026-10-04T10:00:00.000Z', true),
    ], ahora)

    expect(candidatas.map(({ id }) => id)).toEqual(['activa-nueva', 'activa-vieja', 'cerrada-nueva', 'cerrada-vieja'])
  })

  it('conserva cierres de hasta 15 días y excluye los anteriores', () => {
    const candidatas = armarCandidatasCausa([
      candidata('limite', '2026-09-20T12:00:00.000Z', false),
      candidata('antigua', '2026-09-20T11:59:59.999Z', false),
      candidata('activa', '2026-08-01T10:00:00.000Z', true),
    ], ahora)

    expect(candidatas.map(({ id }) => id)).toEqual(['activa', 'limite'])
  })

  it('devuelve una lista vacía cuando no hay candidatas', () => {
    expect(armarCandidatasCausa([], ahora)).toEqual([])
  })
})
