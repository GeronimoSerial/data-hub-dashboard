import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { describirMovimiento, normalizarDiff, tituloMovimiento } from './movimiento-descripcion'
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
  it('dice "Toda la escuela" sin contar secciones cuando la afectación alcanza a toda la escuela', () => {
    const diff = { ...normalizarDiff({}), afectacionesAgregadas: [{ afectacionId: 'a1', motivo: 'Inundación', categoria: 'establecimiento' as const, severidad: 'Alta' as const, secciones: 12, alumnos: 300, todaLaEscuela: true }] }
    const lineas = describirMovimiento(diff)
    expect(lineas).toContain('Toda la escuela')
    expect(lineas.join(' ')).not.toMatch(/secciones/)
  })

  it('un cambio de alcance a toda la escuela no cuenta secciones', () => {
    const diff = { ...normalizarDiff({}), alcancesCambiados: [{ afectacionId: 'a1', motivo: 'Inundación', seccionesAgregadas: 5, seccionesRetiradas: 0, alumnosAgregados: 100, alumnosRetirados: 0, todaLaEscuela: true }] }
    expect(describirMovimiento(diff)).toContain('Se amplió el alcance de Inundación: toda la escuela')
  })

  it('describe el alta y las modalidades de asistencia pedagógica', () => {
    const diff = diffParte(crearSnapshotVacio(), { ...crearSnapshotVacio(), asistenciaPedagogica: { brinda: true, modalidades: ['Asistencia virtual', 'Cuadernillos impresos'] } })
    expect(describirMovimiento(diff)).toContain('Se brinda asistencia pedagógica: Asistencia virtual y Cuadernillos impresos')
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

  it('describe alcance por carrera tanto en servicio como en afectaciones', () => {
    const diff: DiffParte = {
      ...diffVacio,
      afectacionesAgregadas: [{ afectacionId: 'af-1', motivo: 'Inundación', categoria: 'establecimiento', severidad: 'Alta', secciones: 0, alumnos: 0, carreras: ['Carrera A'] }],
      serviciosCambiados: [{ alcance: { tipo: 'carrera', referenciaId: 'Carrera A' }, de: null, a: 'suspendido' }],
    }
    expect(describirMovimiento(diff)).toContain('Carreras afectadas: Carrera A')
    expect(describirMovimiento(diff)).toContain('Funcionamiento: interrumpido en carrera Carrera A')
  })

  it('describe cambios de carreras en el alcance guardado', () => {
    const diff: DiffParte = {
      ...diffVacio,
      datosCambiados: [{
        afectacionId: 'af-1', motivo: 'Inundación',
        campos: [{ campo: 'carreras', de: 'Carrera A', a: 'Carrera B' }],
        seccionesConSeleccionCambiada: [],
      }],
    }
    expect(describirMovimiento(diff)).toContain('Carreras afectadas de "Inundación" actualizadas: Carrera A → Carrera B')
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
    expect(lineas).toContain('Se informó Inaccesibilidad de alumnos')
    expect(lineas).toContain('Gravedad Media')
    expect(lineas).toContain('Alcanza a 1 sección (12 alumnos)')
  })

  it('redacta el alcance con plurales correctos y omite alumnos si no están informados', () => {
    const conAlcance = (secciones: number, alumnos: number) => describirMovimiento({
      ...diffVacio,
      afectacionesAgregadas: [{ afectacionId: 'a', motivo: 'Tormenta', categoria: 'establecimiento', severidad: 'Alta', secciones, alumnos }],
    })
    expect(conAlcance(1, 3)).toContain('Alcanza a 1 sección (3 alumnos)')
    expect(conAlcance(5, 107)).toContain('Alcanza a 5 secciones (107 alumnos)')
    expect(conAlcance(5, 0)).toContain('Alcanza a 5 secciones')
  })

  it('resume el cambio de alcance de una situación con texto claro', () => {
    const diff: DiffParte = {
      ...diffVacio,
      alcancesCambiados: [{ afectacionId: 'a', motivo: 'Tormenta severa', seccionesAgregadas: 2, seccionesRetiradas: 0, alumnosAgregados: 23, alumnosRetirados: 0 }],
    }
    expect(tituloMovimiento(diff, 'actualizacion', '2026-10-05T13:50:00.000Z')).toBe('Cambió el alcance de Tormenta severa')
    expect(describirMovimiento(diff)).toContain('Se amplió el alcance de Tormenta severa: 2 secciones más y 23 alumnos más')
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
    expect(lineas).toContain('Se informó Inundación')
    expect(lineas).toContain('Gravedad Alta')
    expect(lineas).toContain('Alcanza a 3 secciones (74 alumnos)')
  })

  it('afectación retirada', () => {
    const antes: ParteSnapshot = {
      estadoEstablecimiento: 'habitual',
      afectaciones: [afectacion({ id: 'af-1', motivo: 'Inundación' })],
      servicioAlcance: [],
    }
    const diff = diffParte(antes, crearSnapshotVacio())
    expect(describirMovimiento(diff)).toContain('Se dejó de informar Inundación')
  })

  it('cambio de severidad', () => {
    const diff: DiffParte = {
      ...diffVacio,
      severidadesCambiadas: [{ afectacionId: 'af-1', motivo: 'Inundación', de: 'Alta', a: 'Crítica' }],
    }
    expect(describirMovimiento(diff)).toContain('Situación: Inundación')
  })

  it('lista la transición de gravedad con el motivo en movimientos de varias situaciones', () => {
    const diff: DiffParte = {
      ...diffVacio,
      severidadesCambiadas: [
        { afectacionId: 'a', motivo: 'Tormenta severa', de: 'Alta', a: 'Media' },
        { afectacionId: 'b', motivo: 'Inundación', de: 'Crítica', a: 'Alta' },
      ],
    }
    expect(describirMovimiento(diff)).toEqual([
      'Tormenta severa: gravedad Alta → Media',
      'Inundación: gravedad Crítica → Alta',
    ])
  })

  it('cambio de situación del establecimiento', () => {
    const diff: DiffParte = { ...diffVacio, establecimientoCambiado: { de: 'habitual', a: 'evacuado' } }
    expect(describirMovimiento(diff)).toContain('Funcionamiento: habitual → evacuado')
    expect(describirMovimiento({ ...diffVacio, establecimientoCambiado: { de: 'habitual', a: 'parcial' } }))
      .toContain('Funcionamiento: habitual → parcial')
  })

  it('titula el alta con el evento y sin repetir gravedad ni hora', () => {
    const diff: DiffParte = {
      ...diffVacio,
      afectacionesAgregadas: [
        { afectacionId: 'a', motivo: 'Tormenta severa', categoria: 'establecimiento', severidad: 'Alta', secciones: 0, alumnos: 0 },
      ],
    }
    expect(tituloMovimiento(diff, 'reporte_inicial', '2026-10-04T06:50:00.000Z')).toBe('Se informó Tormenta severa')
  })

  it('titula el cambio de gravedad con la transición y sin la hora', () => {
    const diff: DiffParte = {
      ...diffVacio,
      severidadesCambiadas: [{ afectacionId: 'a', motivo: 'Tormenta severa', de: 'Alta', a: 'Baja' }],
    }
    expect(tituloMovimiento(diff, 'actualizacion', '2026-10-05T13:50:00.000Z')).toBe('Cambió la gravedad: Alta → Baja')
  })

  it('resume sin ambigüedad un movimiento que cambia varias situaciones', () => {
    const diff: DiffParte = {
      ...diffVacio,
      severidadesCambiadas: [
        { afectacionId: 'a', motivo: 'Tormenta', de: 'Alta', a: 'Baja' },
        { afectacionId: 'b', motivo: 'Inundación', de: 'Media', a: 'Alta' },
      ],
    }
    expect(tituloMovimiento(diff, 'actualizacion', '2026-10-05T13:50:00.000Z')).toBe('Se actualizaron 2 situaciones')
  })

  it('titula una solución y un cambio de gravedad según el cambio principal', () => {
    expect(tituloMovimiento({ ...diffVacio, afectacionesRetiradas: [{ afectacionId: 'a', motivo: 'Inundación', cierre: 'solucionada' }] }, 'actualizacion', '2026-10-04T06:50:00.000Z'))
      .toBe('Se solucionó Inundación')
    expect(tituloMovimiento({ ...diffVacio, severidadesCambiadas: [{ afectacionId: 'a', motivo: 'Inundación', de: 'Alta', a: 'Baja' }] }, 'actualizacion', '2026-10-04T06:50:00.000Z'))
      .toBe('Cambió la gravedad: Alta → Baja')
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
    expect(describirMovimiento({ ...vacioRediseño, afectacionesRetiradas: [{ afectacionId: 'a', motivo: 'Inundación', cierre: 'solucionada' }] })).toContain('Se solucionó Inundación')
    expect(describirMovimiento({ ...vacioRediseño, afectacionesRetiradas: [{ afectacionId: 'a', motivo: 'Inundación' }] })).toContain('Se dejó de informar Inundación')
  })
  it('agrega el vínculo causal', () => {
    const lineas = describirMovimiento({
      ...vacioRediseño,
      afectacionesAgregadas: [{ afectacionId: 'b', motivo: 'Sin energía o agua', categoria: 'establecimiento', severidad: 'Media', secciones: 1, alumnos: 0, causadaPor: { afectacionId: 'a', motivo: 'Inundación' } }],
    })
    expect(lineas).toContain('Causado por "Inundación"')
  })
})

describe('movimientos de evidencia fotográfica', () => {
  // infra_movimiento.resumen de evidencia_fotografica no es un DiffParte:
  // guarda { documentaMovimientoId, attachmentIds } (adjuntos/evidencia-fotografica.ts).
  const resumenEvidencia = { documentaMovimientoId: 'mov-1', attachmentIds: ['adj-1'] } as unknown as DiffParte

  it('titula la evidencia sin romper', () => {
    expect(tituloMovimiento(resumenEvidencia, 'evidencia_fotografica', '2026-09-18T10:35:00.000Z')).toBe(
      'Se agregó evidencia fotográfica',
    )
  })

  it('no describe cambios de estado para la evidencia', () => {
    expect(describirMovimiento(resumenEvidencia, { tipo: 'evidencia_fotografica' })).toEqual([])
  })

  it('tolera un resumen malformado sin lanzar', () => {
    const malformado = {} as unknown as DiffParte
    expect(tituloMovimiento(malformado, 'actualizacion', '2026-09-18T10:35:00.000Z')).toBe('Se actualizó el parte')
    expect(describirMovimiento(malformado, { tipo: 'actualizacion' })).toEqual([])
  })
})
