import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { describirMovimiento, tituloMovimiento } from './movimiento-descripcion'
import { diffParte } from './movimiento-diff'
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

beforeEach(() => vi.setSystemTime(new Date('2026-10-05T18:00:00.000Z')))
afterEach(() => vi.useRealTimers())

describe('describirMovimiento', () => {
  it('describe el alta y las modalidades de asistencia pedagógica', () => {
    const diff = diffParte(crearSnapshotVacio(), { ...crearSnapshotVacio(), asistenciaPedagogica: { brinda: true, modalidades: ['Clase virtual', 'Cuadernillo'] } })
    expect(describirMovimiento(diff)).toContain('Se brinda asistencia pedagógica: Clase virtual y Cuadernillo')
  })
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
    expect(lineas).toContain('Funcionamiento: habitual → interrumpido en 2.º A')
  })

  it('cambio de servicio sin estado anterior (primer alcance) no usa flecha', () => {
    const diff: DiffParte = {
      ...diffVacio,
      serviciosCambiados: [{ alcance: { tipo: 'establecimiento', referenciaId: null }, de: null, a: 'suspendido' }],
    }
    expect(describirMovimiento(diff)).toEqual(['Funcionamiento: interrumpido'])
  })

  it('resuelve nombres de sección y agrupa secciones desconocidas sin exponer sus ids', () => {
    const diff: DiffParte = {
      ...diffVacio,
      serviciosCambiados: [
        { alcance: { tipo: 'seccion', referenciaId: '1099916' }, de: null, a: 'normal' },
        { alcance: { tipo: 'seccion', referenciaId: '1099920' }, de: null, a: 'normal' },
        { alcance: { tipo: 'seccion', referenciaId: '1099918' }, de: null, a: 'normal' },
      ],
    }
    const textos = describirMovimiento(diff)
    expect(textos).toEqual(['Funcionamiento: habitual en 3 secciones'])
    expect(textos.join(' ')).not.toMatch(/1099916|1099920|1099918/)
  })

  it('resuelve el curso, la división y el turno para mostrar el nombre de sección', () => {
    const diff: DiffParte = {
      ...diffVacio,
      serviciosCambiados: [
        { alcance: { tipo: 'seccion', referenciaId: '1099916' }, de: null, a: 'normal' },
      ],
    }
    expect(describirMovimiento(diff, {
      secciones: [{ geSectionId: 1099916, curso: 'Sala 3', division: 'B', turno: 'Mañana' }],
    })).toEqual(['Funcionamiento: habitual en Sala 3 "B" (Mañana)'])
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

  it('reporte inicial narra la primera situación iniciada', () => {
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
    expect(lineas).toContain('Se inició la situación "Inundación"')
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
    expect(describirMovimiento(diff)).toContain('Funcionamiento: habitual → evacuado')
    expect(describirMovimiento({ ...diffVacio, establecimientoCambiado: { de: 'habitual', a: 'parcial' } }))
      .toContain('Funcionamiento: habitual → parcial')
  })

  it('arma un título de situación con motivo, gravedad y hora local', () => {
    const diff: DiffParte = {
      ...diffVacio,
      afectacionesAgregadas: [
        { afectacionId: 'a', motivo: 'Tormenta severa', categoria: 'establecimiento', severidad: 'Alta', secciones: 0, alumnos: 0 },
      ],
    }
    expect(tituloMovimiento(diff, 'actualizacion', '2026-10-04T06:50:00.000Z')).toBe('Tormenta severa · Alta · desde el 4 de octubre, 03:50')
  })

  it('muestra sólo la hora cuando la vigencia comienza hoy', () => {
    const diff: DiffParte = {
      ...diffVacio,
      afectacionesAgregadas: [
        { afectacionId: 'a', motivo: 'Tormenta severa', categoria: 'establecimiento', severidad: 'Alta', secciones: 0, alumnos: 0 },
      ],
    }
    expect(tituloMovimiento(diff, 'actualizacion', '2026-10-05T13:50:00.000Z')).toBe('Tormenta severa · Alta · desde 10:50')
  })

  it('titula una solución y un cambio de gravedad según el cambio principal', () => {
    expect(tituloMovimiento({ ...diffVacio, afectacionesRetiradas: [{ afectacionId: 'a', motivo: 'Inundación', cierre: 'solucionada' }] }, 'actualizacion', '2026-10-04T06:50:00.000Z'))
      .toBe('Inundación · Solucionada · desde el 4 de octubre, 03:50')
    expect(tituloMovimiento({ ...diffVacio, severidadesCambiadas: [{ afectacionId: 'a', motivo: 'Inundación', de: 'Media', a: 'Alta' }] }, 'actualizacion', '2026-10-04T06:50:00.000Z'))
      .toBe('Inundación · Media → Alta · desde el 4 de octubre, 03:50')
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

const vacioRediseño: DiffParte = {
  afectacionesAgregadas: [],
  afectacionesRetiradas: [],
  severidadesCambiadas: [],
  alcancesCambiados: [],
  datosCambiados: [],
  serviciosCambiados: [],
  establecimientoCambiado: null,
  asistenciaPedagogicaCambiada: null,
}

describe('describirMovimiento — rediseño', () => {
  it('describe una confirmación', () => {
    expect(describirMovimiento({ ...vacioRediseño, afectacionesConfirmadas: [{ afectacionId: 'a', motivo: 'Inundación' }] })).toContain('Sigue igual: "Inundación"')
  })
  it('distingue solucionada de retirada', () => {
    expect(describirMovimiento({ ...vacioRediseño, afectacionesRetiradas: [{ afectacionId: 'a', motivo: 'Inundación', cierre: 'solucionada' }] })).toContain('Se solucionó "Inundación"')
    expect(describirMovimiento({ ...vacioRediseño, afectacionesRetiradas: [{ afectacionId: 'a', motivo: 'Inundación' }] })).toContain('Se resolvió "Inundación"')
  })
  it('agrega el vínculo causal', () => {
    const lineas = describirMovimiento({
      ...vacioRediseño,
      afectacionesAgregadas: [{ afectacionId: 'b', motivo: 'Sin energía o agua', categoria: 'establecimiento', severidad: 'Media', secciones: 1, alumnos: 0, causadaPor: { afectacionId: 'a', motivo: 'Inundación' } }],
    })
    expect(lineas).toContain('Causado por "Inundación"')
  })
})
