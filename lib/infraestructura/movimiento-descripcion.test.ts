import { describe, expect, it } from 'vitest'
import { describirMovimiento } from './movimiento-descripcion'
import { diffParte, esDiffVacio } from './movimiento-diff'
import type { DiffParte } from './movimiento-diff'
import { crearSnapshotVacio } from './trayectoria-tipos'
import type { Afectacion, ParteSnapshot } from './trayectoria-tipos'

const VOCABULARIO_PROHIBIDO = [/versión/i, /entidad/i, /registro histórico/i, /persistencia/i]

function afectacion(overrides: Partial<Afectacion> & { id: string }): Afectacion {
  return {
    parteId: 'parte-1',
    descripcion: null,
    rigeDesde: '2026-09-18T10:35:00.000Z',
    creadaEn: '2026-09-18T10:35:00.000Z',
    retiradaEn: null,
    motivo: 'Inundación',
    categoria: 'establecimiento',
    severidad: 'Alta',
    secciones: [],
    ...overrides,
  }
}

const diffVacio: DiffParte = {
  afectacionesAgregadas: [],
  afectacionesRetiradas: [],
  severidadesCambiadas: [],
  alcancesCambiados: [],
  datosCambiados: [],
  serviciosCambiados: [],
  establecimientoCambiado: null,
}

