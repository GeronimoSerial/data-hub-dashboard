import { describe, expect, it } from 'vitest'
import { calcularEstadoServicioGeneral, seccionesEfectivamenteSuspendidas } from './servicio-educativo'
import type { SeccionEstablecimiento, ServicioAlcance } from './trayectoria-tipos'

const BASE_FILA = {
  id: 'x',
  parteId: 'parte-1',
  rigeDesde: '2026-09-18T10:00:00.000Z',
  creadaEn: '2026-09-18T10:00:00.000Z',
  retiradaEn: null,
} as const

const secciones2A2B: SeccionEstablecimiento[] = [
  { geSectionId: 1, turno: 'Mañana' },
  { geSectionId: 2, turno: 'Mañana' },
]

describe('calcularEstadoServicioGeneral', () => {
  it('resuelve un turno suspendido como parcial incluso sin roster nominal', () => {
    expect(calcularEstadoServicioGeneral([
      { id: 'turno-demo', parteId: 'parte-demo', tipo: 'turno', referenciaId: 'Mañana', estado: 'suspendido', rigeDesde: '2026-01-01T00:00:00.000Z', creadaEn: '2026-01-01T00:00:00.000Z', retiradaEn: null },
    ], [])).toBe('parcial')
  })

  it('parte vacío (sin secciones en el corte vigente) da normal', () => {
    expect(calcularEstadoServicioGeneral([], [])).toBe('normal')
  })

  it('sin ninguna fila de alcance, todas las secciones se asumen normales', () => {
    expect(calcularEstadoServicioGeneral([], secciones2A2B)).toBe('normal')
  })

  it('suspender una sola sección no marca las demás como suspendidas (parcial)', () => {
    const alcance: ServicioAlcance[] = [
      { ...BASE_FILA, id: 'a', tipo: 'seccion', referenciaId: '1', estado: 'suspendido' },
    ]
    expect(calcularEstadoServicioGeneral(alcance, secciones2A2B)).toBe('parcial')
  })

  it('suspender un turno completo suspende todas las secciones de ese turno', () => {
    const secciones: SeccionEstablecimiento[] = [
      { geSectionId: 1, turno: 'Mañana' },
      { geSectionId: 2, turno: 'Mañana' },
      { geSectionId: 3, turno: 'Tarde' },
    ]
    const alcance: ServicioAlcance[] = [
      { ...BASE_FILA, id: 'a', tipo: 'turno', referenciaId: 'Mañana', estado: 'suspendido' },
    ]
    expect(calcularEstadoServicioGeneral(alcance, secciones)).toBe('parcial')
  })

  it('suspender todos los turnos existentes da estado general suspendido', () => {
    const secciones: SeccionEstablecimiento[] = [
      { geSectionId: 1, turno: 'Mañana' },
      { geSectionId: 2, turno: 'Tarde' },
    ]
    const alcance: ServicioAlcance[] = [
      { ...BASE_FILA, id: 'a', tipo: 'turno', referenciaId: 'Mañana', estado: 'suspendido' },
      { ...BASE_FILA, id: 'b', tipo: 'turno', referenciaId: 'Tarde', estado: 'suspendido' },
    ]
    expect(calcularEstadoServicioGeneral(alcance, secciones)).toBe('suspendido')
  })

  it('suspender todo el establecimiento suspende todas las secciones', () => {
    const alcance: ServicioAlcance[] = [
      { ...BASE_FILA, id: 'a', tipo: 'establecimiento', referenciaId: null, estado: 'suspendido' },
    ]
    expect(calcularEstadoServicioGeneral(alcance, secciones2A2B)).toBe('suspendido')
  })

  it('todas las secciones con clases normales explícitas da normal', () => {
    const alcance: ServicioAlcance[] = [
      { ...BASE_FILA, id: 'a', tipo: 'seccion', referenciaId: '1', estado: 'normal' },
      { ...BASE_FILA, id: 'b', tipo: 'seccion', referenciaId: '2', estado: 'normal' },
    ]
    expect(calcularEstadoServicioGeneral(alcance, secciones2A2B)).toBe('normal')
  })

  it('una fila de sección más específica prevalece sobre el establecimiento', () => {
    const alcance: ServicioAlcance[] = [
      { ...BASE_FILA, id: 'a', tipo: 'establecimiento', referenciaId: null, estado: 'suspendido' },
      { ...BASE_FILA, id: 'b', tipo: 'seccion', referenciaId: '1', estado: 'normal' },
    ]
    // Sección 1 vuelve a normal por la fila específica; sección 2 hereda la
    // suspensión del establecimiento: resultado parcial.
    expect(calcularEstadoServicioGeneral(alcance, secciones2A2B)).toBe('parcial')
  })

  it('sólo se toman filas vigentes: el llamador ya debe haber filtrado con resolverAlcanceVigente', () => {
    // Esta función no filtra por vigencia: si le pasan una fila retirada, la
    // usa igual. Documenta el contrato: el caller resuelve vigencia antes.
    const alcance: ServicioAlcance[] = [
      {
        ...BASE_FILA,
        id: 'a',
        tipo: 'seccion',
        referenciaId: '1',
        estado: 'suspendido',
        retiradaEn: '2026-09-18T11:00:00.000Z',
      },
    ]
    expect(calcularEstadoServicioGeneral(alcance, secciones2A2B)).toBe('parcial')
  })
})

