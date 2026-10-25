import { describe, expect, it } from 'vitest'
import {
  validarConsistenciaCentroEvacuados,
  type AfectacionConsistenciaCentroEvacuados,
} from './consistencia-centro-evacuados'
import { MOTIVOS_SEED } from './motivos'

const motivoActivo: AfectacionConsistenciaCentroEvacuados = {
  motivoId: 'centro-evacuados',
  retiradaEn: null,
}

describe('validarConsistenciaCentroEvacuados', () => {
  it('uses the stable seeded establishment reason ID', () => {
    expect(MOTIVOS_SEED).toContainEqual({
      id: 'centro-evacuados',
      nombre: 'Centro de evacuados',
      categoria: 'establecimiento',
      orden: 60,
      severidadSugerida: 'Crítica',
    })
  })

  it('accepts the matching status and active reason', () => {
    expect(validarConsistenciaCentroEvacuados({
      estadoEstablecimiento: 'centro_evacuados',
      afectaciones: [motivoActivo],
    })).toEqual({ ok: true })
  })

  it('accepts a non-center status when no center reason is active', () => {
    expect(validarConsistenciaCentroEvacuados({
      estadoEstablecimiento: 'habitual',
      afectaciones: [],
    })).toEqual({ ok: true })
  })

  it('requires the center status when an active center reason exists', () => {
    expect(validarConsistenciaCentroEvacuados({
      estadoEstablecimiento: 'parcial',
      afectaciones: [motivoActivo],
    })).toEqual({
      ok: false,
      codigo: 'centro-evacuados-requiere-estado',
      mensaje: 'La afectación «Centro de evacuados» requiere que el estado del edificio sea «Centro de evacuados».',
    })
  })

  it('requires an active center reason when the status is the center', () => {
    expect(validarConsistenciaCentroEvacuados({
      estadoEstablecimiento: 'centro_evacuados',
      afectaciones: [{ motivoId: 'inundacion', retiradaEn: null }],
    })).toEqual({
      ok: false,
      codigo: 'estado-centro-evacuados-requiere-motivo',
      mensaje: 'El estado del edificio «Centro de evacuados» requiere una afectación activa con ese motivo.',
    })
  })

  it('accepts multiple active affectations when at least one has the matching reason', () => {
    expect(validarConsistenciaCentroEvacuados({
      estadoEstablecimiento: 'centro_evacuados',
      afectaciones: [
        { motivoId: 'inundacion', retiradaEn: null },
        motivoActivo,
        { motivoId: 'tormenta-severa', retiradaEn: null },
      ],
    })).toEqual({ ok: true })
  })

  it('ignores retired historical center reasons', () => {
    expect(validarConsistenciaCentroEvacuados({
      estadoEstablecimiento: 'habitual',
      afectaciones: [{ ...motivoActivo, retiradaEn: '2026-10-22T12:00:00.000Z' }],
    })).toEqual({ ok: true })
  })

  it('blocks removing the last active reason while retaining center status', () => {
    expect(validarConsistenciaCentroEvacuados({
      estadoEstablecimiento: 'centro_evacuados',
      afectaciones: [{ ...motivoActivo, retiradaEn: '2026-10-22T12:00:00.000Z' }],
    })).toMatchObject({
      ok: false,
      codigo: 'estado-centro-evacuados-requiere-motivo',
    })
  })

  it('accepts resolving the last reason when the effective status also changes', () => {
    expect(validarConsistenciaCentroEvacuados({
      estadoEstablecimiento: 'habitual',
      afectaciones: [{ ...motivoActivo, retiradaEn: '2026-10-22T12:00:00.000Z' }],
    })).toEqual({ ok: true })
  })

  it('blocks an unresolved legacy active mismatch', () => {
    expect(validarConsistenciaCentroEvacuados({
      estadoEstablecimiento: 'habitual',
      afectaciones: [motivoActivo],
    })).toMatchObject({
      ok: false,
      codigo: 'centro-evacuados-requiere-estado',
    })
  })
})