describe('describirMovimiento', () => {
  it('diff vacío no produce líneas', () => {
    expect(describirMovimiento(diffVacio)).toEqual([])
  })

  it('cambio de servicio con transición explícita usa flecha, como el ejemplo de §13/§15', () => {
    const diff: DiffParte = {
      ...diffVacio,
      serviciosCambiados: [
        { alcance: { tipo: 'seccion', referenciaId: '10', etiqueta: '2.º A' }, de: 'normal', a: 'suspendido' },
      ],
    }
    const lineas = describirMovimiento(diff)
    expect(lineas).toContain('Clases normales → Clases suspendidas en 2.º A')
  })

  it('cambio de servicio sin estado anterior (primer alcance) no usa flecha', () => {
    const diff: DiffParte = {
      ...diffVacio,
      serviciosCambiados: [{ alcance: { tipo: 'establecimiento', referenciaId: null }, de: null, a: 'suspendido' }],
    }
    expect(describirMovimiento(diff)).toEqual(['Clases suspendidas'])
  })

  it('afectación agregada produce el texto del ejemplo de §15', () => {
    const antes = crearSnapshotVacio()
    const despues: ParteSnapshot = {
      estadoEstablecimiento: 'habitual',
      afectaciones: [
        afectacion({
          id: 'af-1',
          motivo: 'Inaccesibilidad de alumnos',
          categoria: 'alumnos',
          severidad: 'Media',
          secciones: [{ geSectionId: 1, seccionCompleta: false, alumnos: Array.from({ length: 12 }, (_, i) => i) }],
        }),
      ],
      servicioAlcance: [],
    }
    const diff = diffParte(antes, despues)
    const lineas = describirMovimiento(diff)
    expect(lineas).toContain('Se agregó "Inaccesibilidad de alumnos" · Severidad Media')
    expect(lineas).toContain('12 alumnos incorporados')
  })

  it('reporte inicial narra la primera afectación como "Se inició el reporte por…"', () => {
    const despues: ParteSnapshot = {
      estadoEstablecimiento: 'habitual',
      afectaciones: [
        afectacion({
          id: 'af-1',
          motivo: 'Inundación',
          severidad: 'Alta',
          secciones: [
            { geSectionId: 1, seccionCompleta: true, alumnos: Array.from({ length: 74 }, (_, i) => i) },
            { geSectionId: 2, seccionCompleta: true, alumnos: [] },
            { geSectionId: 3, seccionCompleta: true, alumnos: [] },
          ],
        }),
      ],
      servicioAlcance: [],
    }
    const diff = diffParte(crearSnapshotVacio(), despues)
    const lineas = describirMovimiento(diff, { tipo: 'reporte_inicial' })
    expect(lineas).toContain('Se inició el reporte por "Inundación"')
    expect(lineas).toContain('Severidad Alta · 3 secciones · 74 alumnos')
  })

  it('afectación retirada', () => {
    const antes: ParteSnapshot = {
      estadoEstablecimiento: 'habitual',
      afectaciones: [afectacion({ id: 'af-1', motivo: 'Inundación' })],
      servicioAlcance: [],
    }
    const diff = diffParte(antes, crearSnapshotVacio())
    expect(describirMovimiento(diff)).toContain('Se resolvió "Inundación"')
  })

  it('cambio de severidad', () => {
    const diff: DiffParte = {
      ...diffVacio,
      severidadesCambiadas: [{ afectacionId: 'af-1', motivo: 'Inundación', de: 'Alta', a: 'Crítica' }],
    }
    expect(describirMovimiento(diff)).toContain('Severidad de "Inundación": Alta → Crítica')
  })

  it('cambio de situación del establecimiento', () => {
    const diff: DiffParte = { ...diffVacio, establecimientoCambiado: { de: 'habitual', a: 'evacuado' } }
    expect(describirMovimiento(diff)).toContain('Funcionamiento habitual → Establecimiento evacuado')
  })

  it('cambio de motivo en una afectación existente se traduce a español llano', () => {
    const antes: ParteSnapshot = {
      estadoEstablecimiento: 'habitual',
      afectaciones: [afectacion({ id: 'af-1', motivo: 'Inundación' })],
      servicioAlcance: [],
    }
    const despues: ParteSnapshot = {
      ...antes,
      afectaciones: [{ ...antes.afectaciones[0], motivo: 'Inundación por desborde' }],
    }
    const diff = diffParte(antes, despues)
    expect(describirMovimiento(diff)).toContain('Motivo actualizado: "Inundación" → "Inundación por desborde"')
  })

  it('diff con datosCambiados ausente (resumen persistido antes de esta variante) no rompe', () => {
    const diffSinDatosCambiados = { ...diffVacio } as Partial<DiffParte>
    delete diffSinDatosCambiados.datosCambiados
    expect(() => describirMovimiento(diffSinDatosCambiados as DiffParte)).not.toThrow()
    expect(describirMovimiento(diffSinDatosCambiados as DiffParte)).toEqual([])
  })

  it('nunca usa el vocabulario prohibido de la spec §5.4', () => {
    const diff: DiffParte = {
      afectacionesAgregadas: [
        { afectacionId: 'a', motivo: 'Inundación', categoria: 'establecimiento', severidad: 'Alta', secciones: 2, alumnos: 5 },
      ],
      afectacionesRetiradas: [{ afectacionId: 'b', motivo: 'Otro' }],
      severidadesCambiadas: [{ afectacionId: 'c', motivo: 'X', de: 'Baja', a: 'Alta' }],
      alcancesCambiados: [
        { afectacionId: 'd', motivo: 'Y', seccionesAgregadas: 1, seccionesRetiradas: 1, alumnosAgregados: 1, alumnosRetirados: 1 },
      ],
      datosCambiados: [],
      serviciosCambiados: [
        { alcance: { tipo: 'turno', referenciaId: 'Mañana', etiqueta: 'Mañana' }, de: 'normal', a: 'suspendido' },
      ],
      establecimientoCambiado: { de: 'habitual', a: 'centro_evacuados' },
    }
    const lineas = describirMovimiento(diff)
    for (const linea of lineas) {
      for (const patron of VOCABULARIO_PROHIBIDO) {
        expect(linea).not.toMatch(patron)
      }
    }
  })

  it('vocabulario prohibido no aparece tampoco en las líneas de datosCambiados', () => {
    const diff: DiffParte = {
      ...diffVacio,
      datosCambiados: [
        {
          afectacionId: 'af-1',
          motivo: 'Inundación por desborde',
          campos: [
            { campo: 'motivo', de: 'Inundación', a: 'Inundación por desborde' },
            { campo: 'categoria', de: 'establecimiento', a: 'alumnos' },
            { campo: 'descripcion', de: null, a: 'texto nuevo' },
          ],
          seccionesConSeleccionCambiada: [1],
        },
      ],
    }
    const lineas = describirMovimiento(diff)
    expect(lineas.length).toBeGreaterThan(0)
    for (const linea of lineas) {
      for (const patron of VOCABULARIO_PROHIBIDO) {
        expect(linea).not.toMatch(patron)
      }
    }
  })
})
