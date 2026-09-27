import { describe, expect, it } from 'vitest'
import { generarBriefing, type ConteosPorNivel, type RunBriefing } from './briefing'

const RUN_ACTUAL: RunBriefing = {
  id: 'run-2',
  cobertura: { procesadas: 100, conEvidencia: 80, sinEvidencia: 20 },
  publicadoEn: '2026-09-27T06:00:00Z',
}

const RUN_ANTERIOR: RunBriefing = {
  id: 'run-1',
  cobertura: { procesadas: 100, conEvidencia: 70, sinEvidencia: 30 },
  publicadoEn: '2026-09-26T06:00:00Z',
}

describe('generarBriefing', () => {
  it('primer corte (sin anterior) devuelve una única línea explicativa', () => {
    const lineas = generarBriefing(RUN_ACTUAL, null, {
      actual: { alto: 3, muy_alto: 1 },
      anterior: null,
    })

    expect(lineas).toHaveLength(1)
    expect(lineas[0]).toContain('primer corte disponible')
    expect(lineas[0]).not.toContain('Sin cambios significativos')
  })

  it('corte con más escuelas en alto que el anterior menciona el número exacto', () => {
    const lineas = generarBriefing(RUN_ACTUAL, RUN_ANTERIOR, {
      actual: { alto: 5, muy_alto: 3 },
      anterior: { alto: 2, muy_alto: 1 },
    })

    expect(lineas.join('\n')).toContain('de 3 a 8')
    expect(lineas.join('\n')).toContain('5 más')
  })

  it('corte sin cambios devuelve "Sin cambios significativos respecto del corte anterior"', () => {
    const lineas = generarBriefing(RUN_ACTUAL, RUN_ANTERIOR, {
      actual: { alto: 2, muy_alto: 1 },
      anterior: { alto: 1, muy_alto: 2 },
    })

    expect(lineas).toContain('Sin cambios significativos respecto del corte anterior.')
  })

  it('cuando faltan los conteos del anterior no inventa la comparación', () => {
    const lineas = generarBriefing(RUN_ACTUAL, RUN_ANTERIOR, {
      actual: { alto: 5, muy_alto: 3 },
      anterior: null,
    })

    expect(lineas.join('\n')).toContain('No hay conteos del corte anterior para comparar.')
    expect(lineas.join('\n')).not.toContain('subieron de')
  })

  it('nunca devuelve más de 5 líneas ni menos de 1, y es determinista', () => {
    const escenarios: Array<[RunBriefing, RunBriefing | null, ConteosPorNivel]> = [
      [RUN_ACTUAL, null, { actual: {}, anterior: null }],
      [RUN_ACTUAL, RUN_ANTERIOR, { actual: { alto: 9 }, anterior: { alto: 1 } }],
      [
        { ...RUN_ACTUAL, cobertura: null },
        RUN_ANTERIOR,
        { actual: { muy_alto: 4 }, anterior: { muy_alto: 4 } },
      ],
    ]

    for (const [actual, anterior, conteos] of escenarios) {
      const primera = generarBriefing(actual, anterior, conteos)
      const segunda = generarBriefing(actual, anterior, conteos)
      expect(primera.length).toBeGreaterThanOrEqual(1)
      expect(primera.length).toBeLessThanOrEqual(5)
      expect(segunda).toEqual(primera)
    }
  })

  it('la cobertura con evidencia refleja el porcentaje y la variación', () => {
    const lineas = generarBriefing(RUN_ACTUAL, RUN_ANTERIOR, {
      actual: { alto: 0 },
      anterior: { alto: 0 },
    })

    expect(lineas.join('\n')).toContain('80 de 100 escuelas procesadas (80%)')
    expect(lineas.join('\n')).toContain('Antes: 70.')
  })
})
