import { describe, expect, it } from 'vitest'
import {
  calcularEpisodiosDerivados,
  type AfectacionConfirmada,
} from './regla'

const D1 = 'Departamento Uno'
const D2 = 'Departamento Dos'

// Fechas ISO fijas y legibles (UTC). Nunca red, nunca reloj real.
const DIA_0 = '2026-01-01T00:00:00.000Z'
const DIA_1 = '2026-01-02T00:00:00.000Z'
const DIA_2 = '2026-01-03T00:00:00.000Z'
const DIA_3 = '2026-01-04T00:00:00.000Z'
const DIA_4 = '2026-01-05T00:00:00.000Z'
const DIA_5 = '2026-01-06T00:00:00.000Z'
const DIA_6 = '2026-01-07T00:00:00.000Z'
const DIA_7 = '2026-01-08T00:00:00.000Z'
const DIA_10 = '2026-01-11T00:00:00.000Z'
const DIA_20 = '2026-01-21T00:00:00.000Z'
const DIA_30 = '2026-01-31T00:00:00.000Z'

function af(
  cueAnexo: string,
  rigeDesde: string,
  extra: Partial<AfectacionConfirmada> = {},
): AfectacionConfirmada {
  return {
    cueAnexo,
    departamento: D1,
    movimientoId: null,
    rigeDesde,
    retiradaEn: null,
    ...extra,
  }
}

