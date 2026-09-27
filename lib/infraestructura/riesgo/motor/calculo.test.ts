import { describe, expect, it } from 'vitest'
import { crearPuertosFake, type EscenarioFake } from './__fixtures__/puertos-fake'
import { LLUVIA_72H_SATURACION_MM, MOTOR_VERSION } from './config'
import type {
  AntecedenteHistorial,
  IndicadoresSusceptibilidad,
  NivelCaudalPunto,
  NivelPeligro,
  NivelPeligroCelda,
  PerfilTerritorio,
  PuertosMotor,
} from './puertos'
import { calcularRiesgoEscuela } from './calculo'

const CUE = 'CUE-1'
const GEOM = 'geom-1'
const RIO = 'rio-1'
const AS_OF = '2026-09-26T12:00:00.000Z'

function perfilValido(over: Partial<PerfilTerritorio> = {}): PerfilTerritorio {
  return {
    cueAnexo: CUE,
    geometryRef: GEOM,
    departamento: 'Corrientes',
    puntoRioId: RIO,
    motivoExclusion: null,
    ...over,
  }
}

function celda(nivel: NivelPeligro, over: Partial<NivelPeligroCelda> = {}): NivelPeligroCelda {
  return {
    geometryRef: GEOM,
    horizonteHoras: 24,
    nivel,
    base: 'ensemble',
    probabilidadP95: null,
    probabilidadP99: null,
    precipitacionMm: null,
    percentilReferencia: null,
    emitidoEn: '2026-09-20T06:00:00.000Z',
    validoHasta: '2026-09-27T00:00:00.000Z',
    versionRegla: 'regla-v1',
    ...over,
  }
}

function caudal(nivel: NivelPeligro, over: Partial<NivelCaudalPunto> = {}): NivelCaudalPunto {
  return {
    puntoId: RIO,
    percentilActual: null,
    nivel,
    emitidoEn: '2026-09-20T06:00:00.000Z',
    validoHasta: '2026-09-27T00:00:00.000Z',
    ...over,
  }
}

function susceptibilidadDe(valores: number[], version = 'v1'): IndicadoresSusceptibilidad {
  const indicadores: Record<string, number> = {}
  valores.forEach((valor, indice) => {
    indicadores[`ind-${indice}`] = valor
  })
  return { cueAnexo: CUE, indicadores, version }
}

function antecedente(
  rigeDesde: string,
  over: Partial<AntecedenteHistorial> = {},
): AntecedenteHistorial {
  return {
    motivo: 'inundacion',
    categoria: 'hidrometeorologico',
    rigeDesde,
    retiradaEn: '2026-09-25T00:00:00.000Z',
    accesoInterrumpido: false,
    ...over,
  }
}

// Escenario con los 6 sub-componentes presentes y valores moderados.
function escenarioBase(): EscenarioFake {
  return {
    territorio: { [CUE]: perfilValido() },
    peligro: {
      [GEOM]: [celda('naranja'), celda('amarillo', { horizonteHoras: 72 })],
    },
    caudal: { [RIO]: caudal('amarillo') },
    lluvia24h: { [GEOM]: 30 },
    lluvia72h: { [GEOM]: 80 },
    aislamiento: { [CUE]: 2 },
    susceptibilidad: { [CUE]: susceptibilidadDe([0.4, 0.6]) },
    historial: {
      [CUE]: {
        cueAnexo: CUE,
        cantidadConfirmadas: 2,
        duracionTotalHoras: 48,
        accesoInterrumpidoCantidad: 1,
        antecedentes: [
          antecedente('2026-01-01T00:00:00.000Z', { accesoInterrumpido: true }),
          antecedente('2026-02-01T00:00:00.000Z'),
        ],
      },
    },
    exposicion: { [CUE]: { cueAnexo: CUE, matricula: 420, secciones: 12, corteId: 7 } },
  }
}

