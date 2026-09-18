import { describe, expect, it } from 'vitest'
import {
  debeMostrarRigeDesde,
  formatearCargaCorta,
  formatearRigeDesde,
} from './historial-formato'

// Los timestamps se construyen con `new Date(año, mes, día, hora, minuto)` y
// no con literales ISO en UTC: las funciones formatean en hora local, así
// que un literal con `Z` haría que la prueba dependiera del huso del
// entorno que la corre.
function iso(anio: number, mes: number, dia: number, hora: number, minuto: number): string {
  return new Date(anio, mes - 1, dia, hora, minuto, 0, 0).toISOString()
}

describe('formatearCargaCorta', () => {
  it('usa el formato "18 sep · 10:35" del ejemplo de la spec §15', () => {
    expect(formatearCargaCorta(iso(2026, 9, 18, 10, 35))).toBe('18 sep · 10:35')
  })

  it('completa la hora con dos dígitos', () => {
    expect(formatearCargaCorta(iso(2026, 1, 5, 9, 4))).toBe('5 ene · 09:04')
  })

  it('devuelve cadena vacía ante un timestamp ilegible', () => {
    expect(formatearCargaCorta('no es una fecha')).toBe('')
  })
})

describe('formatearRigeDesde', () => {
  it('usa la redacción de la spec §13', () => {
    expect(formatearRigeDesde(iso(2026, 9, 18, 10, 30))).toBe(
      'Rige desde el 18 de septiembre a las 10:30',
    )
  })

  it('devuelve cadena vacía ante un timestamp ilegible', () => {
    expect(formatearRigeDesde('')).toBe('')
  })
})

describe('debeMostrarRigeDesde', () => {
  it('no la muestra cuando la carga y la vigencia son el mismo instante', () => {
    const momento = iso(2026, 9, 18, 10, 35)
    expect(debeMostrarRigeDesde(momento, momento)).toBe(false)
  })

  it('la muestra cuando difieren dentro del mismo día', () => {
    expect(debeMostrarRigeDesde(iso(2026, 9, 18, 10, 35), iso(2026, 9, 18, 10, 30))).toBe(true)
  })

  it('reconoce el mismo instante escrito con otro desplazamiento horario', () => {
    expect(debeMostrarRigeDesde('2026-09-18T10:35:00.000Z', '2026-09-18T07:35:00.000-03:00')).toBe(false)
  })

  it('no la muestra si la vigencia es ilegible', () => {
    expect(debeMostrarRigeDesde(iso(2026, 9, 18, 10, 35), 'vacío')).toBe(false)
  })
})
