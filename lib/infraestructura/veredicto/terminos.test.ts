import { describe, expect, it } from 'vitest'
import type { MetricaAutorizada } from '../briefing-ia/metricas'
import { contieneTerminoProhibidoVeredicto, validarVeredictoAmbito } from './terminos'

const METRICAS: MetricaAutorizada[] = [
  { id: 'rio.parana.nivel', valor: 4.25, etiqueta: 'Nivel del río Paraná (m)' },
  { id: 'lluvia.observada.total', valor: 12, etiqueta: 'Lluvia observada (mm)' },
]

describe('contieneTerminoProhibidoVeredicto: siempre prohibidos', () => {
  it.each([
    ['Hay 2 escuelas sin clases.', ['escuelas.sin_clases']],
    ['Un establecimiento con asistencia pedagógica.', ['escuelas.asistencia_pedagogica']],
  ])('allows describing affected schools: %s', (texto, refs) => {
    expect(contieneTerminoProhibidoVeredicto(texto, refs)).toBe(false)
  })

  it('blocks recommendations phrased with "recomendamos"', () => {
    expect(contieneTerminoProhibidoVeredicto('Recomendamos evitar la costa.', [])).toBe(true)
  })

  it.each([
    ['Se deben tomar medidas.', []],
    ['Se recomienda precaución en la costa.', ['rio.parana.nivel']],
    ['Se debe evacuar la zona.', ['rio.parana.nivel']],
    ['Las familias deben evacuen hoy.', ['rio.parana.nivel']],
  ])('bloquea órdenes u recomendaciones operativas: %s', (texto, refs) => {
    expect(contieneTerminoProhibidoVeredicto(texto, refs)).toBe(true)
  })

  it.each([
    ['Se suspenden las clases mañana.', ['rio.parana.nivel']],
    ['Suspender clases en la zona.', []],
  ])('bloquea la suspensión de clases: %s', (texto, refs) => {
    expect(contieneTerminoProhibidoVeredicto(texto, refs)).toBe(true)
  })

  it('bloquea evasión letra por letra de un término prohibido', () => {
    expect(contieneTerminoProhibidoVeredicto('a-l-e-r-t-a en el río', [])).toBe(true)
  })
})

describe('contieneTerminoProhibidoVeredicto: probabilidad y porcentajes', () => {
  it('bloquea "probabilidad" sin ref de lluvia.ens.', () => {
    expect(contieneTerminoProhibidoVeredicto('La probabilidad de lluvia es alta.', [])).toBe(true)
  })

  it('bloquea "%" sin ref de lluvia.ens.', () => {
    expect(contieneTerminoProhibidoVeredicto('Hay 80% de chance.', ['rio.parana.nivel'])).toBe(true)
  })

  it('permite probabilidad o % cuando una ref es lluvia.ens.', () => {
    expect(
      contieneTerminoProhibidoVeredicto('La probabilidad de lluvia es 80%.', ['lluvia.ens.p80']),
    ).toBe(false)
  })
})

describe('contieneTerminoProhibidoVeredicto: causalidad', () => {
  it.each([
    ['El río creció debido a la lluvia.', []],
    ['La crecida provocó anegamientos.', []],
    ['Hubo daños a causa de la creciente.', []],
  ])('bloquea causalidad sin ref en la frase: %s', (texto, refs) => {
    expect(contieneTerminoProhibidoVeredicto(texto, refs)).toBe(true)
  })

  it('permite causalidad cuando la frase tiene al menos una ref', () => {
    expect(
      contieneTerminoProhibidoVeredicto('La crecida provocó anegamientos.', ['rio.parana.nivel']),
    ).toBe(false)
  })
})

