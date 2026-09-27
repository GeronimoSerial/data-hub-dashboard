// Suite de CONTRATO de los puertos de INGESTA del módulo ENOS.
//
// CUALQUIER ADAPTADOR NUEVO DEBE CORRER ESTA SUITE (o la parte de su puerto)
// antes de darse por terminado: verifica la FORMA normalizada, que la ausencia
// de datos se exprese como `sinDato`/`celdasSinDato` (nunca como `0` imputado)
// y que un error del proveedor no devuelva una forma inválida.
//
// Sin red real: el proveedor se inyecta por las dependencias de cada adaptador
// (`obtenerProbabilidades`, `obtenerTendencia`, `fetchImpl`); los datos de
// ejemplo y el verificador reutilizable viven en `./__fixtures__/contrato`.
//
// Sobre errores: NINGUNO de los tres adaptadores captura el throw del
// proveedor — lo deja propagar. Eso es el comportamiento REAL y es lo que
// afirma este contrato (rechazo limpio), no una forma inventada.
import { describe, expect, it } from 'vitest'
import { crearAdaptadorEnsemble } from './ensemble'
import { crearAdaptadorImerg } from './imerg'
import { crearAdaptadorSeasonal } from './seasonal'
import {
  CORRIDA_EN_ENSEMBLE,
  DEPARTAMENTOS_SEASONAL,
  EMISION_EN_SEASONAL,
  GRANULO_FIN,
  GRANULO_INICIO,
  GRANULO_TITULO,
  MOTIVO_ERROR_FAKE,
  REFS_ENSEMBLE,
  VALIDO_EN_ENSEMBLE,
  esInstanteIsoParseable,
  fetchImergFake,
  granuloSatelitalFake,
  proveedorEnsembleFake,
  proveedorSeasonalFake,
  verificarFormaPuntoNormalizado,
} from './__fixtures__/contrato'

const FORMA_ENSEMBLE = {
  variable: 'precipitacion_acumulada',
  instantesIso: ['corridaEn', 'validoDesde', 'validoHasta'],
  cadenasRequeridas: ['geometryRef'],
  numerosFinitos: ['horizonteHoras', 'acumuladoHoras', 'miembrosTotal', 'miembrosValidos'],
  numerosFinitosONull: ['probabilidadSuperaP95', 'probabilidadSuperaP99', 'dispersionMm'],
} as const

const FORMA_SEASONAL = {
  variable: 'precipitacion_acumulada',
  instantesIso: ['emisionEn', 'validoDesde', 'validoHasta'],
  cadenasRequeridas: ['departamento'],
  numerosFinitos: ['horizonteDesdeDias', 'horizonteHastaDias', 'miembrosTotal', 'miembrosValidos'],
  numerosFinitosONull: ['mediaMm', 'medianaMm', 'dispersionMm', 'probabilidadSobreNormal'],
} as const

const MS_POR_HORA = 3_600_000

function umbralesEnsemble(valor: number) {
  return new Map(REFS_ENSEMBLE.map((ref) => [ref, valor]))
}

function parametrosEnsemble() {
  return {
    geometryRefs: REFS_ENSEMBLE,
    asOf: CORRIDA_EN_ENSEMBLE,
    umbralesP95Mm: umbralesEnsemble(10),
    umbralesP99Mm: umbralesEnsemble(20),
  }
}

function parametrosSeasonal() {
  return {
    centroides: DEPARTAMENTOS_SEASONAL.map((departamento, indice) => ({
      departamento,
      lat: -27,
      lon: -58 + indice,
    })),
    emisionEn: EMISION_EN_SEASONAL,
    horizonteDesdeDias: 30,
    horizonteHastaDias: 90,
  }
}