describe('calcularRiesgoEscuela', () => {
  it('T1: escenario completo es determinista', async () => {
    const escenario = escenarioBase()

    const primera = await calcularRiesgoEscuela({
      cueAnexo: CUE,
      horizonte: 24,
      asOf: AS_OF,
      puertos: crearPuertosFake(escenario),
    })
    const segunda = await calcularRiesgoEscuela({
      cueAnexo: CUE,
      horizonte: 24,
      asOf: AS_OF,
      puertos: crearPuertosFake(escenario),
    })

    expect(segunda).toEqual(primera)
    expect(primera.evidenciaValida).toBe(true)
    expect(primera.scoreAmenaza).not.toBeNull()
    expect(primera.scoreVulnerabilidad).not.toBeNull()
    expect(typeof primera.scoreRiesgo).toBe('number')
    expect(primera.confianza).toBe('alta')
    expect(primera.exposicion).toEqual({ matricula: 420, secciones: 12 })
    expect(primera.modeloVersion).toBe(MOTOR_VERSION)
    expect(primera.calculadoEn).toBe(AS_OF)
  })

  it('T2: los factores reconstruyen scoreAmenaza y scoreVulnerabilidad', async () => {
    const resultado = await calcularRiesgoEscuela({
      cueAnexo: CUE,
      horizonte: 24,
      asOf: AS_OF,
      puertos: crearPuertosFake(escenarioBase()),
    })

    const sumaAmenaza = resultado.factores
      .filter((factor) => factor.tipo === 'amenaza')
      .reduce((acc, factor) => acc + factor.contribucion, 0)
    const sumaVulnerabilidad = resultado.factores
      .filter((factor) => factor.tipo === 'vulnerabilidad')
      .reduce((acc, factor) => acc + factor.contribucion, 0)

    expect(Math.abs(sumaAmenaza - (resultado.scoreAmenaza ?? 0))).toBeLessThanOrEqual(0.01)
    expect(
      Math.abs(sumaVulnerabilidad - (resultado.scoreVulnerabilidad ?? 0)),
    ).toBeLessThanOrEqual(0.01)
  })

  it('T3: todos los componentes al máximo => scoreRiesgo 100 y muy_alto', async () => {
    const escenario: EscenarioFake = {
      ...escenarioBase(),
      peligro: { [GEOM]: [celda('rojo')] },
      caudal: { [RIO]: caudal('rojo') },
      lluvia24h: { [GEOM]: LLUVIA_72H_SATURACION_MM },
      aislamiento: { [CUE]: 3 },
      susceptibilidad: { [CUE]: susceptibilidadDe([1, 1, 1]) },
      historial: {
        [CUE]: {
          cueAnexo: CUE,
          cantidadConfirmadas: 5,
          duracionTotalHoras: 24 * 30,
          accesoInterrumpidoCantidad: 3,
          antecedentes: [
            antecedente('2026-01-01T00:00:00.000Z', { accesoInterrumpido: true }),
            antecedente('2026-01-02T00:00:00.000Z', { accesoInterrumpido: true }),
            antecedente('2026-01-03T00:00:00.000Z', { accesoInterrumpido: true }),
            antecedente('2026-01-04T00:00:00.000Z'),
            antecedente('2026-01-05T00:00:00.000Z'),
          ],
        },
      },
    }

    const resultado = await calcularRiesgoEscuela({
      cueAnexo: CUE,
      horizonte: 24,
      asOf: AS_OF,
      puertos: crearPuertosFake(escenario),
    })

    expect(resultado.scoreAmenaza).toBe(100)
    expect(resultado.scoreVulnerabilidad).toBe(100)
    expect(resultado.scoreRiesgo).toBe(100)
    expect(resultado.nivelRiesgo).toBe('muy_alto')
  })

  it('T4: todos los componentes al mínimo => scoreRiesgo 0 y bajo, con evidencia válida', async () => {
    const escenario: EscenarioFake = {
      ...escenarioBase(),
      peligro: { [GEOM]: [celda('verde')] },
      caudal: { [RIO]: caudal('verde') },
      lluvia24h: { [GEOM]: 0 },
      aislamiento: { [CUE]: 0 },
      susceptibilidad: { [CUE]: susceptibilidadDe([0, 0]) },
      historial: {
        [CUE]: {
          cueAnexo: CUE,
          cantidadConfirmadas: 0,
          duracionTotalHoras: 0,
          accesoInterrumpidoCantidad: 0,
          antecedentes: [],
        },
      },
    }

    const resultado = await calcularRiesgoEscuela({
      cueAnexo: CUE,
      horizonte: 24,
      asOf: AS_OF,
      puertos: crearPuertosFake(escenario),
    })

    expect(resultado.evidenciaValida).toBe(true)
    expect(resultado.scoreAmenaza).toBe(0)
    expect(resultado.scoreVulnerabilidad).toBe(0)
    expect(resultado.scoreRiesgo).toBe(0)
    expect(resultado.nivelRiesgo).toBe('bajo')
    expect(resultado.confianza).toBe('alta')
  })

  it('T5: amenaza totalmente ausente => evidenciaValida false y nunca nivel "bajo"', async () => {
    const escenario: EscenarioFake = {
      ...escenarioBase(),
      territorio: { [CUE]: perfilValido({ puntoRioId: null }) },
      peligro: { [GEOM]: [celda('sin_dato')] },
      lluvia24h: { [GEOM]: null },
    }

    const resultado = await calcularRiesgoEscuela({
      cueAnexo: CUE,
      horizonte: 24,
      asOf: AS_OF,
      puertos: crearPuertosFake(escenario),
    })

    expect(resultado.evidenciaValida).toBe(false)
    expect(resultado.scoreAmenaza).toBeNull()
    expect(resultado.scoreRiesgo).toBeNull()
    expect(resultado.nivelRiesgo).toBeNull()
    expect(resultado.nivelRiesgo).not.toBe('bajo')
    expect(resultado.confianza).toBe('baja')
  })

  it('T6: territorio sin perfil válido => un solo factor de territorio', async () => {
    const escenario: EscenarioFake = {
      ...escenarioBase(),
      territorio: { [CUE]: perfilValido({ motivoExclusion: 'sin_geometria' }) },
    }

    const resultado = await calcularRiesgoEscuela({
      cueAnexo: CUE,
      horizonte: 24,
      asOf: AS_OF,
      puertos: crearPuertosFake(escenario),
    })

    expect(resultado.evidenciaValida).toBe(false)
    expect(resultado.scoreRiesgo).toBeNull()
    expect(resultado.nivelRiesgo).not.toBe('bajo')
    expect(resultado.confianza).toBe('baja')
    expect(resultado.factores).toHaveLength(1)
    expect(resultado.factores[0].fuente).toBe('territorio')
    expect(resultado.exposicion).toEqual({ matricula: null, secciones: null })
    expect(resultado.calculadoEn).toBe(AS_OF)
    expect(resultado.validoHasta).toBe(AS_OF)
  })

  it('T7: un antecedente con rigeDesde posterior al asOf no se cuenta', async () => {
    const asOfViejo = '2026-03-01T00:00:00.000Z'
    const rigeFuturo = '2026-06-01T00:00:00.000Z'
    const escenario: EscenarioFake = {
      ...escenarioBase(),
      peligro: { [GEOM]: [celda('amarillo', { emitidoEn: '2026-01-01T00:00:00.000Z' })] },
      caudal: { [RIO]: caudal('amarillo', { emitidoEn: '2026-01-01T00:00:00.000Z' }) },
      historial: {
        [CUE]: {
          cueAnexo: CUE,
          cantidadConfirmadas: 1,
          duracionTotalHoras: 12,
          accesoInterrumpidoCantidad: 0,
          antecedentes: [antecedente(rigeFuturo, { retiradaEn: null })],
        },
      },
    }

    const viejo = await calcularRiesgoEscuela({
      cueAnexo: CUE,
      horizonte: 24,
      asOf: asOfViejo,
      puertos: crearPuertosFake(escenario),
    })
    const nuevo = await calcularRiesgoEscuela({
      cueAnexo: CUE,
      horizonte: 24,
      asOf: AS_OF,
      puertos: crearPuertosFake(escenario),
    })

    const factorViejo = viejo.factores.find((factor) => factor.fuente === 'historial')
    const factorNuevo = nuevo.factores.find((factor) => factor.fuente === 'historial')

    expect(factorViejo?.valor).toBe(0)
    expect(factorNuevo?.valor).toBe(1)
  })

  it('T8: faltan 2 de los 5 sub-componentes opcionales => confianza baja', async () => {
    const escenario: EscenarioFake = {
      ...escenarioBase(),
      territorio: { [CUE]: perfilValido({ puntoRioId: null }) },
      aislamiento: {},
    }

    const resultado = await calcularRiesgoEscuela({
      cueAnexo: CUE,
      horizonte: 24,
      asOf: AS_OF,
      puertos: crearPuertosFake(escenario),
    })

    expect(resultado.evidenciaValida).toBe(true)
    expect(resultado.scoreRiesgo).not.toBeNull()
    expect(resultado.confianza).toBe('baja')
  })

  it('T9: falta exactamente 1 de los 5 sub-componentes opcionales => confianza media', async () => {
    const escenario: EscenarioFake = {
      ...escenarioBase(),
      aislamiento: {},
    }

    const resultado = await calcularRiesgoEscuela({
      cueAnexo: CUE,
      horizonte: 24,
      asOf: AS_OF,
      puertos: crearPuertosFake(escenario),
    })

    expect(resultado.evidenciaValida).toBe(true)
    expect(resultado.scoreRiesgo).not.toBeNull()
    expect(resultado.confianza).toBe('media')
  })

  it('T-H1: un antecedente con rigeDesde posterior a asOf no aporta nada a duracionTotalHoras ni al score', async () => {
    const asOfViejo = '2026-03-01T00:00:00.000Z'
    const escenario: EscenarioFake = {
      ...escenarioBase(),
      peligro: { [GEOM]: [celda('amarillo', { emitidoEn: '2026-01-01T00:00:00.000Z' })] },
      caudal: { [RIO]: caudal('amarillo', { emitidoEn: '2026-01-01T00:00:00.000Z' }) },
      historial: {
        [CUE]: {
          cueAnexo: CUE,
          cantidadConfirmadas: 1,
          // Agregado obsoleto: incluye el antecedente futuro (24*30h). El
          // núcleo NO debe confiar en él y debe derivar la duración de la lista
          // vigente (que para asOfViejo queda vacía => 0h).
          duracionTotalHoras: 24 * 30,
          accesoInterrumpidoCantidad: 1,
          antecedentes: [
            antecedente('2026-06-01T00:00:00.000Z', {
              retiradaEn: null,
              accesoInterrumpido: true,
            }),
          ],
        },
      },
    }

    const resultado = await calcularRiesgoEscuela({
      cueAnexo: CUE,
      horizonte: 24,
      asOf: asOfViejo,
      puertos: crearPuertosFake(escenario),
    })

    const factorHistorial = resultado.factores.find((factor) => factor.fuente === 'historial')
    expect(factorHistorial?.valor).toBe(0)
    // cantidad/duración/acceso en 0 => scoreHistorialCrudo 0 => contribución 0.
    expect(factorHistorial?.contribucion).toBe(0)
  })

  it('T-H2: el filtro as-of compara timestamps numéricamente, no como string', async () => {
    // Mismo instante expresado de dos formas.
    const asOfZ = '2026-06-01T00:00:00.000Z'
    const asOfOffset = '2026-06-01T03:00:00.000+03:00' // == asOfZ

    const escenario: EscenarioFake = {
      ...escenarioBase(),
      peligro: { [GEOM]: [celda('amarillo', { emitidoEn: '2026-01-01T00:00:00.000Z' })] },
      caudal: { [RIO]: caudal('amarillo', { emitidoEn: '2026-01-01T00:00:00.000Z' }) },
      historial: {
        [CUE]: {
          cueAnexo: CUE,
          cantidadConfirmadas: 1,
          duracionTotalHoras: 0,
          accesoInterrumpidoCantidad: 0,
          // Instante 2026-05-31T23:00Z (ANTERIOR a asOf), pero escrito con
          // offset +03:00 queda como 02:00 y lexicográficamente DESPUÉS de
          // asOfZ. Una comparación de strings lo descartaría por error.
          antecedentes: [antecedente('2026-06-01T02:00:00.000+03:00', { retiradaEn: null })],
        },
      },
    }

    // Se saltea el filtro del propio fake (que también compara por string,
    // riesgo latente anotado al final del archivo) para probar directamente el
    // filtro numérico del núcleo.
    const base = crearPuertosFake(escenario)
    const puertosSinFiltroFake: PuertosMotor = {
      ...base,
      historial: {
        async obtenerResumen({ cueAnexo }) {
          return escenario.historial![cueAnexo]
        },
      },
    }

    const conZ = await calcularRiesgoEscuela({
      cueAnexo: CUE,
      horizonte: 24,
      asOf: asOfZ,
      puertos: puertosSinFiltroFake,
    })
    const conOffset = await calcularRiesgoEscuela({
      cueAnexo: CUE,
      horizonte: 24,
      asOf: asOfOffset,
      puertos: puertosSinFiltroFake,
    })

    expect(conZ.factores.find((factor) => factor.fuente === 'historial')?.valor).toBe(1)
    expect(conOffset.factores.find((factor) => factor.fuente === 'historial')?.valor).toBe(1)
    expect(conZ.scoreVulnerabilidad).toBe(conOffset.scoreVulnerabilidad)
  })

  it('T-H3: susceptibilidad con catálogo vacío cuenta como ausente (igual que null)', async () => {
    const conCatalogoVacio: EscenarioFake = {
      ...escenarioBase(),
      susceptibilidad: { [CUE]: { cueAnexo: CUE, indicadores: {}, version: 'v-vacio' } },
    }
    const sinSusceptibilidad: EscenarioFake = { ...escenarioBase(), susceptibilidad: {} }

    const vacio = await calcularRiesgoEscuela({
      cueAnexo: CUE,
      horizonte: 24,
      asOf: AS_OF,
      puertos: crearPuertosFake(conCatalogoVacio),
    })
    const nulo = await calcularRiesgoEscuela({
      cueAnexo: CUE,
      horizonte: 24,
      asOf: AS_OF,
      puertos: crearPuertosFake(sinSusceptibilidad),
    })

    expect(vacio.factores.some((factor) => factor.fuente === 'susceptibilidad-physrisk')).toBe(false)
    // 1 componente faltante (el catálogo vacío) => confianza media, no alta.
    expect(vacio.confianza).toBe('media')
    expect(vacio.confianza).toBe(nulo.confianza)
    expect(vacio.scoreVulnerabilidad).toBe(nulo.scoreVulnerabilidad)
  })
})

