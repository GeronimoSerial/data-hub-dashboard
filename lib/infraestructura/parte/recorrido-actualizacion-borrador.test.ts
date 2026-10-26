import { describe, expect, it } from 'vitest'
import { esBorradorRecorridoActualizacion } from './recorrido-actualizacion-borrador'

function borradorConNueva(nueva: Record<string, unknown> | null) {
  return {
    generacion: 'g1',
    etapa: 'resumen',
    idsSituaciones: [],
    recorrido: { respuestas: {}, nueva, clasesEdificio: null },
    asistenciaPedagogica: { brinda: '', modalidades: [] },
  }
}

const nuevaGE = { causadaPorId: null, motivo: 'Inundación', severidad: 'Alta', secciones: [4510] }
const nuevaInstituto = { causadaPorId: null, motivo: 'Inundación', severidad: 'Alta', carreras: [2] }

describe('esBorradorRecorridoActualizacion: nueva situación según el sistema del CUE', () => {
  it('GE acepta una nueva con secciones', () => {
    expect(esBorradorRecorridoActualizacion(borradorConNueva(nuevaGE))).toBe(true)
  })

  it('GE descarta una nueva sin secciones', () => {
    const { secciones: _secciones, ...sinSecciones } = nuevaGE
    expect(esBorradorRecorridoActualizacion(borradorConNueva(sinSecciones))).toBe(false)
  })

  it('GE descarta una nueva con carreras', () => {
    expect(esBorradorRecorridoActualizacion(borradorConNueva({ ...nuevaGE, carreras: [2] }))).toBe(false)
  })

  it('institutos aceptan una nueva con carreras y sin secciones', () => {
    expect(esBorradorRecorridoActualizacion(borradorConNueva(nuevaInstituto), true)).toBe(true)
  })

  it('institutos descartan una nueva con secciones', () => {
    expect(esBorradorRecorridoActualizacion(borradorConNueva({ ...nuevaInstituto, secciones: [4510] }), true)).toBe(false)
  })

  it('institutos descartan una nueva sin carreras', () => {
    const { carreras: _carreras, ...sinCarreras } = nuevaInstituto
    expect(esBorradorRecorridoActualizacion(borradorConNueva(sinCarreras), true)).toBe(false)
  })

  it('sin nueva situación el borrador vale en ambos sistemas', () => {
    expect(esBorradorRecorridoActualizacion(borradorConNueva(null))).toBe(true)
    expect(esBorradorRecorridoActualizacion(borradorConNueva(null), true)).toBe(true)
  })
})
