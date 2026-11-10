import { describe, expect, it } from 'vitest'
import { etiquetaClases, etiquetaFuncionamiento, tieneServicioInformado } from './funcionamiento'
import { calcularPrioridadAlumnos } from './prioridad-alumnos'
import type { ServicioAlcance } from './trayectoria-tipos'

function fila(tipo: ServicioAlcance['tipo'], referenciaId: string | null): ServicioAlcance {
  return { id: 'servicio', parteId: 'parte', tipo, referenciaId, estado: 'normal', rigeDesde: '2026-01-01T00:00:00Z', creadaEn: '2026-01-01T00:00:00Z', retiradaEn: null }
}

describe('etiquetaFuncionamiento', () => {
  it.each([
    ['Baja', 'Funcionamiento con afectación leve'],
    ['Media', 'Funcionamiento afectado'],
    ['Alta', 'Funcionamiento gravemente afectado'],
    ['Crítica', 'Funcionamiento críticamente afectado'],
  ] as const)('derives %s from the highest active effective severity', (severidad, etiqueta) => {
    expect(etiquetaFuncionamiento([{ severidad: 'Baja' }, { severidad }])).toBe(etiqueta)
  })
  it('returns no reported affectations once no active situations remain', () => {
    expect(etiquetaFuncionamiento([])).toBe('Sin afectaciones reportadas')
  })
  it('uses calculated priority rather than stale manual severity', () => {
    expect(etiquetaFuncionamiento([{ severidad: 'Crítica', impactoAlumnos: calcularPrioridadAlumnos(1, 100) }])).toBe('Funcionamiento con afectación leve')
  })
  it('does not confuse uncalculable active impact with no active situations', () => {
    expect(etiquetaFuncionamiento([{ severidad: 'Crítica', impactoAlumnos: calcularPrioridadAlumnos(0, null) }])).toBe('Sin datos para calcular el funcionamiento')
    expect(etiquetaFuncionamiento([
      { severidad: 'Crítica', impactoAlumnos: calcularPrioridadAlumnos(0, null) },
      { severidad: 'Media' },
    ])).toBe('Funcionamiento afectado')
  })
})

describe('tieneServicioInformado', () => {
  const secciones = [{ geSectionId: 1, turno: 'MAÑANA' }]
  it('distinguishes explicit normal classes from absent information', () => {
    expect(tieneServicioInformado([], secciones)).toBe(false)
    expect(tieneServicioInformado([fila('establecimiento', null)], secciones)).toBe(true)
  })
  it('only accepts scopes applicable to current GE units', () => {
    expect(tieneServicioInformado([fila('seccion', '2'), fila('turno', 'NOCHE'), fila('carrera', '10')], secciones)).toBe(false)
    expect(tieneServicioInformado([fila('seccion', '1')], secciones)).toBe(true)
    expect(tieneServicioInformado([fila('turno', 'MAÑANA')], secciones)).toBe(true)
  })
  it('uses current careers for institutes rather than GE scopes', () => {
    expect(tieneServicioInformado([fila('seccion', '1'), fila('carrera', '11')], secciones, [10])).toBe(false)
    expect(tieneServicioInformado([fila('carrera', '10')], secciones, [10])).toBe(true)
  })
  it('ignores retired and future rows', () => {
    expect(tieneServicioInformado([{ ...fila('establecimiento', null), retiradaEn: '2026-01-02T00:00:00Z' }], secciones)).toBe(false)
    expect(tieneServicioInformado([{ ...fila('establecimiento', null), rigeDesde: '2999-01-01T00:00:00Z' }], secciones)).toBe(false)
  })
  it('matches no-roster fallback without treating orphan sections as information', () => {
    expect(tieneServicioInformado([fila('seccion', '1')], [])).toBe(false)
    expect(tieneServicioInformado([fila('turno', 'MAÑANA')], [])).toBe(false)
    expect(tieneServicioInformado([fila('establecimiento', null)], [])).toBe(true)
    expect(tieneServicioInformado([{ ...fila('turno', 'MAÑANA'), estado: 'suspendido' }], [])).toBe(true)
  })
  it('requires complete GE coverage to claim normal classes but preserves partial suspension evidence', () => {
    const roster = [...secciones, { geSectionId: 2, turno: 'TARDE' }]
    expect(tieneServicioInformado([fila('seccion', '1')], roster)).toBe(false)
    expect(tieneServicioInformado([fila('turno', 'MAÑANA')], roster)).toBe(false)
    expect(tieneServicioInformado([{ ...fila('seccion', '1'), estado: 'suspendido' }], roster)).toBe(true)
    expect(tieneServicioInformado([fila('seccion', '1'), fila('turno', 'TARDE')], roster)).toBe(true)
  })
  it('requires complete institute coverage to claim normal classes but preserves suspension evidence', () => {
    expect(tieneServicioInformado([fila('carrera', '10')], [], [10, 11])).toBe(false)
    expect(tieneServicioInformado([{ ...fila('carrera', '10'), estado: 'suspendido' }], [], [10, 11])).toBe(true)
    expect(tieneServicioInformado([fila('carrera', '10'), fila('carrera', '11')], [], [10, 11])).toBe(true)
  })
  it('respects more specific normal overrides instead of using shadowed suspensions as evidence', () => {
    const roster = [...secciones, { geSectionId: 2, turno: 'TARDE' }]
    expect(tieneServicioInformado([
      { ...fila('turno', 'MAÑANA'), estado: 'suspendido' }, fila('seccion', '1'),
    ], roster)).toBe(false)
    expect(tieneServicioInformado([
      { ...fila('establecimiento', null), estado: 'suspendido' }, fila('carrera', '10'), fila('carrera', '11'),
    ], [], [10, 11])).toBe(true)
  })
})

describe('etiquetaClases', () => {
  it('shows unknown instead of claiming normal classes without information', () => {
    expect(etiquetaClases('normal', false)).toBe('Sin información de clases')
  })
  it.each([
    ['normal', 'Clases normales'], ['parcial', 'Clases parcialmente suspendidas'], ['sin', 'Clases suspendidas'],
    ['evacuado', 'Evacuado'], ['centro', 'Usado como centro de evacuados'],
  ] as const)('keeps explicit %s classes distinct from functioning', (estado, etiqueta) => {
    expect(etiquetaClases(estado, true)).toBe(etiqueta)
  })
})
