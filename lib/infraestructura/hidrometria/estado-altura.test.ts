import { describe, expect, it } from 'vitest'
import {
  EDAD_MAXIMA_LECTURA_HORAS,
  estadoAltura,
  evaluarLecturaMonitoreo,
  evaluarPuntoHistorico,
  type LecturaParaEstado,
} from './estado-altura'

const AHORA = new Date('2026-10-13T12:00:00Z')

function lectura(overrides: Partial<LecturaParaEstado> = {}): LecturaParaEstado {
  return {
    lecturaM: 3,
    variacionM: 0,
    alertaM: 5,
    evacuacionM: 6,
    inconsistente: false,
    ...overrides,
  }
}

function horasAtras(horas: number): string {
  return new Date(AHORA.getTime() - horas * 3_600_000).toISOString()
}

describe('estadoAltura', () => {
  it('expone la edad máxima de lectura en 18 horas', () => {
    expect(EDAD_MAXIMA_LECTURA_HORAS).toBe(18)
  })

  it('devuelve sin_dato cuando no hay lectura', () => {
    expect(estadoAltura(null)).toEqual({ estado: 'sin_dato', tendencia: 'sin_dato', vencida: false })
  })

  it('devuelve sin_dato cuando lecturaM es nula', () => {
    expect(estadoAltura(lectura({ lecturaM: null })).estado).toBe('sin_dato')
  })

  it('devuelve sin_dato cuando la lectura es inconsistente', () => {
    expect(estadoAltura(lectura({ inconsistente: true, lecturaM: 9 })).estado).toBe('sin_dato')
  })

  it('devuelve evacuacion cuando lecturaM alcanza evacuacionM', () => {
    expect(estadoAltura(lectura({ lecturaM: 6 })).estado).toBe('evacuacion')
    expect(estadoAltura(lectura({ lecturaM: 6.5 })).estado).toBe('evacuacion')
  })

  it('devuelve alerta cuando lecturaM alcanza alertaM pero no evacuacionM', () => {
    expect(estadoAltura(lectura({ lecturaM: 5 })).estado).toBe('alerta')
    expect(estadoAltura(lectura({ lecturaM: 5.9 })).estado).toBe('alerta')
  })

  it('devuelve normal cuando está bajo los umbrales disponibles', () => {
    expect(estadoAltura(lectura({ lecturaM: 4.99 })).estado).toBe('normal')
  })

  it('usa normal con un solo umbral disponible', () => {
    expect(estadoAltura(lectura({ lecturaM: 2, alertaM: null })).estado).toBe('normal')
    expect(estadoAltura(lectura({ lecturaM: 2, evacuacionM: null })).estado).toBe('normal')
  })

  it('devuelve evacuacion con sólo evacuacionM disponible y lectura por encima', () => {
    expect(estadoAltura(lectura({ lecturaM: 7, alertaM: null })).estado).toBe('evacuacion')
  })

  it('devuelve sin_dato cuando no hay ningún umbral: nunca afirma normal', () => {
    expect(
      estadoAltura(lectura({ lecturaM: 2, alertaM: null, evacuacionM: null })).estado,
    ).toBe('sin_dato')
  })

  it.each([
    [0.01, 'crece'],
    [0.006, 'crece'],
    [-0.01, 'baja'],
    [-0.006, 'baja'],
    [0.005, 'estable'],
    [-0.005, 'estable'],
    [0, 'estable'],
  ] as const)('variacionM %s produce tendencia %s', (variacionM, tendencia) => {
    expect(estadoAltura(lectura({ variacionM })).tendencia).toBe(tendencia)
  })

  it('devuelve tendencia sin_dato cuando variacionM es nula', () => {
    expect(estadoAltura(lectura({ variacionM: null })).tendencia).toBe('sin_dato')
  })

  describe('vigencia de la lectura', () => {
    it('clasifica una lectura reciente por encima de evacuación como evacuacion, no vencida', () => {
      expect(
        estadoAltura(lectura({ lecturaM: 7, medidaEn: horasAtras(1) }), { ahora: AHORA }),
      ).toEqual({ estado: 'evacuacion', tendencia: 'estable', vencida: false })
    })

    it('no clasifica una lectura de 19 horas: sin_dato y vencida', () => {
      expect(
        estadoAltura(lectura({ lecturaM: 7, medidaEn: horasAtras(19) }), { ahora: AHORA }),
      ).toEqual({ estado: 'sin_dato', tendencia: 'sin_dato', vencida: true })
    })

    it('acepta una lectura exactamente de 18 horas', () => {
      const resultado = estadoAltura(lectura({ lecturaM: 7, medidaEn: horasAtras(18) }), {
        ahora: AHORA,
      })
      expect(resultado.estado).toBe('evacuacion')
      expect(resultado.vencida).toBe(false)
    })

    it('respeta una edad máxima personalizada', () => {
      expect(
        estadoAltura(lectura({ medidaEn: horasAtras(3) }), { ahora: AHORA, edadMaximaHoras: 2 }),
      ).toMatchObject({ estado: 'sin_dato', vencida: true })
    })

    it('trata una fecha no interpretable como vencida', () => {
      expect(
        estadoAltura(lectura({ lecturaM: 7, medidaEn: 'no-es-fecha' }), { ahora: AHORA }),
      ).toEqual({ estado: 'sin_dato', tendencia: 'sin_dato', vencida: true })
    })

    it('sin medidaEn conserva el comportamiento previo y no marca vencida', () => {
      expect(estadoAltura(lectura({ lecturaM: 7 }), { ahora: AHORA })).toEqual({
        estado: 'evacuacion',
        tendencia: 'estable',
        vencida: false,
      })
    })
  })
})
describe('evaluarLecturaMonitoreo', () => {
  it('clasifica como sin_lectura cuando la lectura es nula', () => {
    expect(evaluarLecturaMonitoreo(null, { ahora: AHORA })).toEqual({
      estadoNivel: 'sin_dato',
      calidad: 'sin_lectura',
      lecturaVencida: false,
      inconsistente: false,
      motivosInconsistencia: [],
      tieneUmbrales: false,
      variacionPublicada: {
        variacionM: null,
        periodoHoras: null,
        estadoPublicado: null,
        tendencia: 'sin_dato',
        confiable: false,
      },
    })
  })

  it('bloquea la tendencia confiable cuando la lectura es inconsistente aunque tenga variacionM', () => {
    const res = evaluarLecturaMonitoreo(
      {
        lecturaM: 0,
        variacionM: 0.14,
        periodoHoras: 12,
        estadoPublicado: 'CRECE',
        alertaM: 5,
        evacuacionM: 6,
        inconsistente: true,
        motivosInconsistencia: ['lectura_cero_con_crece'],
        medidaEn: horasAtras(2),
      },
      { ahora: AHORA },
    )

    expect(res).toEqual({
      estadoNivel: 'sin_dato',
      calidad: 'inconsistente',
      lecturaVencida: false,
      inconsistente: true,
      motivosInconsistencia: ['lectura_cero_con_crece'],
      tieneUmbrales: true,
      variacionPublicada: {
        variacionM: 0.14,
        periodoHoras: 12,
        estadoPublicado: 'CRECE',
        tendencia: 'sin_dato',
        confiable: false,
      },
    })
  })

  it('marca como vencida e invalida la tendencia confiable cuando supera las 18 horas', () => {
    const res = evaluarLecturaMonitoreo(
      {
        lecturaM: 5.4,
        variacionM: -0.05,
        periodoHoras: 12,
        estadoPublicado: 'BAJA',
        alertaM: 5,
        evacuacionM: 6,
        inconsistente: false,
        medidaEn: horasAtras(20),
      },
      { ahora: AHORA },
    )

    expect(res.estadoNivel).toBe('sin_dato')
    expect(res.calidad).toBe('vencida')
    expect(res.lecturaVencida).toBe(true)
    expect(res.variacionPublicada).toEqual({
      variacionM: -0.05,
      periodoHoras: 12,
      estadoPublicado: 'BAJA',
      tendencia: 'sin_dato',
      confiable: false,
    })
  })

  it('conserva tendencia confiable cuando faltan umbrales pero la lectura y variación son válidas', () => {
    const res = evaluarLecturaMonitoreo(
      {
        lecturaM: 3.4,
        variacionM: 0.08,
        periodoHoras: 6,
        estadoPublicado: 'CRECE',
        alertaM: null,
        evacuacionM: null,
        inconsistente: false,
        medidaEn: horasAtras(2),
      },
      { ahora: AHORA },
    )

    expect(res.estadoNivel).toBe('sin_dato')
    expect(res.calidad).toBe('sin_umbrales')
    expect(res.tieneUmbrales).toBe(false)
    expect(res.variacionPublicada).toEqual({
      variacionM: 0.08,
      periodoHoras: 6,
      estadoPublicado: 'CRECE',
      tendencia: 'crece',
      confiable: true,
    })
  })

  it('mantiene separados estadoNivel en alerta y tendencia en baja', () => {
    const res = evaluarLecturaMonitoreo(
      {
        lecturaM: 5.3,
        variacionM: -0.04,
        periodoHoras: 12,
        estadoPublicado: 'BAJA',
        alertaM: 5,
        evacuacionM: 6,
        inconsistente: false,
        medidaEn: horasAtras(1),
      },
      { ahora: AHORA },
    )

    expect(res.estadoNivel).toBe('alerta')
    expect(res.calidad).toBe('vigente')
    expect(res.variacionPublicada.tendencia).toBe('baja')
    expect(res.variacionPublicada.confiable).toBe(true)
  })
})

