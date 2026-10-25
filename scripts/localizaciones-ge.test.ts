import { describe, expect, it } from 'vitest'
import { completarLocalizaciones } from './localizaciones-ge.mjs'

const escuela = { cue_anexo: '1801936-00', establecimiento_nombre: 'ESCUELA JARDÍN Nº 56', departamento: 'CAPITAL', localidad: 'CORRIENTES' }
describe('completarLocalizaciones', () => {
  it('incorpora una escuela de GE sin inventar coordenadas', () => {
    const r = completarLocalizaciones([], [escuela, escuela])
    expect(r.nuevas).toHaveLength(1)
    expect(r.registros[0]).toEqual({ cueAnexo: '1801936-00', nombre: escuela.establecimiento_nombre, departamento: 'CAPITAL', localidad: 'CORRIENTES', lat: null, lon: null, geoCalidad: null })
  })
  it('preserva los datos y coordenadas existentes y es idempotente', () => {
    const existente = { cueAnexo: '1801936-00', nombre: 'Nombre publicado', lat: -27, lon: -58 }
    expect(completarLocalizaciones([existente], [escuela]).registros).toEqual([existente])
    const r = completarLocalizaciones([], [escuela])
    expect(completarLocalizaciones(r.registros, [escuela]).nuevas).toEqual([])
  })
  it('excluye pruebas y CUE inválidos sin impedir incorporar escuelas reales', () => {
    const r = completarLocalizaciones([], [escuela, { ...escuela, cue_anexo: '1800000-00', establecimiento_nombre: 'PRUEBAS POF' }, { ...escuela, cue_anexo: '1800000-01', establecimiento_nombre: 'PRUEBAS POF (A1)' }, { ...escuela, cue_anexo: '1801936' }])
    expect(r.nuevas).toHaveLength(1)
    expect(r.excluidas).toHaveLength(3)
  })
  it('rechaza identidades incompletas o contradictorias antes de publicar', () => {
    expect(() => completarLocalizaciones([], [{ ...escuela, establecimiento_nombre: '' }])).toThrow(/incompleta/)
    expect(() => completarLocalizaciones([], [escuela, { ...escuela, departamento: 'GOYA' }])).toThrow(/contradictoria/)
  })
})