describe('seccionesEfectivamenteSuspendidas', () => {
  const turnos: SeccionEstablecimiento[] = [
    { geSectionId: 1, turno: 'Mañana' },
    { geSectionId: 2, turno: 'Mañana' },
    { geSectionId: 3, turno: 'Tarde' },
  ]
  const fila = (extra: Partial<ServicioAlcance>): ServicioAlcance => ({ ...BASE_FILA, ...extra } as ServicioAlcance)

  it('devuelve sólo las secciones con fila de sección suspendida', () => {
    const alcance = [fila({ tipo: 'seccion', referenciaId: '2', estado: 'suspendido' })]
    expect(seccionesEfectivamenteSuspendidas(alcance, turnos).map((s) => s.geSectionId)).toEqual([2])
  })

  it('una fila de turno suspende las secciones de ese turno', () => {
    const alcance = [fila({ tipo: 'turno', referenciaId: 'Mañana', estado: 'suspendido' })]
    expect(seccionesEfectivamenteSuspendidas(alcance, turnos).map((s) => s.geSectionId)).toEqual([1, 2])
  })

  it('una fila de establecimiento suspendida alcanza a todas las secciones', () => {
    const alcance = [fila({ tipo: 'establecimiento', referenciaId: null, estado: 'suspendido' })]
    expect(seccionesEfectivamenteSuspendidas(alcance, turnos)).toEqual(turnos)
  })

  it('una fila de sección normal anula un turno suspendido para esa sección', () => {
    const alcance = [
      fila({ tipo: 'turno', referenciaId: 'Mañana', estado: 'suspendido' }),
      fila({ id: 'x2', tipo: 'seccion', referenciaId: '1', estado: 'normal' }),
    ]
    expect(seccionesEfectivamenteSuspendidas(alcance, turnos).map((s) => s.geSectionId)).toEqual([2])
  })

  it('sin filas de alcance no hay secciones suspendidas', () => {
    expect(seccionesEfectivamenteSuspendidas([], turnos)).toEqual([])
  })

  it('su cantidad coincide con calcularEstadoServicioGeneral en cada caso', () => {
    const casos: ServicioAlcance[][] = [
      [],
      [fila({ tipo: 'seccion', referenciaId: '2', estado: 'suspendido' })],
      [fila({ tipo: 'turno', referenciaId: 'Mañana', estado: 'suspendido' })],
      [fila({ tipo: 'establecimiento', referenciaId: null, estado: 'suspendido' })],
      [
        fila({ tipo: 'turno', referenciaId: 'Mañana', estado: 'suspendido' }),
        fila({ id: 'x2', tipo: 'seccion', referenciaId: '1', estado: 'normal' }),
      ],
    ]
    for (const alcance of casos) {
      const suspendidas = seccionesEfectivamenteSuspendidas(alcance, turnos).length
      const esperado = suspendidas === 0 ? 'normal' : suspendidas === turnos.length ? 'suspendido' : 'parcial'
      expect(calcularEstadoServicioGeneral(alcance, turnos)).toBe(esperado)
    }
  })
})