describe('calcularEpisodiosDerivados', () => {
  it('1. apertura: crea un episodio abierto con la escuela como único miembro', () => {
    const resultado = calcularEpisodiosDerivados({
      afectaciones: [af('A', DIA_0)],
      asOf: DIA_1,
    })

    expect(resultado).toHaveLength(1)
    expect(resultado[0]).toEqual({
      unidadTipo: 'departamento',
      unidadId: D1,
      inicioEn: DIA_0,
      finEn: null,
      estado: 'abierto',
      escuelasAfectadas: 1,
      miembros: [
        {
          cueAnexo: 'A',
          movimientoId: null,
          primeraAfectacionEn: DIA_0,
          recuperadoEn: null,
        },
      ],
    })
  })

  it('2. extensión: dos afectaciones dentro de la ventana de N días son un solo episodio con 2 miembros', () => {
    const resultado = calcularEpisodiosDerivados({
      afectaciones: [af('A', DIA_0), af('B', DIA_3)],
      asOf: DIA_4,
    })

    expect(resultado).toHaveLength(1)
    expect(resultado[0].estado).toBe('abierto')
    expect(resultado[0].inicioEn).toBe(DIA_0)
    expect(resultado[0].escuelasAfectadas).toBe(2)
    expect(resultado[0].miembros.map((m) => m.cueAnexo)).toEqual(['A', 'B'])
  })

  it('3. cierre por N días: finEn = última apertura + 7 días exactos', () => {
    const resultado = calcularEpisodiosDerivados({
      afectaciones: [af('A', DIA_0)],
      asOf: DIA_10,
    })

    expect(resultado).toHaveLength(1)
    expect(resultado[0].estado).toBe('cerrado')
    expect(resultado[0].finEn).toBe(DIA_7)
    expect(resultado[0].miembros[0].recuperadoEn).toBeNull()
  })

  it('4. cierre por recuperación: cierra en la última recuperación, no en los 7 días', () => {
    const resultado = calcularEpisodiosDerivados({
      afectaciones: [
        af('A', DIA_0, { retiradaEn: DIA_2 }),
        af('B', DIA_0, { retiradaEn: DIA_3 }),
      ],
      asOf: DIA_4,
    })

    expect(resultado).toHaveLength(1)
    expect(resultado[0].estado).toBe('cerrado')
    expect(resultado[0].finEn).toBe(DIA_3)
    expect(resultado[0].escuelasAfectadas).toBe(2)
    expect(resultado[0].miembros.map((m) => m.recuperadoEn)).toEqual([
      DIA_2,
      DIA_3,
    ])
  })

  it('5. reapertura tras cierre: crea un segundo episodio y deja intacto el primero', () => {
    const resultado = calcularEpisodiosDerivados({
      afectaciones: [
        af('A', DIA_0, { retiradaEn: DIA_2 }),
        af('B', DIA_5),
      ],
      asOf: DIA_6,
    })

    expect(resultado).toHaveLength(2)
    expect(resultado[0].estado).toBe('cerrado')
    expect(resultado[0].finEn).toBe(DIA_2)
    expect(resultado[0].miembros.map((m) => m.cueAnexo)).toEqual(['A'])
    expect(resultado[1].estado).toBe('abierto')
    expect(resultado[1].inicioEn).toBe(DIA_5)
    expect(resultado[1].finEn).toBeNull()
    expect(resultado[1].miembros.map((m) => m.cueAnexo)).toEqual(['B'])
  })

  it('6. dos departamentos intercalados: cada uno con sus escuelas y su propio cierre', () => {
    const resultado = calcularEpisodiosDerivados({
      afectaciones: [
        af('Y', DIA_2, { departamento: D2, retiradaEn: DIA_3 }),
        af('X', DIA_0),
      ],
      asOf: DIA_5,
    })

    expect(resultado).toHaveLength(2)

    const depto1 = resultado.find((e) => e.unidadId === D1)!
    const depto2 = resultado.find((e) => e.unidadId === D2)!

    expect(depto1.estado).toBe('abierto')
    expect(depto1.miembros.map((m) => m.cueAnexo)).toEqual(['X'])

    expect(depto2.estado).toBe('cerrado')
    expect(depto2.finEn).toBe(DIA_3)
    expect(depto2.miembros.map((m) => m.cueAnexo)).toEqual(['Y'])
  })

  it('7. datos fuera de orden: el resultado es idéntico al de un input ordenado', () => {
    const ordenadas: AfectacionConfirmada[] = [
      af('A', DIA_0),
      af('C', DIA_1, { departamento: D2 }),
      af('B', DIA_2, { retiradaEn: DIA_3 }),
      af('D', DIA_4, { departamento: D2, retiradaEn: DIA_5 }),
    ]
    const desordenadas = [ordenadas[3], ordenadas[1], ordenadas[0], ordenadas[2]]

    const a = calcularEpisodiosDerivados({ afectaciones: ordenadas, asOf: DIA_10 })
    const b = calcularEpisodiosDerivados({
      afectaciones: desordenadas,
      asOf: DIA_10,
    })

    expect(b).toEqual(a)
  })

  it('8. as-of sin fuga: descarta rigeDesde futuro y no recupera con retiradaEn futuro', () => {
    const resultado = calcularEpisodiosDerivados({
      afectaciones: [
        af('A', DIA_0, { retiradaEn: DIA_20 }),
        af('C', DIA_30),
      ],
      asOf: DIA_5,
    })

    expect(resultado).toHaveLength(1)
    expect(resultado[0].escuelasAfectadas).toBe(1)
    expect(resultado[0].miembros).toHaveLength(1)
    expect(resultado[0].miembros[0].cueAnexo).toBe('A')
    expect(resultado[0].miembros[0].recuperadoEn).toBeNull()
  })

  it('9. reingreso: una sola fila, recuperadoEn vuelto a null y primeraAfectacionEn intacta', () => {
    const resultado = calcularEpisodiosDerivados({
      afectaciones: [
        af('A', DIA_0, { movimientoId: 'm1', retiradaEn: DIA_1 }),
        af('B', DIA_0),
        af('A', DIA_3, { movimientoId: 'm2' }),
      ],
      asOf: DIA_4,
    })

    expect(resultado).toHaveLength(1)
    expect(resultado[0].estado).toBe('abierto')
    expect(resultado[0].miembros).toHaveLength(2)

    const miembroA = resultado[0].miembros.find((m) => m.cueAnexo === 'A')!
    expect(miembroA.primeraAfectacionEn).toBe(DIA_0)
    expect(miembroA.recuperadoEn).toBeNull()
    expect(miembroA.movimientoId).toBe('m2')
    expect(resultado[0].miembros.filter((m) => m.cueAnexo === 'A')).toHaveLength(1)
  })

  it('10. idempotencia estructural: mismo input y asOf producen un resultado deep-equal', () => {
    const afectaciones: AfectacionConfirmada[] = [
      af('A', DIA_0, { retiradaEn: DIA_2 }),
      af('C', DIA_1, { departamento: D2 }),
      af('B', DIA_5),
      af('D', DIA_6, { departamento: D2, retiradaEn: DIA_7 }),
    ]

    const primera = calcularEpisodiosDerivados({ afectaciones, asOf: DIA_10 })
    const segunda = calcularEpisodiosDerivados({ afectaciones, asOf: DIA_10 })

    expect(segunda).toEqual(primera)
  })

  it('11. timeout gana a la recuperación total cuando vence antes: cierra en D0+7, no en la retirada', () => {
    const resultado = calcularEpisodiosDerivados({
      afectaciones: [af('A', DIA_0, { retiradaEn: DIA_10 })],
      asOf: DIA_30,
      parametros: {
        unidadTipo: 'departamento',
        diasSinAfectacionParaCierre: 7,
      },
    })

    expect(resultado).toHaveLength(1)
    expect(resultado[0].estado).toBe('cerrado')
    expect(resultado[0].finEn).toBe(DIA_7)
    expect(resultado[0].escuelasAfectadas).toBe(1)
    expect(resultado[0].miembros[0].recuperadoEn).toBeNull()
  })
})
