import { describe, expect, it } from 'vitest'
import {
  cantidadLluvia,
  fechaCorta,
  resumirSituacionEscuela,
  type EntradaResumen,
} from './resumen-escuela'

const base: EntradaResumen = {
  nivelMaximo: { nivel: 'bajo', horizonteHoras: null, motivo: null },
  lluviaObservada72h: { mm: 5, parcial: false, hasta: '2026-10-13T12:00:00Z' },
  lluviaPronosticada24h: { mm: 0 },
  rio: null,
  pronosticoDesactualizadoDesde: null,
}

const conRio = (
  estado: 'evacuacion' | 'alerta' | 'normal' | 'sin_dato',
  alturaM: number | null,
): EntradaResumen => ({
  ...base,
  rio: {
    estado,
    estacionNombre: 'Paso de los Libres',
    alturaM,
    medidaEn: '2026-10-13T12:00:00Z',
  },
})

describe('resumirSituacionEscuela', () => {
  it('resume el caso de lluvia leve sin estación de referencia', () => {
    expect(resumirSituacionEscuela(base)).toEqual({
      titulo: 'Situación de la escuela',
      conclusion: 'Sin señales de riesgo por lluvia ni por río.',
      puntos: [
        'Lluvia últimos 3 días: 5 mm (poca)',
        'Pronóstico próximas 24 h: sin lluvia',
        'Río: sin estación de referencia cercana',
      ],
    })
  })

  it('marca lluvia observada parcial con datos incompletos', () => {
    const r = resumirSituacionEscuela({
      ...base,
      lluviaObservada72h: { mm: 5, parcial: true, hasta: null },
    })
    expect(r.puntos[0]).toBe('Lluvia últimos 3 días: 5 mm (poca) — datos incompletos')
  })

  it('muestra sin dato cuando no hay lluvia observada', () => {
    const r = resumirSituacionEscuela({
      ...base,
      lluviaObservada72h: { mm: null, parcial: false, hasta: null },
    })
    expect(r.puntos[0]).toBe('Lluvia últimos 3 días: sin dato')
  })

  it('describe el pronóstico con cantidad y categoría', () => {
    const r = resumirSituacionEscuela({
      ...base,
      lluviaPronosticada24h: { mm: 30 },
    })
    expect(r.puntos[1]).toBe('Pronóstico próximas 24 h: 30 mm (moderada)')
  })

  it('indica cuándo el pronóstico quedó desactualizado', () => {
    const r = resumirSituacionEscuela({
      ...base,
      pronosticoDesactualizadoDesde: '2026-10-13T21:00:00Z',
    })
    expect(r.puntos[1]).toBe(
      'Pronóstico próximas 24 h: sin lluvia (desactualizado desde 13/10 18:00)',
    )
  })

  it('formatea altura del río con coma decimal', () => {
    expect(resumirSituacionEscuela(conRio('evacuacion', 9.33)).puntos[2]).toBe(
      'Río (Paso de los Libres): 9,33 m, evacuación',
    )
  })

  it('omite la altura del río cuando es null', () => {
    expect(resumirSituacionEscuela(conRio('alerta', null)).puntos[2]).toBe(
      'Río (Paso de los Libres): alerta',
    )
  })

  it.each([
    ['normal', 'normal'],
    ['sin_dato', 'sin dato'],
  ] as const)('describe el estado del río %s', (estado, texto) => {
    expect(resumirSituacionEscuela(conRio(estado, 2)).puntos[2]).toBe(
      `Río (Paso de los Libres): 2,00 m, ${texto}`,
    )
  })

  it('prioriza evacuación del río en la conclusión', () => {
    const r = resumirSituacionEscuela({
      ...conRio('evacuacion', 9.33),
      nivelMaximo: { nivel: 'muy_alto', horizonteHoras: 6, motivo: 'lluvia' },
    })
    expect(r.conclusion).toBe('Río en nivel de evacuación en la estación de referencia.')
  })

  it('informa alerta del río cuando no hay evacuación', () => {
    const r = resumirSituacionEscuela({
      ...conRio('alerta', 7.1),
      nivelMaximo: { nivel: 'alto', horizonteHoras: 6, motivo: 'lluvia' },
    })
    expect(r.conclusion).toBe('Río en alerta en la estación de referencia.')
  })

  it.each([
    ['alto', 'lluvia', 'Riesgo alto por lluvia en las próximas 12 h.'],
    ['alto', 'rafagas', 'Riesgo alto por ráfagas en las próximas 12 h.'],
    ['muy_alto', 'caudal', 'Riesgo muy alto por crecida del río en las próximas 12 h.'],
  ] as const)('conclusión para nivel %s por %s', (nivel, motivo, esperado) => {
    const r = resumirSituacionEscuela({
      ...base,
      nivelMaximo: { nivel, horizonteHoras: 12, motivo },
    })
    expect(r.conclusion).toBe(esperado)
  })

  it('omite el horizonte cuando es null', () => {
    const r = resumirSituacionEscuela({
      ...base,
      nivelMaximo: { nivel: 'alto', horizonteHoras: null, motivo: 'rafagas' },
    })
    expect(r.conclusion).toBe('Riesgo alto por ráfagas.')
  })

  it('conclusión moderada', () => {
    const r = resumirSituacionEscuela({
      ...base,
      nivelMaximo: { nivel: 'moderado', horizonteHoras: 24, motivo: 'lluvia' },
    })
    expect(r.conclusion).toBe('Riesgo moderado: conviene seguir la evolución.')
  })

  it('pide datos cuando no hay ninguna señal ni lluvia', () => {
    const r = resumirSituacionEscuela({
      ...base,
      nivelMaximo: { nivel: 'sin_dato', horizonteHoras: null, motivo: null },
      lluviaObservada72h: { mm: null, parcial: false, hasta: null },
      lluviaPronosticada24h: { mm: null },
    })
    expect(r.conclusion).toBe('Sin datos suficientes para evaluar el riesgo.')
  })

  it('nunca devuelve más de tres puntos', () => {
    const r = resumirSituacionEscuela({
      ...conRio('alerta', 7),
      lluviaObservada72h: { mm: 60, parcial: true, hasta: null },
      pronosticoDesactualizadoDesde: '2026-10-13T21:00:00Z',
    })
    expect(r.puntos).toHaveLength(3)
  })

  it('no menciona cobertura, porcentajes, umbrales internos ni identificadores', () => {
    const casos: EntradaResumen[] = [
      base,
      { ...base, lluviaObservada72h: { mm: 60, parcial: true, hasta: null } },
      { ...base, lluviaPronosticada24h: { mm: 30 }, pronosticoDesactualizadoDesde: '2026-10-13T21:00:00Z' },
      conRio('evacuacion', 9.33),
      conRio('sin_dato', null),
      {
        ...base,
        nivelMaximo: { nivel: 'muy_alto', horizonteHoras: 6, motivo: 'caudal' },
      },
    ]
    for (const caso of casos) {
      const r = resumirSituacionEscuela(caso)
      const textos = [r.titulo, r.conclusion, ...r.puntos]
      for (const texto of textos) {
        for (const prohibido of ['%', 'mm/30', 'cobertura', 'P9', '_']) {
          expect(texto).not.toContain(prohibido)
        }
      }
    }
  })
})

