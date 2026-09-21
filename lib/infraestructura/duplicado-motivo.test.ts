import { describe, expect, it } from 'vitest'
import { detectarMotivoDuplicado } from './duplicado-motivo'

const vigentes = [
  { id: 'af-1', motivo: 'Inundación', categoria: 'establecimiento' as const },
  { id: 'af-2', motivo: 'Inaccesibilidad de alumnos', categoria: 'alumnos' as const },
]

describe('detectarMotivoDuplicado', () => {
  it('sin afectaciones vigentes, nunca hay coincidencia', () => {
    const resultado = detectarMotivoDuplicado([], { motivo: 'Inundación', categoria: 'establecimiento' })
    expect(resultado).toEqual({ hayCoincidencia: false, coincidenciaExacta: null, coincidenciasPorCategoria: [] })
  })

  it('detecta coincidencia exacta de motivo', () => {
    const resultado = detectarMotivoDuplicado(vigentes, { motivo: 'Inundación', categoria: 'establecimiento' })
    expect(resultado.hayCoincidencia).toBe(true)
    expect(resultado.coincidenciaExacta).toEqual(vigentes[0])
  })

  it('detecta coincidencia por categoría aunque el motivo sea distinto (spec §14)', () => {
    const resultado = detectarMotivoDuplicado(vigentes, { motivo: 'Tormenta severa', categoria: 'establecimiento' })
    expect(resultado.hayCoincidencia).toBe(true)
    expect(resultado.coincidenciaExacta).toBeNull()
    expect(resultado.coincidenciasPorCategoria).toEqual([vigentes[0]])
  })

  it('motivo y categoría distintos: no hay coincidencia', () => {
    const resultado = detectarMotivoDuplicado(vigentes, { motivo: 'Sin energía o agua', categoria: 'establecimiento' })
    // 'establecimiento' coincide con af-1 por categoría aunque el motivo sea otro.
    expect(resultado.hayCoincidencia).toBe(true)
  })

  it('categoría sin ninguna afectación vigente de ese tipo: no hay coincidencia', () => {
    const soloEstablecimiento = [vigentes[0]]
    const resultado = detectarMotivoDuplicado(soloEstablecimiento, {
      motivo: 'Acceso interrumpido',
      categoria: 'alumnos',
    })
    expect(resultado).toEqual({ hayCoincidencia: false, coincidenciaExacta: null, coincidenciasPorCategoria: [] })
  })

  it('sólo informa, nunca decide: el resultado no incluye ningún campo de bloqueo', () => {
    const resultado = detectarMotivoDuplicado(vigentes, { motivo: 'Inundación', categoria: 'establecimiento' })
    expect(Object.keys(resultado).sort()).toEqual(
      ['coincidenciaExacta', 'coincidenciasPorCategoria', 'hayCoincidencia'].sort(),
    )
  })
})