describe('contieneTerminoProhibidoVeredicto: permitidos sólo con ref de su fuente', () => {
  it('"alerta" sin ref de rio. queda prohibida', () => {
    expect(contieneTerminoProhibidoVeredicto('Nivel de alerta de Prefectura.', [])).toBe(true)
    expect(contieneTerminoProhibidoVeredicto('Nivel de alerta de Prefectura.', ['smn.aviso'])).toBe(
      true,
    )
  })

  it('"alerta" con ref rio. queda permitida', () => {
    expect(
      contieneTerminoProhibidoVeredicto('Nivel de alerta de Prefectura.', ['rio.parana.nivel']),
    ).toBe(false)
  })

  it('"evacuación" sin ref rio. queda prohibida y con ref rio. permitida', () => {
    expect(contieneTerminoProhibidoVeredicto('Evacuación previa en el río.', [])).toBe(true)
    expect(
      contieneTerminoProhibidoVeredicto('Evacuación previa en el río.', ['rio.parana.nivel']),
    ).toBe(false)
  })

  it('"SMN" y "aviso" sin ref smn. quedan prohibidos', () => {
    expect(contieneTerminoProhibidoVeredicto('El SMN emitió un aviso.', [])).toBe(true)
    expect(contieneTerminoProhibidoVeredicto('El SMN emitió un aviso.', ['rio.parana.nivel'])).toBe(
      true,
    )
  })

  it('"SMN" y "aviso" con ref smn. quedan permitidos', () => {
    expect(contieneTerminoProhibidoVeredicto('El SMN emitió un aviso.', ['smn.aviso'])).toBe(false)
  })
})

describe('contieneTerminoProhibidoVeredicto: textos normales', () => {
  it('no bloquea una frase trazable y sin términos prohibidos', () => {
    expect(
      contieneTerminoProhibidoVeredicto('El río Paraná está en 4,25 m.', ['rio.parana.nivel']),
    ).toBe(false)
  })
})

describe('validarVeredictoAmbito', () => {
  it('acepta un ámbito válido de dos frases con cifras trazables', () => {
    const resultado = validarVeredictoAmbito(
      [
        { texto: 'El río Paraná está en 4,25 m.', refs: ['rio.parana.nivel'] },
        { texto: 'Se acumularon 12 mm de lluvia.', refs: ['lluvia.observada.total'] },
      ],
      METRICAS,
    )

    expect(resultado.valida).toBe(true)
    expect(resultado.motivo).toBeNull()
    expect(resultado.frasesValidas).toHaveLength(2)
  })

  it('rechaza el ámbito con termino_prohibido si una frase lo contiene', () => {
    const resultado = validarVeredictoAmbito(
      [
        { texto: 'El río Paraná está en 4,25 m.', refs: ['rio.parana.nivel'] },
        { texto: 'Se suspenden las clases.', refs: [] },
      ],
      METRICAS,
    )

    expect(resultado.valida).toBe(false)
    expect(resultado.motivo).toBe('termino_prohibido')
  })

  it('mantiene la validación de cifras trazables delegada en validarTrazabilidadBriefing', () => {
    const resultado = validarVeredictoAmbito(
      [
        { texto: 'El río Paraná está en 9,99 m.', refs: ['rio.parana.nivel'] },
        { texto: 'Se acumularon 12 mm de lluvia.', refs: ['lluvia.observada.total'] },
      ],
      METRICAS,
    )

    expect(resultado.valida).toBe(false)
    expect(resultado.motivo).toBe('cifra_no_trazable')
  })
})

describe('validarVeredictoAmbito: time windows', () => {
  it('does not treat "24 h" or "72 horas" as figures to trace', () => {
    const r = validarVeredictoAmbito(
      [{ texto: 'El río subió 4,25 m en 24 h y se espera lo mismo en 72 horas.', refs: ['rio.parana.nivel'] }],
      METRICAS,
    )
    expect(r.valida).toBe(true)
  })

  it('still rejects an untraced figure next to a time window', () => {
    const r = validarVeredictoAmbito([{ texto: 'Cayeron 99 mm en 24 h.', refs: ['lluvia.observada.total'] }], METRICAS)
    expect(r.valida).toBe(false)
  })

  it('does not read the 3 of "m3/s" as a figure', () => {
    const metricas = [{ id: 'caudal.x.pico_m3s', valor: 15666.5, etiqueta: 'Caudal pico' }]
    const r = validarVeredictoAmbito([{ texto: 'Caudal pico de 15666.5 m3/s.', refs: ['caudal.x.pico_m3s'] }], metricas)
    expect(r.valida).toBe(true)
  })
})
