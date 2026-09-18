import { describe, expect, it } from 'vitest'
import { diffParte, esDiffVacio } from './movimiento-diff'
import { crearSnapshotVacio } from './trayectoria-tipos'
import type { Afectacion, ParteSnapshot, ServicioAlcance } from './trayectoria-tipos'

const BASE_AFECTACION = {
  parteId: 'parte-1',
  descripcion: null,
  rigeDesde: '2026-09-17T16:20:00.000Z',
  creadaEn: '2026-09-17T16:20:00.000Z',
  retiradaEn: null,
} as const

function afectacion(overrides: Partial<Afectacion> & { id: string }): Afectacion {
  return {
    ...BASE_AFECTACION,
    motivo: 'Inundación',
    categoria: 'establecimiento',
    severidad: 'Alta',
    secciones: [],
    ...overrides,
  }
}

const BASE_SERVICIO = {
  parteId: 'parte-1',
  rigeDesde: '2026-09-18T10:30:00.000Z',
  creadaEn: '2026-09-18T10:30:00.000Z',
  retiradaEn: null,
} as const

function servicio(overrides: Partial<ServicioAlcance> & { id: string }): ServicioAlcance {
  return { ...BASE_SERVICIO, tipo: 'establecimiento', referenciaId: null, estado: 'normal', ...overrides }
}

