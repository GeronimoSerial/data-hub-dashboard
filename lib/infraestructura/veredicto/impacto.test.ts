import { describe, expect, it } from 'vitest'
import { agregarImpacto, metricasImpacto, sumarImpacto } from './impacto'

const escuela = (departamento: string, extra: Partial<Parameters<typeof agregarImpacto>[0]['escuelas'][number]> = {}) => ({
  cueAnexo: `${departamento}-${Math.random()}`,
  departamento,
  clases: 'normal' as const,
  apoyo: null,
  alumnosSinClases: 0,
  afectaciones: 0,
  ...extra,
})

describe('agregarImpacto', () => {
  it('groups affected schools by normalized department', () => {
    const impacto = agregarImpacto({
      escuelas: [
        escuela('Goya', { clases: 'sin', alumnosSinClases: 120, afectaciones: 2, apoyo: 'cuadernillo' }),
        escuela('GOYA', { clases: 'parcial', afectaciones: 1 }),
        escuela('Esquina'),
      ],
      snapshots: [],
      aislamiento: {},
    })

    expect(impacto.get('GOYA')).toMatchObject({
      situacionesAbiertas: 3,
      escuelasSinClases: 2,
      alumnosSinClases: 120,
      asistenciaPedagogica: 1,
    })
    expect(impacto.has('ESQUINA')).toBe(false)
  })

  it('counts radar and access risk once per school on the 72 h horizon', () => {
    const impacto = agregarImpacto({
      escuelas: [],
      snapshots: [
        { cueAnexo: '1', departamento: 'LAVALLE', horizonteHoras: 72, nivelRiesgo: 'muy_alto', nivelRiesgoAcceso: 'alto' },
        { cueAnexo: '1', departamento: 'LAVALLE', horizonteHoras: 24, nivelRiesgo: 'alto', nivelRiesgoAcceso: 'alto' },
        { cueAnexo: '2', departamento: 'LAVALLE', horizonteHoras: 72, nivelRiesgo: 'moderado', nivelRiesgoAcceso: 'alto' },
        { cueAnexo: '3', departamento: null, horizonteHoras: 72, nivelRiesgo: 'alto', nivelRiesgoAcceso: null },
      ],
      aislamiento: { '2': 3, '1': 1 },
    })

    expect(impacto.get('LAVALLE')).toMatchObject({
      radarAlto: 1,
      escuelasAccesoRiesgo: 2,
      escuelasAisladas: 1,
    })
  })
})

describe('metricasImpacto / sumarImpacto', () => {
  it('emits citable metrics only for non zero figures', () => {
    const metricas = metricasImpacto({
      situacionesAbiertas: 0,
      escuelasSinClases: 2,
      alumnosSinClases: 50,
      asistenciaPedagogica: 0,
      escuelasAisladas: 0,
      escuelasAccesoRiesgo: 0,
      radarAlto: 0,
    })
    expect(metricas.map((m) => [m.id, m.valor])).toEqual([
      ['escuelas.sin_clases', 2],
      ['alumnos.sin_clases', 50],
    ])
  })

  it('adds every department into the provincial figure', () => {
    const impacto = agregarImpacto({
      escuelas: [escuela('Goya', { clases: 'sin' }), escuela('Lavalle', { clases: 'sin' })],
      snapshots: [],
      aislamiento: {},
    })
    expect(sumarImpacto(impacto.values()).escuelasSinClases).toBe(2)
  })
})
