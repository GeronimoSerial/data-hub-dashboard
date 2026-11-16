import { describe, expect, it } from 'vitest'
import { crearPuertosFake, type EscenarioFake } from './__fixtures__/puertos-fake'
import { LLUVIA_72H_SATURACION_MM, MOTOR_VERSION_V03 } from './config'
import type {
  AntecedenteHistorial,
  IndicadoresSusceptibilidad,
  IndiceAislamiento,
  NivelAislamiento,
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

// Cambio de contrato de la tarea 1: el puerto de aislamiento pasó de devolver
// un `NivelAislamiento` plano a un `IndiceAislamiento` (nivel + conteos de
// cruces + alternativa). El núcleo sigue usando sólo `.nivel`, pero los tests
// ahora construyen el objeto completo.
function aislamientoDe(
  nivel: NivelAislamiento,
  over: Partial<IndiceAislamiento> = {},
): IndiceAislamiento {
  return {
    cueAnexo: CUE,
    nivel,
    crucesAguaCount: null,
    crucesAguaConPuenteCount: null,
    crucesAguaConVadoCount: null,
    tieneAlternativaSinCruce: null,
    versionJob: 'v1',
    fechaExtractoOsm: '2026-09-01',
    licencia: 'ODbL',
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

function calcular(
  over: Partial<Parameters<typeof calcularRiesgoEscuela>[0]> &
    Pick<Parameters<typeof calcularRiesgoEscuela>[0], 'puertos'>,
) {
  return calcularRiesgoEscuela({
    cueAnexo: CUE,
    horizonte: 24,
    asOf: AS_OF,
    ...over,
  })
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
    aislamiento: { [CUE]: aislamientoDe(2) },
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

describe('calcularRiesgoEscuela: lluvia satelital de baja confianza', () => {
  const sinPeligroCelda = (): EscenarioFake => ({ ...escenarioBase(), peligro: {}, caudal: {} })

  it('la lluvia IMERG de baja confianza no aporta amenaza (como si faltara) y no sube el puntaje', async () => {
    const alta = await calcular({ puertos: crearPuertosFake({ ...sinPeligroCelda(), lluvia24h: { [GEOM]: 120 } }) })
    const baja = await calcular({
      puertos: crearPuertosFake({ ...sinPeligroCelda(), lluvia24h: { [GEOM]: 120 }, lluviaConfianza: { [GEOM]: 'baja' } }),
    })

    expect(alta.factores.some((f) => f.fuente === 'lluvia-observada')).toBe(true)
    expect(baja.factores.some((f) => f.fuente === 'lluvia-observada')).toBe(false)
    expect(baja.scoreAmenaza ?? 0).toBeLessThan(alta.scoreAmenaza ?? 0)
  })

  it('con confianza alta el resultado es idéntico al de siempre', async () => {
    const sinCampo = await calcular({ puertos: crearPuertosFake(escenarioBase()) })
    const conAlta = await calcular({
      puertos: crearPuertosFake({ ...escenarioBase(), lluviaConfianza: { [GEOM]: 'alta' } }),
    })

    expect(conAlta).toEqual(sinCampo)
  })
})

describe('calcularRiesgoEscuela', () => {
  it('T1: escenario completo es determinista', async () => {
    const escenario = escenarioBase()

    const primera = await calcular({ puertos: crearPuertosFake(escenario) })
    const segunda = await calcular({ puertos: crearPuertosFake(escenario) })

    expect(segunda).toEqual(primera)
    expect(primera.evidenciaValida).toBe(true)
    expect(primera.scoreAmenaza).not.toBeNull()
    expect(primera.scoreVulnerabilidad).not.toBeNull()
    expect(typeof primera.scoreRiesgo).toBe('number')
    expect(primera.confianza).toBe('alta')
    expect(primera.exposicion).toEqual({ matricula: 420, secciones: 12 })
    expect(primera.modeloVersion).toBe(MOTOR_VERSION_V03)
    expect(primera.calculadoEn).toBe(AS_OF)
  })

  it('T2: los factores reconstruyen scoreAmenaza y scoreVulnerabilidad', async () => {
    const resultado = await calcular({ puertos: crearPuertosFake(escenarioBase()) })

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
      aislamiento: { [CUE]: aislamientoDe(3) },
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

    const resultado = await calcular({ puertos: crearPuertosFake(escenario) })

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
      aislamiento: { [CUE]: aislamientoDe(0) },
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

    const resultado = await calcular({ puertos: crearPuertosFake(escenario) })

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

    const resultado = await calcular({ puertos: crearPuertosFake(escenario) })

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

    const resultado = await calcular({ puertos: crearPuertosFake(escenario) })

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

    const viejo = await calcular({ asOf: asOfViejo, puertos: crearPuertosFake(escenario) })
    const nuevo = await calcular({ puertos: crearPuertosFake(escenario) })

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

    const resultado = await calcular({ puertos: crearPuertosFake(escenario) })

    expect(resultado.evidenciaValida).toBe(true)
    expect(resultado.scoreRiesgo).not.toBeNull()
    expect(resultado.confianza).toBe('baja')
  })

  it('T9: falta exactamente 1 de los 5 sub-componentes opcionales => confianza media', async () => {
    const escenario: EscenarioFake = {
      ...escenarioBase(),
      aislamiento: {},
    }

    const resultado = await calcular({ puertos: crearPuertosFake(escenario) })

    expect(resultado.evidenciaValida).toBe(true)
    expect(resultado.scoreRiesgo).not.toBeNull()
    expect(resultado.confianza).toBe('media')
  })

  it('T-UP1: peligro con metodo umbral_provisorio baja la confianza un escalón (evidencia menos confiable, no ausencia)', async () => {
    const conPercentiles = escenarioBase()
    const conProvisorio: EscenarioFake = {
      ...escenarioBase(),
      peligro: { [GEOM]: [celda('naranja', { metodo: 'umbral_provisorio' })] },
    }

    const percentiles = await calcular({ puertos: crearPuertosFake(conPercentiles) })
    const provisorio = await calcular({ puertos: crearPuertosFake(conProvisorio) })

    // El factor de amenaza se agrega igual al score...
    expect(provisorio.scoreAmenaza).not.toBeNull()
    expect(provisorio.factores.some((factor) => factor.fuente === 'peligro-celda')).toBe(true)
    // ...pero la confianza cae un escalón frente al mismo escenario con percentiles.
    expect(percentiles.confianza).toBe('alta')
    expect(provisorio.confianza).toBe('media')
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

    const resultado = await calcular({ asOf: asOfViejo, puertos: crearPuertosFake(escenario) })

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

    const conZ = await calcular({ asOf: asOfZ, puertos: puertosSinFiltroFake })
    const conOffset = await calcular({ asOf: asOfOffset, puertos: puertosSinFiltroFake })

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

    const vacio = await calcular({ puertos: crearPuertosFake(conCatalogoVacio) })
    const nulo = await calcular({ puertos: crearPuertosFake(sinSusceptibilidad) })

    expect(vacio.factores.some((factor) => factor.fuente === 'susceptibilidad-physrisk')).toBe(false)
    // 1 componente faltante (el catálogo vacío) => confianza media, no alta.
    expect(vacio.confianza).toBe('media')
    expect(vacio.confianza).toBe(nulo.confianza)
    expect(vacio.scoreVulnerabilidad).toBe(nulo.scoreVulnerabilidad)
  })

  it('T-ACC1: el aislamiento ya no es factor de vulnerabilidad y se expone como riesgoAcceso separado', async () => {
    const resultado = await calcular({ puertos: crearPuertosFake(escenarioBase()) })

    // El aislamiento salió del IRO: no debe quedar como factor de vulnerabilidad...
    expect(
      resultado.factores.some(
        (factor) => factor.tipo === 'vulnerabilidad' && factor.fuente === 'aislamiento-osm',
      ),
    ).toBe(false)
    // ...sino como dimensión aparte, con su propio factor informativo.
    expect(resultado.riesgoAcceso.score).not.toBeNull()
    expect(resultado.riesgoAcceso.nivel).not.toBeNull()
    const factorAcceso = resultado.factores.find((factor) => factor.tipo === 'acceso')
    expect(factorAcceso?.fuente).toBe('riesgo-acceso')
    // Informativo: nunca aporta al IRO compuesto.
    expect(factorAcceso?.contribucion).toBe(0)
    expect(factorAcceso?.peso).toBe(0)
  })

  it('T-AMN1: amenaza alta con vulnerabilidad 0 => scoreRiesgo bajo, pero scoreAmenaza y nivelAmenaza altos', async () => {
    const escenario: EscenarioFake = {
      ...escenarioBase(),
      peligro: { [GEOM]: [celda('rojo')] },
      caudal: { [RIO]: caudal('rojo') },
      lluvia24h: { [GEOM]: LLUVIA_72H_SATURACION_MM },
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

    const resultado = await calcular({ puertos: crearPuertosFake(escenario) })

    expect(resultado.scoreVulnerabilidad).toBe(0)
    expect(resultado.scoreRiesgo).toBe(0)
    expect(resultado.nivelRiesgo).toBe('bajo')
    expect(resultado.scoreAmenaza).toBe(100)
    expect(resultado.nivelAmenaza).toBe('muy_alto')
  })

  it('T-AMN2: en un caso normal scoreRiesgo sigue siendo amenaza x vulnerabilidad / 100 y nivelAmenaza usa el mismo mapeo de nivel', async () => {
    const resultado = await calcular({ puertos: crearPuertosFake(escenarioBase()) })

    expect(resultado.scoreAmenaza).not.toBeNull()
    expect(resultado.scoreVulnerabilidad).not.toBeNull()
    expect(resultado.scoreRiesgo).toBe(
      Math.round(((resultado.scoreAmenaza ?? 0) * (resultado.scoreVulnerabilidad ?? 0)) / 100),
    )
    expect(resultado.nivelAmenaza).not.toBeNull()
  })

  it('T-AMN3: sin amenaza presente => scoreAmenaza y nivelAmenaza null', async () => {
    const escenario: EscenarioFake = {
      ...escenarioBase(),
      territorio: { [CUE]: perfilValido({ puntoRioId: null }) },
      peligro: { [GEOM]: [celda('sin_dato')] },
      lluvia24h: { [GEOM]: null },
    }

    const resultado = await calcular({ puertos: crearPuertosFake(escenario) })

    expect(resultado.scoreAmenaza).toBeNull()
    expect(resultado.nivelAmenaza).toBeNull()
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

// T8 (motor v0.4): factor río probabilístico dentro del MISMO cálculo.
describe('calcularRiesgoEscuela con río probabilístico v0.4', () => {
  const RIO_OBS = {
    cueAnexo: CUE,
    estacionId: 'pna-corrientes',
    rio: 'parana' as const,
    lecturaM: 5.2,
    alertaM: 6,
    evacuacionM: 7,
    variacionM: 0.1,
    medidaEn: '2026-09-26T09:00:00.000Z',
    criterioExposicion: 'clase_rio=alto',
  }
  function conRio(estado: 'normal' | 'alerta' | 'evacuacion' | null): PuertosMotor {
    return {
      ...crearPuertosFake(escenarioBase()),
      rioPrefectura: { obtenerEvidencia: async () => (estado === null ? null : { ...RIO_OBS, estado }) },
    }
  }
  function prob(principal: number | null, conservador: number | null = principal, ventanaHoras: 24 | 72 | 240 = 24) {
    return { principal, conservador, ventanaHoras, metodo: 'analogos-v2+transferencia-km', version: 'superacion-terreno-v1' }
  }

  it('sin entrada probabilística el resultado es idéntico al de v0.3', async () => {
    const v03 = await calcular({ puertos: conRio('alerta') })
    const sinEstimar = await calcular({ puertos: conRio('alerta'), rioProbabilistico: prob(null) })
    expect(sinEstimar).toEqual(v03)
    expect(v03.factores.some((f) => f.variable === 'altura_rio')).toBe(true)
  })

  it('el componente probabilístico reemplaza al factor altura_rio con peso rioPrefectura', async () => {
    const r = await calcular({ puertos: conRio('normal'), rioProbabilistico: prob(0.3, 0.4) })
    expect(r.factores.some((f) => f.variable === 'altura_rio')).toBe(false)
    const f = r.factores.find((x) => x.fuente === 'rio-v04')!
    expect(f).toMatchObject({ tipo: 'amenaza', variable: 'superacion_terreno', valor: 0.3, unidad: 'probabilidad' })
    expect(f.explicacion).toContain('analogos-v2+transferencia-km')
    expect(f.explicacion).toContain('conservador 0.4')
    const amenaza = r.factores.filter((x) => x.tipo === 'amenaza')
    const suma = amenaza.reduce((a, x) => a + x.contribucion, 0)
    expect(Math.abs(suma - r.scoreAmenaza!)).toBeLessThan(0.05)
    expect(f.contribucion).toBeCloseTo(30 * f.peso, 1)
  })

  it('el piso observado de v0.3 se conserva aunque P sea 0', async () => {
    const r = await calcular({ puertos: conRio('evacuacion'), rioProbabilistico: prob(0, 0) })
    expect(r.scoreRiesgo).toBeGreaterThanOrEqual(50)
    expect(r.scoreAmenaza).toBeGreaterThanOrEqual(75)
    expect(r.factores.find((x) => x.fuente === 'rio-v04')!.explicacion).toContain('piso observado_evacuacion')
  })

  it('los pisos probabilísticos sólo suben el riesgo', async () => {
    const sinHistorial: PuertosMotor = {
      ...conRio(null),
      historial: { obtenerResumen: async () => ({ cueAnexo: CUE, cantidadConfirmadas: 0, duracionTotalHoras: 0, accesoInterrumpidoCantidad: 0, antecedentes: [] }) },
      susceptibilidad: { obtenerIndicadores: async () => null },
    }
    const alto = await calcular({ puertos: sinHistorial, rioProbabilistico: prob(0.6, 0.7) })
    expect(alto.scoreRiesgo).toBe(50)
    expect(alto.nivelRiesgo).toBe('alto')
    const moderado = await calcular({ puertos: sinHistorial, rioProbabilistico: prob(0.1, 0.25) })
    expect(moderado.scoreRiesgo).toBe(25)
    expect(moderado.factores.find((x) => x.fuente === 'rio-v04')!.explicacion).toContain('piso probabilistico_moderado')
    const bajo = await calcular({ puertos: sinHistorial, rioProbabilistico: prob(0.05, 0.1) })
    expect(bajo.scoreRiesgo).toBe(0)
  })

  it('P faltante conserva el factor río de v0.3', async () => {
    const r = await calcular({ puertos: conRio('normal'), rioProbabilistico: prob(null, null) })
    expect(r.factores.find((x) => x.variable === 'altura_rio')?.valor).toBe(5.2)
    expect(r.factores.some((x) => x.fuente === 'rio-v04')).toBe(false)
  })

  it('los horizontes pueden diferir con el río probabilístico', async () => {
    const puertos = conRio('normal')
    const r24 = await calcular({ puertos, horizonte: 72, rioProbabilistico: prob(0.05, 0.05, 72) })
    const r240 = await calcular({ puertos, horizonte: 72, rioProbabilistico: prob(0.9, 0.95, 72) })
    expect(r240.scoreAmenaza!).toBeGreaterThan(r24.scoreAmenaza!)
  })
})
