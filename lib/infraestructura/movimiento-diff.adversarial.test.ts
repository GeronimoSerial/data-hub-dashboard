import { describe, expect, it } from 'vitest'
import { diffParte, esDiffVacio } from './movimiento-diff'
import { crearSnapshotVacio } from './trayectoria-tipos'
import type { Afectacion, ParteSnapshot, ServicioAlcance } from './trayectoria-tipos'

function baseAfectacion(): Afectacion {
  return {
    id: 'af-1',
    parteId: 'parte-1',
    motivo: 'Inundacion',
    categoria: 'establecimiento',
    severidad: 'Alta',
    descripcion: null,
    rigeDesde: '2026-09-18T10:00:00.000Z',
    creadaEn: '2026-09-18T10:00:00.000Z',
    retiradaEn: null,
    secciones: [{ geSectionId: 1, seccionCompleta: true, alumnos: [10, 11] }],
  }
}

function snapshotConAfectacion(afectacion: Afectacion): ParteSnapshot {
  return { ...crearSnapshotVacio('habitual'), afectaciones: [afectacion] }
}

describe('diffParte frente a cambios sobre una afectación existente (mismo id)', () => {
  it('detecta un cambio de motivo manteniendo id y alcance idénticos', () => {
    const antes = snapshotConAfectacion(baseAfectacion())

    const despuesAfectacion = { ...baseAfectacion(), motivo: 'Inundacion por desborde' }
    const despues = snapshotConAfectacion(despuesAfectacion)

    const diff = diffParte(antes, despues)
    expect(esDiffVacio(diff)).toBe(false)
    expect(diff.datosCambiados).toEqual([
      {
        afectacionId: 'af-1',
        motivo: 'Inundacion por desborde',
        campos: [{ campo: 'motivo', de: 'Inundacion', a: 'Inundacion por desborde' }],
        seccionesConSeleccionCambiada: [],
      },
    ])
  })

  it('detecta un cambio de categoria manteniendo id y alcance idénticos', () => {
    const antes = snapshotConAfectacion(baseAfectacion())

    const despuesAfectacion = { ...baseAfectacion(), categoria: 'alumnos' as const }
    const despues = snapshotConAfectacion(despuesAfectacion)

    const diff = diffParte(antes, despues)
    expect(esDiffVacio(diff)).toBe(false)
    expect(diff.datosCambiados).toEqual([
      {
        afectacionId: 'af-1',
        motivo: 'Inundacion',
        campos: [{ campo: 'categoria', de: 'establecimiento', a: 'alumnos' }],
        seccionesConSeleccionCambiada: [],
      },
    ])
  })

  it('detecta un cambio de descripcion (null -> texto) manteniendo id y alcance idénticos', () => {
    const antes = snapshotConAfectacion(baseAfectacion())

    const despuesAfectacion = { ...baseAfectacion(), descripcion: 'texto nuevo' }
    const despues = snapshotConAfectacion(despuesAfectacion)

    const diff = diffParte(antes, despues)
    expect(esDiffVacio(diff)).toBe(false)
  })

  it('detecta un cambio de seccionCompleta en la misma sección con los mismos alumnos', () => {
    const antes = snapshotConAfectacion(baseAfectacion())

    const despuesAfectacion = {
      ...baseAfectacion(),
      secciones: [{ geSectionId: 1, seccionCompleta: false, alumnos: [10, 11] }],
    }
    const despues = snapshotConAfectacion(despuesAfectacion)

    const diff = diffParte(antes, despues)
    expect(esDiffVacio(diff)).toBe(false)
  })

  it('reporta diff vacío cuando el servicioAlcance es idéntico en ambos snapshots', () => {
    const fila: ServicioAlcance = {
      id: 'sa-1',
      parteId: 'parte-1',
      tipo: 'establecimiento',
      referenciaId: null,
      estado: 'normal',
      rigeDesde: '2026-09-18T10:30:00.000Z',
      creadaEn: '2026-09-18T10:30:00.000Z',
      retiradaEn: null,
    }

    const antes = { ...crearSnapshotVacio('habitual'), servicioAlcance: [fila] }
    const despues = { ...crearSnapshotVacio('habitual'), servicioAlcance: [{ ...fila }] }

    const diff = diffParte(antes, despues)
    expect(esDiffVacio(diff)).toBe(true)
  })
})