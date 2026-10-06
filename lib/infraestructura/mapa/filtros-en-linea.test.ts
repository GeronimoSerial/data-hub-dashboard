import { describe, expect, it } from 'vitest'
import { cantidadFiltrosEnLinea } from './filtros-en-linea'

describe('cantidadFiltrosEnLinea', () => {
  it('muestra todos los filtros sin reservar el botón cuando entran', () => {
    expect(cantidadFiltrosEnLinea({ anchos: [40, 50, 60], anchoDisponible: 158, anchoBotonMas: 36, separacion: 4 })).toBe(3)
  })

  it('muestra cuatro de siete reservando el botón Más filtros', () => {
    expect(cantidadFiltrosEnLinea({ anchos: [40, 40, 40, 40, 40, 40, 40], anchoDisponible: 232, anchoBotonMas: 40, separacion: 8 })).toBe(4)
  })

  it('incluye el elemento justo en el borde disponible', () => {
    expect(cantidadFiltrosEnLinea({ anchos: [30, 40, 50], anchoDisponible: 106, anchoBotonMas: 24, separacion: 6 })).toBe(2)
  })

  it('no incluye un filtro que excede el borde por un píxel', () => {
    expect(cantidadFiltrosEnLinea({ anchos: [30, 40, 50], anchoDisponible: 105, anchoBotonMas: 24, separacion: 6 })).toBe(1)
  })

  it('devuelve cero cuando ni un filtro cabe junto al botón', () => {
    expect(cantidadFiltrosEnLinea({ anchos: [50, 60], anchoDisponible: 70, anchoBotonMas: 40, separacion: 8 })).toBe(0)
  })

  it('respeta el orden y no saltea un filtro ancho para mostrar uno angosto', () => {
    expect(cantidadFiltrosEnLinea({ anchos: [30, 90, 10], anchoDisponible: 80, anchoBotonMas: 30, separacion: 5 })).toBe(1)
  })

  it('devuelve cero para una lista vacía', () => {
    expect(cantidadFiltrosEnLinea({ anchos: [], anchoDisponible: 100, anchoBotonMas: 24, separacion: 4 })).toBe(0)
  })

  it('devuelve cero si el ancho disponible es cero o NaN', () => {
    expect(cantidadFiltrosEnLinea({ anchos: [20], anchoDisponible: 0, anchoBotonMas: 20, separacion: 4 })).toBe(0)
    expect(cantidadFiltrosEnLinea({ anchos: [20], anchoDisponible: Number.NaN, anchoBotonMas: 20, separacion: 4 })).toBe(0)
  })

  it('muestra el único filtro si entra', () => {
    expect(cantidadFiltrosEnLinea({ anchos: [32], anchoDisponible: 32, anchoBotonMas: 24, separacion: 8 })).toBe(1)
  })
})
