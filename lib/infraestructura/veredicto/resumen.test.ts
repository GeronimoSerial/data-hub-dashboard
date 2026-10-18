import { describe, expect, it } from 'vitest'
import { lecturaDelDia, MAX_PUNTOS_RESUMEN, resumirVeredicto } from './resumen'

describe('resumirVeredicto', () => {
  it('uses the first AI sentence as headline and the rest as points', () => {
    const r = resumirVeredicto({
      texto: 'ignored',
      frases: [{ texto: 'Río en alerta.' }, { texto: 'Lluvia moderada.' }],
    })
    expect(r).toEqual({ titular: 'Río en alerta.', puntos: ['Lluvia moderada.'] })
  })

  it('splits the plain text into sentences when there are no AI sentences', () => {
    const r = resumirVeredicto({ texto: 'Uno. Dos. Tres.', frases: null })
    expect(r).toEqual({ titular: 'Uno.', puntos: ['Dos.', 'Tres.'] })
  })

  it('truncates long stored verdicts to the maximum number of points', () => {
    const frases = Array.from({ length: 8 }, (_, i) => ({ texto: `Frase ${i}.` }))
    const r = resumirVeredicto({ texto: null, frases })
    expect(r.puntos).toHaveLength(MAX_PUNTOS_RESUMEN)
  })

  it('returns an empty headline without text', () => {
    expect(resumirVeredicto({ texto: null, frases: null })).toEqual({ titular: '', puntos: [] })
  })
})

describe('lecturaDelDia', () => {
  const v = (ambito: string, nivel: string, texto: string, fuente = 'ia') => ({
    ambito,
    nivel,
    texto,
    fuente,
    frases: null,
    metricas: [],
  })

  it('builds the headline, the ordered department lines and the quiet list', () => {
    const lectura = lecturaDelDia([
      v('departamento:GOYA', 'vigilancia', 'Goya sube. Más texto.'),
      v('provincia', 'alerta', 'Crecida en el oeste. Otra.'),
      v('departamento:ESQUINA', 'alerta', 'Esquina en alerta.'),
      v('departamento:SAUCE', 'sin_senal', 'Sin señales.'),
    ])

    expect(lectura.titular).toBe('Crecida en el oeste.')
    expect(lectura.lineas.map((l) => [l.nombre, l.texto])).toEqual([
      ['Esquina', 'Esquina en alerta.'],
      ['Goya', 'Goya sube.'],
    ])
    expect(lectura.sinNovedad).toContain('Sauce')
    expect(lectura.sinNovedad).not.toContain('Goya')
    expect(lectura.conIa).toBe(true)
  })

  it('reports no AI when every row comes from the template', () => {
    expect(lecturaDelDia([v('provincia', 'sin_senal', 'x', 'plantilla')]).conIa).toBe(false)
  })
})
