import { describe, expect, it } from 'vitest'
import { distanciaRectaM, elegirDestino } from './destino'

const ap = (cueAnexo: string, lat: number, lon: number) => ({ cueAnexo, nombre: `Escuela ${cueAnexo}`, lat, lon })

describe('distanciaRectaM', () => {
  it('calcula ~111 km por grado de latitud', () => {
    expect(distanciaRectaM(-28, -58, -29, -58)).toBeGreaterThan(110_000)
    expect(distanciaRectaM(-28, -58, -29, -58)).toBeLessThan(112_000)
  })
  it('es 0 para el mismo punto', () => {
    expect(distanciaRectaM(-28, -58, -28, -58)).toBe(0)
  })
})

describe('elegirDestino', () => {
  const origen = ap('A', -28, -58)

  it('elige la apta más cercana en línea recta y nunca a sí misma', () => {
    const d = elegirDestino(origen, [ap('A', -28, -58), ap('B', -28.5, -58), ap('C', -28.1, -58)])
    expect(d?.cueAnexo).toBe('C')
    expect(d?.distanciaRectaM).toBeGreaterThan(10_000)
    expect(d?.distanciaRectaM).toBeLessThan(12_000)
  })

  it('devuelve null sin otras aptas', () => {
    expect(elegirDestino(origen, [ap('A', -28, -58)])).toBeNull()
    expect(elegirDestino(origen, [])).toBeNull()
  })

  it('desempata por CUE de forma determinista', () => {
    const d = elegirDestino(origen, [ap('Z', -28.1, -58), ap('B', -28.1, -58)])
    expect(d?.cueAnexo).toBe('B')
  })

  it('con candidatos OSM prefiere el primero que hoy sea apto (ya ordenados por camino)', () => {
    const aptas = [ap('B', -28.5, -58), ap('C', -28.1, -58)]
    const d = elegirDestino(origen, aptas, [
      { cueAnexo: 'X', distanciaM: 800 },
      { cueAnexo: 'B', distanciaM: 9_000 },
      { cueAnexo: 'C', distanciaM: 15_000 },
    ])
    expect(d).toMatchObject({ cueAnexo: 'B', distanciaRutaM: 9_000 })
  })

  it('si ningún candidato OSM es apto hoy cae a la línea recta, sin distancia por camino', () => {
    const d = elegirDestino(origen, [ap('C', -28.1, -58)], [{ cueAnexo: 'X', distanciaM: 800 }])
    expect(d).toMatchObject({ cueAnexo: 'C', distanciaRutaM: null })
  })
})