describe('diffParte', () => {
  it('parte vacío vs parte vacío da un diff vacío', () => {
    const diff = diffParte(crearSnapshotVacio(), crearSnapshotVacio())
    expect(esDiffVacio(diff)).toBe(true)
  })

  it('dos snapshots idénticos dan un diff vacío (nada volvió a listarse)', () => {
    const snapshot: ParteSnapshot = {
      estadoEstablecimiento: 'habitual',
      afectaciones: [
        afectacion({
          id: 'af-1',
          secciones: [{ geSectionId: 1, seccionCompleta: true, alumnos: [10, 11] }],
        }),
      ],
      servicioAlcance: [servicio({ id: 's-1', estado: 'normal' })],
    }
    const diff = diffParte(snapshot, snapshot)
    expect(esDiffVacio(diff)).toBe(true)
  })

  it('reporte inicial: afectación nueva sobre parte vacío', () => {
    const despues: ParteSnapshot = {
      estadoEstablecimiento: 'habitual',
      afectaciones: [
        afectacion({
          id: 'af-1',
          motivo: 'Inundación',
          severidad: 'Alta',
          secciones: [
            { geSectionId: 1, seccionCompleta: true, alumnos: [1, 2] },
            { geSectionId: 2, seccionCompleta: true, alumnos: [3] },
            { geSectionId: 3, seccionCompleta: true, alumnos: [] },
          ],
        }),
      ],
      servicioAlcance: [],
    }
    const diff = diffParte(crearSnapshotVacio(), despues)
    expect(diff.afectacionesAgregadas).toEqual([
      {
        afectacionId: 'af-1',
        motivo: 'Inundación',
        categoria: 'establecimiento',
        severidad: 'Alta',
        secciones: 3,
        alumnos: 3,
      },
    ])
    expect(esDiffVacio(diff)).toBe(false)
  })

  it('afectación retirada: presente antes, ausente después', () => {
    const antes: ParteSnapshot = {
      estadoEstablecimiento: 'habitual',
      afectaciones: [afectacion({ id: 'af-1' })],
      servicioAlcance: [],
    }
    const despues = crearSnapshotVacio()
    const diff = diffParte(antes, despues)
    expect(diff.afectacionesRetiradas).toEqual([{ afectacionId: 'af-1', motivo: 'Inundación' }])
  })

  it('cambio de severidad en una afectación no afecta a las demás', () => {
    const antes: ParteSnapshot = {
      estadoEstablecimiento: 'habitual',
      afectaciones: [
        afectacion({ id: 'af-1', motivo: 'Inundación', severidad: 'Alta' }),
        afectacion({ id: 'af-2', motivo: 'Inaccesibilidad de alumnos', categoria: 'alumnos', severidad: 'Media' }),
      ],
      servicioAlcance: [],
    }
    const despues: ParteSnapshot = {
      ...antes,
      afectaciones: [
        afectacion({ id: 'af-1', motivo: 'Inundación', severidad: 'Crítica' }),
        antes.afectaciones[1],
      ],
    }
    const diff = diffParte(antes, despues)
    expect(diff.severidadesCambiadas).toEqual([
      { afectacionId: 'af-1', motivo: 'Inundación', de: 'Alta', a: 'Crítica' },
    ])
    expect(diff.afectacionesAgregadas).toEqual([])
    expect(diff.afectacionesRetiradas).toEqual([])
  })

  it('secciones y alumnos agregados/retirados dentro de una misma afectación', () => {
    const antes: ParteSnapshot = {
      estadoEstablecimiento: 'habitual',
      afectaciones: [
        afectacion({
          id: 'af-1',
          secciones: [
            { geSectionId: 1, seccionCompleta: false, alumnos: [10, 11] },
            { geSectionId: 2, seccionCompleta: true, alumnos: [20, 21] },
          ],
        }),
      ],
      servicioAlcance: [],
    }
    const despues: ParteSnapshot = {
      estadoEstablecimiento: 'habitual',
      afectaciones: [
        afectacion({
          id: 'af-1',
          secciones: [
            // Sección 1 gana un alumno (12) y pierde otro (11).
            { geSectionId: 1, seccionCompleta: false, alumnos: [10, 12] },
            // Sección 2 se retira entera (2 alumnos retirados).
            // Sección 3 se agrega entera (1 alumno agregado).
            { geSectionId: 3, seccionCompleta: true, alumnos: [30] },
          ],
        }),
      ],
      servicioAlcance: [],
    }
    const diff = diffParte(antes, despues)
    expect(diff.alcancesCambiados).toEqual([
      {
        afectacionId: 'af-1',
        motivo: 'Inundación',
        seccionesAgregadas: 1,
        seccionesRetiradas: 1,
        alumnosAgregados: 2, // el 12 de la sección 1 + el 30 de la sección 3 nueva
        alumnosRetirados: 3, // el 11 de la sección 1 + los 2 de la sección 2 retirada
      },
    ])
  })

  it('servicio educativo: normal a suspendido para una sección puntual', () => {
    const antes: ParteSnapshot = crearSnapshotVacio()
    const despues: ParteSnapshot = {
      ...antes,
      servicioAlcance: [servicio({ id: 's-1', tipo: 'seccion', referenciaId: '10', estado: 'suspendido', etiqueta: '2.º A' })],
    }
    const diff = diffParte(antes, despues)
    expect(diff.serviciosCambiados).toEqual([
      { alcance: { tipo: 'seccion', referenciaId: '10', etiqueta: '2.º A' }, de: null, a: 'suspendido' },
    ])
  })

  it('servicio educativo: transición explícita normal -> suspendido en la misma clave', () => {
    const antes: ParteSnapshot = {
      ...crearSnapshotVacio(),
      servicioAlcance: [servicio({ id: 's-1', tipo: 'seccion', referenciaId: '10', estado: 'normal' })],
    }
    const despues: ParteSnapshot = {
      ...crearSnapshotVacio(),
      servicioAlcance: [servicio({ id: 's-2', tipo: 'seccion', referenciaId: '10', estado: 'suspendido' })],
    }
    const diff = diffParte(antes, despues)
    expect(diff.serviciosCambiados).toEqual([
      { alcance: { tipo: 'seccion', referenciaId: '10', etiqueta: undefined }, de: 'normal', a: 'suspendido' },
    ])
  })

  it('situación del establecimiento cambiada', () => {
    const antes = crearSnapshotVacio('habitual')
    const despues = crearSnapshotVacio('evacuado')
    const diff = diffParte(antes, despues)
    expect(diff.establecimientoCambiado).toEqual({ de: 'habitual', a: 'evacuado' })
  })

  it('situación del establecimiento sin cambios no aparece en el diff', () => {
    const antes = crearSnapshotVacio('habitual')
    const despues = crearSnapshotVacio('habitual')
    const diff = diffParte(antes, despues)
    expect(diff.establecimientoCambiado).toBeNull()
  })
})

describe('esDiffVacio', () => {
  it('detecta cualquier tipo de cambio como no vacío', () => {
    const conCambioEstablecimiento = diffParte(crearSnapshotVacio('habitual'), crearSnapshotVacio('evacuado'))
    expect(esDiffVacio(conCambioEstablecimiento)).toBe(false)
  })
})