describe('contrato PuertoPronosticoEnsemble (crearAdaptadorEnsemble)', () => {
  it('normal: cada punto cumple la forma y preserva los valores del provider', async () => {
    const adaptador = crearAdaptadorEnsemble({
      obtenerProbabilidades: proveedorEnsembleFake('normal'),
    })

    const { puntos, sinDato } = await adaptador.obtenerProbabilidades(parametrosEnsemble())

    expect(puntos).toHaveLength(REFS_ENSEMBLE.length)
    expect(sinDato).toEqual({})

    for (const punto of puntos) {
      verificarFormaPuntoNormalizado(punto, {
        ...FORMA_ENSEMBLE,
        numerosFinitos: [...FORMA_ENSEMBLE.numerosFinitos],
        numerosFinitosONull: [...FORMA_ENSEMBLE.numerosFinitosONull],
        instantesIso: [...FORMA_ENSEMBLE.instantesIso],
        cadenasRequeridas: [...FORMA_ENSEMBLE.cadenasRequeridas],
        valoresExactos: { acumuladoHoras: 24 },
      })
    }

    const [primero] = puntos
    expect(primero.validoHasta).toBe(VALIDO_EN_ENSEMBLE)
    expect(primero.validoDesde).toBe(
      new Date(Date.parse(VALIDO_EN_ENSEMBLE) - 23 * MS_POR_HORA).toISOString(),
    )
    expect(primero.probabilidadSuperaP95).toBe(0.25)
    expect(primero.probabilidadSuperaP99).toBe(0.1)
    expect(primero.dispersionMm).toBe(3.2)
  })

  it('sin datos: no lanza y reporta el motivo en sinDato', async () => {
    const adaptador = crearAdaptadorEnsemble({
      obtenerProbabilidades: proveedorEnsembleFake('vacio'),
    })

    const { puntos, sinDato } = await adaptador.obtenerProbabilidades(parametrosEnsemble())

    expect(puntos).toEqual([])
    expect(Object.keys(sinDato).sort()).toEqual([...REFS_ENSEMBLE].sort())
    expect(Object.values(sinDato).every((motivo) => typeof motivo === 'string')).toBe(true)
  })

  it('degradación parcial: una celda con dato y otra en sinDato con motivo', async () => {
    const adaptador = crearAdaptadorEnsemble({
      obtenerProbabilidades: proveedorEnsembleFake('parcial'),
    })

    const { puntos, sinDato } = await adaptador.obtenerProbabilidades(parametrosEnsemble())

    expect(puntos).toHaveLength(1)
    expect(sinDato).toEqual({ [REFS_ENSEMBLE[1]]: 'sin_climatologia' })
    verificarFormaPuntoNormalizado(puntos[0], {
      ...FORMA_ENSEMBLE,
      numerosFinitos: [...FORMA_ENSEMBLE.numerosFinitos],
      numerosFinitosONull: [...FORMA_ENSEMBLE.numerosFinitosONull],
      instantesIso: [...FORMA_ENSEMBLE.instantesIso],
      cadenasRequeridas: [...FORMA_ENSEMBLE.cadenasRequeridas],
    })
  })

  it('error del provider: rechaza (el adaptador no captura el throw)', async () => {
    const adaptador = crearAdaptadorEnsemble({
      obtenerProbabilidades: proveedorEnsembleFake('error'),
    })

    await expect(adaptador.obtenerProbabilidades(parametrosEnsemble())).rejects.toThrow(
      MOTIVO_ERROR_FAKE,
    )
  })
})

describe('contrato PuertoTendenciaEstacional (crearAdaptadorSeasonal)', () => {
  it('normal: cada estadística cumple la forma y se pasa sin alterar', async () => {
    const adaptador = crearAdaptadorSeasonal({
      obtenerTendencia: proveedorSeasonalFake('normal'),
    })

    const { estadisticas, sinDato } = await adaptador.obtenerTendencia(parametrosSeasonal())

    expect(estadisticas).toHaveLength(DEPARTAMENTOS_SEASONAL.length)
    expect(sinDato).toEqual({})

    for (const estadistica of estadisticas) {
      verificarFormaPuntoNormalizado(estadistica, {
        ...FORMA_SEASONAL,
        numerosFinitos: [...FORMA_SEASONAL.numerosFinitos],
        numerosFinitosONull: [...FORMA_SEASONAL.numerosFinitosONull],
        instantesIso: [...FORMA_SEASONAL.instantesIso],
        cadenasRequeridas: [...FORMA_SEASONAL.cadenasRequeridas],
        valoresExactos: { horizonteDesdeDias: 30, horizonteHastaDias: 90 },
      })
    }

    const capital = estadisticas.find((e) => e.departamento === DEPARTAMENTOS_SEASONAL[0])
    expect(capital?.mediaMm).toBe(120.5)
    expect(capital?.probabilidadSobreNormal).toBe(0.46)
  })

  it('sin datos: no lanza y reporta el motivo en sinDato', async () => {
    const adaptador = crearAdaptadorSeasonal({
      obtenerTendencia: proveedorSeasonalFake('vacio'),
    })

    const { estadisticas, sinDato } = await adaptador.obtenerTendencia(parametrosSeasonal())

    expect(estadisticas).toEqual([])
    expect(Object.keys(sinDato).sort()).toEqual([...DEPARTAMENTOS_SEASONAL].sort())
  })

  it('degradación parcial: un departamento con dato y otro en sinDato', async () => {
    const adaptador = crearAdaptadorSeasonal({
      obtenerTendencia: proveedorSeasonalFake('parcial'),
    })

    const { estadisticas, sinDato } = await adaptador.obtenerTendencia(parametrosSeasonal())

    expect(estadisticas).toHaveLength(1)
    expect(estadisticas[0].departamento).toBe(DEPARTAMENTOS_SEASONAL[0])
    expect(sinDato).toEqual({ [DEPARTAMENTOS_SEASONAL[1]]: 'sin_miembros' })
  })

  it('error del provider: rechaza (el adaptador no captura el throw)', async () => {
    const adaptador = crearAdaptadorSeasonal({
      obtenerTendencia: proveedorSeasonalFake('error'),
    })

    await expect(adaptador.obtenerTendencia(parametrosSeasonal())).rejects.toThrow(
      MOTIVO_ERROR_FAKE,
    )
  })
})