/*
 * PROBLEMA ENCONTRADO EN EL FIXTURE (no corregido a propósito, según consigna):
 *
 * lib/infraestructura/riesgo/motor/__fixtures__/puertos-fake.ts, puerto
 * `historial.obtenerResumen` filtra `antecedentes` por `rigeDesde <= asOf`
 * (as-of estricto) pero devuelve `{ ...resumen, antecedentes }` SIN recalcular
 * los agregados `cantidadConfirmadas` / `duracionTotalHoras` /
 * `accesoInterrumpidoCantidad`. Resultado: con un antecedente futuro respecto
 * de `asOf`, la lista queda vacía pero el agregado sigue contando ese
 * antecedente, contradiciendo el contrato del puerto ("`asOf` filtra
 * estrictamente por rigeDesde <= asOf").
 *
 * Impacto: un núcleo que confiara ciegamente en `resumen.cantidadConfirmadas`
 * (como sugería la letra del paso 3a) daría un conteo NO nulo para un `asOf`
 * anterior a la vigencia del antecedente y T7 fallaría. Para que el as-of sea
 * correcto pese al agregado obsoleto, `calculo.ts` deriva los conteos
 * (`cantidadConfirmadas`, `accesoInterrumpidoCantidad`) de la lista de
 * `antecedentes` vigentes y deja `duracionTotalHoras` en el agregado (no es
 * derivable del tipo `AntecedenteHistorial`). T7 ejercita exactamente ese
 * camino.
 *
 * Observaciones menores del mismo fixture, no bloqueantes para E3b:
 * - `lluviaObservada.obtenerAcumulado` ignora `asOf` salvo para setear
 *   `observadoEn`; no hay `emitidoEn` en el contrato de lluvia para filtrar.
 * - `exposicion.obtenerResumen` ignora `asOf` (el fake no modela cortes).
 */
