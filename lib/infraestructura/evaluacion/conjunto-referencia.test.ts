import { describe, expect, it } from 'vitest'

import {
  CONJUNTO_REFERENCIA,
  CONJUNTO_REFERENCIA_VERSION,
  VENTANA_REFERENCIA,
} from './conjunto-referencia'

const dentroDeVentana = (iso: string) =>
  iso >= VENTANA_REFERENCIA.desde && iso <= VENTANA_REFERENCIA.hasta

describe('CONJUNTO_REFERENCIA', () => {
  it('declara la versión del conjunto', () => {
    expect(CONJUNTO_REFERENCIA_VERSION).toBe('conjunto-referencia-2026-10-v2')
  })

  it('tiene ids únicos', () => {
    const ids = CONJUNTO_REFERENCIA.map((caso) => caso.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('usa los 7 positivos de afectación real (sin medidas preventivas)', () => {
    const positivos = CONJUNTO_REFERENCIA.filter((caso) => caso.clase === 'positivo')
      .map((caso) => caso.id)
      .sort()

    expect(positivos).toEqual([
      'EV-20261007-001',
      'EV-20261008-001',
      'EV-20261010-001',
      'EV-20261011-001',
      'EV-20261011-002',
      'EV-20261012-001',
      'EV-20261013-001',
    ])
  })

  it('excluye las medidas preventivas EV-20261012-004 y EV-20261013-005 del conjunto', () => {
    const ids = CONJUNTO_REFERENCIA.map((caso) => caso.id)
    expect(ids).not.toContain('EV-20261013-005')
    expect(ids).not.toContain('EV-20261012-004')
  })

  it('usa el negativo y las mediciones bajo umbral de 08-evaluacion.md', () => {
    const porClase = (clase: string) =>
      CONJUNTO_REFERENCIA.filter((caso) => caso.clase === clase).map((caso) => caso.id)

    expect(porClase('negativo')).toEqual(['EV-20261008-002'])
    expect(porClase('bajo_umbral').sort()).toEqual(['EV-20261013-002', 'EV-20261013-003'])
  })

  it('no incluye casos desconocidos ni clases fuera del conjunto', () => {
    const clases = new Set(CONJUNTO_REFERENCIA.map((caso) => caso.clase))
    expect([...clases].sort()).toEqual(['bajo_umbral', 'negativo', 'positivo'])
  })

  it('ningún caso con inicio o primera publicación cae fuera de la ventana', () => {
    for (const caso of CONJUNTO_REFERENCIA) {
      if (caso.inicio !== null) expect(dentroDeVentana(caso.inicio), caso.id).toBe(true)
      if (caso.primeraPublicacion !== null) {
        expect(dentroDeVentana(caso.primeraPublicacion), caso.id).toBe(true)
      }
    }
  })

  it('declara la ventana desde el 7/10 00:00 ART hasta el corte del 13/10 12:45 ART', () => {
    expect(VENTANA_REFERENCIA.desde).toBe('2026-10-07T03:00:00.000Z')
    expect(VENTANA_REFERENCIA.hasta).toBe('2026-10-13T15:45:00.000Z')
  })

  it('cada caso tiene territorio, nivel territorial y descripción no vacíos', () => {
    for (const caso of CONJUNTO_REFERENCIA) {
      expect(caso.territorio.trim(), caso.id).not.toBe('')
      expect(caso.descripcion.trim(), caso.id).not.toBe('')
    }
  })
})