describe('contrato PuertoObservacionSatelital (crearAdaptadorImerg)', () => {
  function adaptador(escenario: Parameters<typeof fetchImergFake>[0]) {
    return crearAdaptadorImerg({ fetchImpl: fetchImergFake(escenario), token: 'token-de-test' })
  }

  it('normal: lista gránulos normalizados y devuelve observaciones con calidad', async () => {
    const imerg = adaptador('normal')

    const granulos = await imerg.listarGranulos({
      desde: '2026-09-26T18:00:00.000Z',
      hasta: '2026-09-26T20:00:00.000Z',
    })
    expect(granulos).toHaveLength(2)
    expect(granulos[0]).toEqual({
      id: GRANULO_TITULO,
      inicioEn: GRANULO_INICIO,
      finEn: GRANULO_FIN,
      urlDatos: expect.stringContaining('.HDF5'),
    })

    const { observaciones, celdasSinDato } = await imerg.obtenerObservacion({
      granulo: granuloSatelitalFake(),
    })
    expect(celdasSinDato).toEqual([])
    expect(observaciones.length).toBeGreaterThan(0)

    for (const observacion of observaciones) {
      verificarFormaPuntoNormalizado(observacion, {
        variable: 'precipitacion_observada_satelital',
        instantesIso: ['observadoEn', 'ventanaDesde', 'ventanaHasta'],
        cadenasRequeridas: ['geometryRef'],
        numerosFinitos: ['valorMm'],
        numerosFinitosONull: ['calidad'],
      })
      expect(esInstanteIsoParseable(observacion.ventanaHasta)).toBe(true)
    }
    expect(observaciones.some((o) => o.calidad !== null)).toBe(true)
  })

  it('fuente vacía: CMR vacío lista [] sin lanzar', async () => {
    const granulos = await adaptador('vacio').listarGranulos({
      desde: '2026-09-26T18:00:00.000Z',
      hasta: '2026-09-26T20:00:00.000Z',
    })

    expect(granulos).toEqual([])
  })

  it('fuente vacía: un subset sin filas de precipitación rechaza (parser puro)', async () => {
    await expect(
      adaptador('vacio').obtenerObservacion({ granulo: granuloSatelitalFake() }),
    ).rejects.toThrow(/no se encontró ninguna fila precipitation/)
  })

  it('error 500: rechaza en listado y en observación', async () => {
    const imerg = adaptador('error')

    await expect(
      imerg.listarGranulos({ desde: '2026-09-26T18:00:00.000Z', hasta: '2026-09-26T20:00:00.000Z' }),
    ).rejects.toThrow('CMR HTTP 500')

    await expect(
      imerg.obtenerObservacion({ granulo: granuloSatelitalFake() }),
    ).rejects.toThrow('subset HTTP 500')
  })

  it('degradación parcial: descarta gránulos sin link de datos y no imputa calidad', async () => {
    const imerg = adaptador('parcial')

    const granulos = await imerg.listarGranulos({
      desde: '2026-09-26T18:00:00.000Z',
      hasta: '2026-09-26T20:00:00.000Z',
    })
    expect(granulos).toHaveLength(1)

    const { observaciones } = await imerg.obtenerObservacion({
      granulo: granuloSatelitalFake(),
    })
    expect(observaciones.length).toBeGreaterThan(0)
    expect(observaciones.every((o) => o.calidad === null)).toBe(true)
  })
})
