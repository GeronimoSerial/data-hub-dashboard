import { describe, expect, it } from 'vitest'
import { etiquetaUnidadLluvia } from './leyenda'
import {
  colorLluvia,
  colorProbabilidad,
  indiceCercano,
  interpolarBilineal,
  letraViento,
  rotacionFlecha,
  fechaRadar,
  pixelAGrilla,
  formatearAntiguedad,
  rellenarAnilloExterior,
  valoresEnGrilla,
} from './escalas'

describe('escalas y utilidades del radar', () => {
  it('expresa las unidades según el paso sin dividir la suma de tres horas', () => {
    expect(etiquetaUnidadLluvia(3)).toBe('mm en 3 h')
    expect(etiquetaUnidadLluvia(1)).toBe('mm/h')
  })
  it('mantiene transparentes los valores bajo umbral y colorea la lluvia', () => {
    expect(colorLluvia(0)).toEqual([0,0,0,0])
    expect(colorLluvia(0.1)[3]).toBeGreaterThan(0)
    expect(colorLluvia(80)[0]).toBeGreaterThan(150)
  })
  it('aplica el umbral y rampas de probabilidad', () => {
    expect(colorProbabilidad(9)).toEqual([0,0,0,0])
    expect(colorProbabilidad(10)[3]).toBeGreaterThan(0)
    expect(colorProbabilidad(100)[0]).toBeGreaterThan(colorProbabilidad(10)[0])
  })
  it('interpola bilinealmente ignorando celdas nulas', () => {
    expect(interpolarBilineal({filas:2,columnas:2},[0,10,20,30],0.5,0.5)).toBe(15)
    expect(interpolarBilineal({filas:2,columnas:2},[null,10,20,30],0,0)).toBeNull()
    expect(interpolarBilineal({filas:2,columnas:2},[null,10,20,30],0.5,0.5)).toBe(20)
  })
  it('interpolates both axes smoothly and maps row zero to the north canvas edge', () => {
    const grid = { filas: 2, columnas: 2 }
    const values = [0,10,0,10]
    expect(interpolarBilineal(grid, values, 0.5, 0.5)).toBe(5)
    expect(interpolarBilineal(grid, values, 0.5, 0)).toBe(0)
    expect(interpolarBilineal(grid, values, 0.5, 1)).toBe(10)
    expect(interpolarBilineal(grid, [0,0,10,10], 0, 0.5)).toBe(0)
    expect(interpolarBilineal(grid, [0,0,10,10], 1, 0.5)).toBe(10)
    expect(pixelAGrilla(0,0,601,301,11,21).fila).toBe(0)
    expect(pixelAGrilla(0,300,601,301,11,21).fila).toBe(10)
  })
  it('reorders cell-list values and pads only the outer ring with nearest values', () => {
    const grid={filas:3,columnas:3,celdas:[{fila:2,columna:2},{fila:0,columna:0},{fila:1,columna:1}]}
    expect(valoresEnGrilla(grid,[30,10,20])).toEqual([10,null,null,null,20,null,null,null,30])
    expect(rellenarAnilloExterior({filas:3,columnas:3},[10,null,null,null,20,null,null,null,30])).toEqual([10,10,10,10,20,20,10,20,30])
  })
  it('rota hacia donde va el viento y usa rumbos en español', () => {
    expect(rotacionFlecha(90)).toBe(270)
    expect(rotacionFlecha(337)).toBe(157)
    expect(letraViento(337)).toBe('NNO')
    expect(letraViento(0)).toBe('N')
    expect(letraViento(90)).toBe('E')
    expect(letraViento(180)).toBe('S')
  })
  it('selecciona cuadro cercano y formatea en la zona argentina', () => {
    expect(indiceCercano(['2026-01-01T00:00:00Z','2026-01-01T03:00:00Z'],Date.parse('2026-01-01T02:00:00Z'))).toBe(1)
    expect(fechaRadar('2026-10-01T18:00:00Z',{hour:'2-digit',minute:'2-digit',hour12:false})).toContain('15')
  })
  it('mapea píxeles de arriba-izquierda a filas norte-sur de la grilla', () => {
    expect(pixelAGrilla(0,0,601,301,11,21)).toEqual({fila:0,columna:0})
    expect(pixelAGrilla(600,300,601,301,11,21)).toEqual({fila:10,columna:20})
    expect(pixelAGrilla(300,150,601,301,11,21)).toEqual({fila:5,columna:10})
  })
  it('resume la frescura en horas y minutos', () => {
    expect(formatearAntiguedad(142)).toBe('hace 2 h 22 min')
  })
})