describe('cantidadLluvia', () => {
  it('sin lluvia por debajo de 1 mm, sin número', () => {
    expect(cantidadLluvia(0)).toBe('sin lluvia')
    expect(cantidadLluvia(0.9)).toBe('sin lluvia')
  })

  it('categorías por umbral', () => {
    expect(cantidadLluvia(1)).toBe('1 mm (poca)')
    expect(cantidadLluvia(19.4)).toBe('19 mm (poca)')
    expect(cantidadLluvia(20)).toBe('20 mm (moderada)')
    expect(cantidadLluvia(49.4)).toBe('49 mm (moderada)')
    expect(cantidadLluvia(50)).toBe('50 mm (mucha)')
  })

  it('usa coma decimal solo por debajo de 10 mm', () => {
    expect(cantidadLluvia(7.5)).toBe('7,5 mm (poca)')
    expect(cantidadLluvia(9.96)).toBe('10 mm (poca)')
    expect(cantidadLluvia(58)).toBe('58 mm (mucha)')
  })
})

describe('fechaCorta', () => {
  it('convierte ISO UTC a dd/MM HH:mm en Buenos Aires', () => {
    expect(fechaCorta('2026-10-13T19:30:00Z')).toBe('13/10 16:30')
  })

  it('cambia de día cuando corresponde', () => {
    expect(fechaCorta('2026-10-14T01:15:00Z')).toBe('13/10 22:15')
  })
})
