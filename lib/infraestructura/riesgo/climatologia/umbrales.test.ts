import { describe, expect, it } from 'vitest'
import { ANIOS_MINIMOS_CLIMATOLOGIA, calcularUmbralesAcumulados } from './umbrales'
import { diasDelAnio } from './serie-diaria'

function anioCompleto(anio: number, valor: number, nulos = 0) {
  const valores: Array<number | null> = new Array(diasDelAnio(anio)).fill(valor)
  for (let indice = 0; indice < nulos; indice++) valores[indice] = null
  return { anio, valores }
}

function serieCompleta(desde: number, cantidad: number, valor = 10) {
  return Array.from({ length: cantidad }, (_, indice) => anioCompleto(desde + indice, valor))
}

describe('calcularUmbralesAcumulados', () => {
  it('exige al menos ANIOS_MINIMOS_CLIMATOLOGIA años completos', () => {
    expect(ANIOS_MINIMOS_CLIMATOLOGIA).toBe(10)
    expect(calcularUmbralesAcumulados({ geometryRef: 'celda-a', anios: serieCompleta(2000, 9) })).toBeNull()
  })

  it('calcula umbrales con 10 años completos y reporta cobertura', () => {
    const resultado = calcularUmbralesAcumulados({
      geometryRef: 'celda-a',
      anios: serieCompleta(2000, 10),
    })

    expect(resultado).not.toBeNull()
    expect(resultado!.aniosCobertura).toBe(10)
    expect(resultado!.diasCobertura).toBe(
      Array.from({ length: 10 }, (_, i) => diasDelAnio(2000 + i)).reduce((a, b) => a + b, 0),
    )
    expect(resultado!.periodoDesde).toBe('2000-01-01')
    expect(resultado!.periodoHasta).toBe('2009-12-31')
    expect(resultado!.puntos.length).toBeGreaterThan(0)
    expect(resultado!.puntos.every((punto) => punto.geometryRef === 'celda-a')).toBe(true)
  })

  it('excluye los años incompletos del cálculo y de la cobertura', () => {
    const completos = serieCompleta(2000, 10)
    const incompleto = { anio: 2010, valores: new Array(diasDelAnio(2010)).fill(50).map((_, i) => (i < 100 ? 50 : null)) }

    const resultado = calcularUmbralesAcumulados({
      geometryRef: 'celda-a',
      anios: [...completos, incompleto],
    })

    expect(resultado).not.toBeNull()
    expect(resultado!.aniosCobertura).toBe(10)
    expect(resultado!.periodoHasta).toBe('2009-12-31')
    expect(resultado!.diasCobertura).toBe(
      Array.from({ length: 10 }, (_, i) => diasDelAnio(2000 + i)).reduce((a, b) => a + b, 0),
    )
    // El valor 50 del año incompleto no debe colarse en el percentil máximo.
    const p99Todos = resultado!.puntos.find((punto) => punto.percentil === 'p99' && punto.muestra === 'todos_los_dias')
    expect(p99Todos?.valor).toBe(10)
  })

  it('nunca cuenta los nulos como 0 mm: sólo suma los días con dato', () => {
    // Año con 18 nulos sobre 365 días: 347 días con dato = 95,07 % (completo).
    const conNulos = Array.from({ length: 9 }, (_, i) => anioCompleto(2000 + i, 10))
    conNulos.push(anioCompleto(2009, 10, 18))

    const resultado = calcularUmbralesAcumulados({ geometryRef: 'celda-a', anios: conNulos })

    expect(resultado).not.toBeNull()
    expect(resultado!.aniosCobertura).toBe(10)
    const diasEsperados =
      Array.from({ length: 9 }, (_, i) => diasDelAnio(2000 + i)).reduce((a, b) => a + b, 0) + (diasDelAnio(2009) - 18)
    expect(resultado!.diasCobertura).toBe(diasEsperados)
  })
})