describe('evaluarPuntoHistorico', () => {
  it('clasifica una observación histórica antigua como valida sin aplicar vencimiento de 18h', () => {
    const res = evaluarPuntoHistorico({
      lecturaM: 6.1,
      variacionM: 0.03,
      periodoHoras: 12,
      estadoPublicado: 'CRECE',
      alertaM: 5,
      evacuacionM: 6,
      inconsistente: false,
      medidaEn: '2026-10-01T00:00:00.000Z',
    })

    expect(res).toEqual({
      estadoNivel: 'evacuacion',
      calidad: 'valida',
      tieneUmbrales: true,
      variacionPublicada: {
        variacionM: 0.03,
        periodoHoras: 12,
        estadoPublicado: 'CRECE',
        tendencia: 'crece',
        confiable: true,
      },
    })
  })

  it('marca como inconsistente y tendencia sin_dato una observación histórica con flag inconsistente', () => {
    const res = evaluarPuntoHistorico({
      lecturaM: 0,
      variacionM: 0.1,
      periodoHoras: 12,
      estadoPublicado: 'CRECE',
      alertaM: 5,
      evacuacionM: 6,
      inconsistente: true,
    })

    expect(res.calidad).toBe('inconsistente')
    expect(res.estadoNivel).toBe('sin_dato')
    expect(res.variacionPublicada.tendencia).toBe('sin_dato')
    expect(res.variacionPublicada.confiable).toBe(false)
  })
})
