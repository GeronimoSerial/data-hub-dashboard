// Reglas v0.4 del cálculo compartido (T10, docs/motor-v0.4/auditoria-v03.md):
// F1 susceptibilidad sólo fluvial, F2 historial ausente sin partes y
// combinación que no anula la amenaza, F7 confianza con faltantes reales.
import { describe, expect, it } from 'vitest'
import { crearPuertosFake, type EscenarioFake } from './__fixtures__/puertos-fake'
import { calcularRiesgoEscuela } from './calculo'
import type { EvidenciaRioProbabilistica } from './tipos'
import type { IndicadoresSusceptibilidad, NivelPeligroCelda, PuertosMotor, ResumenHistorial } from './puertos'

const CUE = 'CUE-V04'
const GEOM = 'geom-v04'
const AS_OF = '2026-10-18T02:15:04.000Z'

function celda(nivel: NivelPeligroCelda['nivel']): NivelPeligroCelda {
  return {
    geometryRef: GEOM,
    horizonteHoras: 24,
    nivel,
    base: 'ensemble',
    metodo: 'percentiles',
    probabilidadP95: null,
    probabilidadP99: null,
    precipitacionMm: null,
    percentilReferencia: null,
    emitidoEn: '2026-10-18T00:00:00.000Z',
    validoHasta: '2026-10-19T00:00:00.000Z',
    versionRegla: 'peligro-v0.2',
  }
}

// Magnitudes reales de prod (auditoría 2026-10-18): profundidad WRI en metros
// y calor en grados-día, que v0.3 promediaba y saturaba en 100.
function susceptibilidadReal(profundidadJrcM: number | null): IndicadoresSusceptibilidad {
  return {
    cueAnexo: CUE,
    indicadores: { peligro_inundacion_fluvial: 0.8, peligro_calor: 300 },
    version: '1',
    profundidadFluvialRp100M: profundidadJrcM,
  }
}

const SIN_PARTES: ResumenHistorial = {
  cueAnexo: CUE,
  cantidadConfirmadas: 0,
  duracionTotalHoras: 0,
  accesoInterrumpidoCantidad: 0,
  antecedentes: [],
  fuenteDisponible: false,
}

function escenario(over: Partial<EscenarioFake> = {}): EscenarioFake {
  return {
    territorio: { [CUE]: { cueAnexo: CUE, geometryRef: GEOM, departamento: 'X', puntoRioId: 'rio-1', motivoExclusion: null } },
    peligro: { [GEOM]: [celda('naranja')] },
    // Caudal y celda en naranja (66) → amenaza 66; sin lluvia observada (1 faltante).
    caudal: { 'rio-1': { puntoId: 'rio-1', percentilActual: 95, nivel: 'naranja', emitidoEn: '2026-10-18T00:00:00.000Z', validoHasta: '2026-10-19T00:00:00.000Z' } },
    aislamiento: {
      [CUE]: {
        cueAnexo: CUE,
        nivel: 1,
        crucesAguaCount: 0,
        crucesAguaConPuenteCount: 0,
        crucesAguaConVadoCount: 0,
        tieneAlternativaSinCruce: true,
        versionJob: '4',
        fechaExtractoOsm: '2026-10-01',
        licencia: 'ODbL',
      },
    },
    susceptibilidad: { [CUE]: susceptibilidadReal(0.4) },
    ...over,
  }
}

function puertosCon(e: EscenarioFake, historial: ResumenHistorial = SIN_PARTES): PuertosMotor {
  return { ...crearPuertosFake(e), historial: { obtenerResumen: async () => historial } }
}

const calcular = (puertos: PuertosMotor, reglas?: 'v0.3' | 'v0.4') =>
  calcularRiesgoEscuela({ cueAnexo: CUE, horizonte: 24, asOf: AS_OF, puertos, reglas })

describe('reglas v0.4 — F1 susceptibilidad sólo fluvial', () => {
  it('v0.3 satura con magnitudes reales; v0.4 usa sólo la profundidad JRC escalada por el tope', async () => {
    const v03 = await calcular(puertosCon(escenario()), 'v0.3')
    expect(v03.factores.find((f) => f.fuente === 'susceptibilidad-physrisk')?.valor).toBe(100)

    const v04 = await calcular(puertosCon(escenario()), 'v0.4')
    const f = v04.factores.find((x) => x.tipo === 'vulnerabilidad' && x.variable === 'profundidad_fluvial_rp100')
    expect(f).toMatchObject({ valor: 0.4, unidad: 'm', fuente: 'susceptibilidad-jrc' })
    // Sin historial (sistema sin partes) la vulnerabilidad es la susceptibilidad sola.
    expect(v04.scoreVulnerabilidad).toBe(40)
  })

  it('profundidad nula es sin dato (nunca 0): no hay factor de susceptibilidad', async () => {
    const r = await calcular(puertosCon(escenario({ susceptibilidad: { [CUE]: susceptibilidadReal(null) } })), 'v0.4')
    expect(r.factores.some((f) => f.tipo === 'vulnerabilidad')).toBe(false)
    expect(r.scoreVulnerabilidad).toBeNull()
  })

  it('profundidad sobre el tope satura en 100 y 0 m es un 0 real', async () => {
    const hondo = await calcular(puertosCon(escenario({ susceptibilidad: { [CUE]: susceptibilidadReal(2.5) } })), 'v0.4')
    expect(hondo.scoreVulnerabilidad).toBe(100)
    const seco = await calcular(puertosCon(escenario({ susceptibilidad: { [CUE]: susceptibilidadReal(0) } })), 'v0.4')
    expect(seco.scoreVulnerabilidad).toBe(0)
  })
})

describe('reglas v0.4 — F2 historial y combinación', () => {
  it('sin partes en el sistema el historial no entra (peso redistribuido) y la amenaza no se borra', async () => {
    const r = await calcular(puertosCon(escenario({ susceptibilidad: { [CUE]: susceptibilidadReal(0) } })), 'v0.4')
    expect(r.factores.some((f) => f.fuente === 'historial')).toBe(false)
    // V = 0 → riesgo = amenaza × 0.5 (v0.3 daba 0).
    expect(r.scoreAmenaza).toBe(66)
    expect(r.scoreRiesgo).toBe(33)
    expect(r.nivelRiesgo).toBe('moderado')
  })

  it('v0.3 con el mismo historial vacío anula casi toda la amenaza', async () => {
    const r = await calcular(puertosCon(escenario({ susceptibilidad: { [CUE]: susceptibilidadReal(0) } })), 'v0.3')
    expect(r.scoreRiesgo).toBeLessThan(25)
  })

  it('con partes en el sistema el historial (aunque sea 0) sí cuenta como dato', async () => {
    const r = await calcular(
      puertosCon(escenario({ susceptibilidad: { [CUE]: susceptibilidadReal(1) } }), { ...SIN_PARTES, fuenteDisponible: true }),
      'v0.4',
    )
    expect(r.factores.find((f) => f.fuente === 'historial')?.valor).toBe(0)
    expect(r.scoreVulnerabilidad).toBe(30)
    expect(r.scoreRiesgo).toBe(Math.round(66 * (0.5 + 0.5 * 0.3)))
  })

  it('vulnerabilidad desconocida no baja el riesgo (factor 1)', async () => {
    const r = await calcular(puertosCon(escenario({ susceptibilidad: {} })), 'v0.4')
    expect(r.scoreVulnerabilidad).toBeNull()
    expect(r.scoreRiesgo).toBe(66)
  })
})

describe('reglas v0.4 — F7 confianza', () => {
  it('historial ausente cuenta como faltante', async () => {
    // Faltan lluvia observada e historial: dos faltantes → baja.
    const r = await calcular(puertosCon(escenario()), 'v0.4')
    expect(r.confianza).toBe('baja')
    const conPartes = await calcular(puertosCon(escenario(), { ...SIN_PARTES, fuenteDisponible: true }), 'v0.4')
    expect(conPartes.confianza).toBe('media')
  })
})

describe('reglas por defecto', () => {
  it('sin selector el resultado es el de v0.3', async () => {
    const p = puertosCon(escenario())
    expect(await calcular(p)).toEqual(await calcular(p, 'v0.3'))
  })
})

// F3 — exposición contra el agua posible del horizonte.
describe('reglas v0.4 — F3 pisos por río según alcance', () => {
  type Alcance = 'completo' | 'reducido' | 'ninguno'
  function expo(alcance: Alcance, criterio: 'dem_agua_posible' | 'jrc_respaldo' = 'dem_agua_posible') {
    return {
      criterio,
      alcance,
      margenM: alcance === 'completo' ? 0.5 : alcance === 'reducido' ? -1 : -9,
      sueloM: 60,
      nivelRioDemM: 55,
      anomaliaM: 1.5,
      aguaPosibleM: 57.5,
      subida: { analogosP90M: 1, tendenciaCortaM: 0.2, tendenciaMediaM: 0.4, ondaM: 0, posibleM: 1, decide: 'analogos' as const, tasaMediaM: 0.04 },
      confianzaBaja: criterio === 'jrc_respaldo',
      detalle: 'test',
    }
  }
  function conRio(estado: 'alerta' | 'evacuacion', porH: { 24: Alcance; 72: Alcance; 240: Alcance }, criterio?: 'jrc_respaldo'): PuertosMotor {
    return {
      ...puertosCon(escenario({ susceptibilidad: { [CUE]: susceptibilidadReal(0) }, caudal: {}, peligro: { [GEOM]: ([24, 72, 240] as const).map((h) => ({ ...celda('verde'), horizonteHoras: h })) } })),
      rioPrefectura: {
        obtenerEvidencia: async () => ({
          cueAnexo: CUE,
          estacionId: 'pna-corrientes',
          rio: 'parana' as const,
          lecturaM: 6.77,
          alertaM: estado === 'alerta' ? 6.5 : 6,
          evacuacionM: estado === 'alerta' ? 7 : 6.5,
          variacionM: 0.02,
          medidaEn: '2026-10-17T15:00:00.000Z',
          estado,
          criterioExposicion: 'exposicion_v0.4',
          exposicionV04: { 24: expo(porH[24], criterio), 72: expo(porH[72], criterio), 240: expo(porH[240], criterio) },
        }),
      },
    }
  }
  const calcularH = (p: PuertosMotor, horizonte: 24 | 72 | 240, rioProbabilistico?: Parameters<typeof calcularRiesgoEscuela>[0]['rioProbabilistico']) =>
    calcularRiesgoEscuela({ cueAnexo: CUE, horizonte, asOf: AS_OF, puertos: p, reglas: 'v0.4', rioProbabilistico })

  it('alcance completo aplica el piso observado entero', async () => {
    const r = await calcularH(conRio('alerta', { 24: 'completo', 72: 'completo', 240: 'completo' }), 24)
    expect(r.scoreRiesgo).toBe(25)
    const f = r.factores.find((x) => x.variable === 'altura_rio')!
    expect(f.contribucion).toBeGreaterThan(0)
    expect(f.explicacion).toContain('escuela expuesta por exposicion_v0.4')
    expect(f.explicacion).toContain('exposicion v0.4 a 24h: criterio dem_agua_posible; alcance completo; margen 0.5m')
  })

  it('banda: evacuación baja a piso moderado; alerta queda sin piso', async () => {
    const evac = await calcularH(conRio('evacuacion', { 24: 'reducido', 72: 'reducido', 240: 'reducido' }), 24)
    expect(evac.scoreRiesgo).toBe(25)
    expect(evac.scoreAmenaza).toBeGreaterThanOrEqual(50)
    const alerta = await calcularH(conRio('alerta', { 24: 'reducido', 72: 'reducido', 240: 'reducido' }), 24)
    expect(alerta.scoreRiesgo).toBeLessThan(25)
  })

  it('terreno no alcanzable: ni piso ni componente; queda un factor informativo sin peso', async () => {
    const r = await calcularH(conRio('evacuacion', { 24: 'ninguno', 72: 'ninguno', 240: 'ninguno' }), 24)
    expect(r.scoreRiesgo).toBeLessThan(25)
    const f = r.factores.find((x) => x.variable === 'altura_rio')!
    expect(f).toMatchObject({ unidad: 'no_alcanzable', peso: 0, contribucion: 0 })
    expect(f.explicacion).not.toContain('escuela expuesta')
    expect(f.explicacion).toContain('alcance ninguno')
  })

  it('los horizontes difieren según el alcance de cada uno', async () => {
    const p = conRio('evacuacion', { 24: 'ninguno', 72: 'reducido', 240: 'completo' })
    const [a, b, c] = await Promise.all([calcularH(p, 24), calcularH(p, 72), calcularH(p, 240)])
    expect([a.nivelRiesgo, b.nivelRiesgo, c.nivelRiesgo]).toEqual(['bajo', 'moderado', 'alto'])
  })

  it('respaldo JRC aplica el piso con confianza degradada', async () => {
    const completar = (p: PuertosMotor): PuertosMotor => ({
      ...p,
      historial: { obtenerResumen: async () => ({ ...SIN_PARTES, fuenteDisponible: true }) },
      lluviaObservada: { obtenerAcumulado: async () => ({ geometryRef: GEOM, acumuladoMm24h: 0, acumuladoMm72h: 0, observadoEn: AS_OF }) },
    })
    const todos = { 24: 'completo', 72: 'completo', 240: 'completo' } as const
    const dem = await calcularH(completar(conRio('alerta', todos)), 24)
    const jrc = await calcularH(completar(conRio('alerta', todos, 'jrc_respaldo')), 24)
    expect(jrc.scoreRiesgo).toBe(25)
    expect(dem.confianza).toBe('media')
    expect(jrc.confianza).toBe('baja')
    expect(jrc.factores.find((f) => f.variable === 'altura_rio')!.explicacion).toContain('(confianza baja)')
  })

  it('zona modelada: el piso observado exige P conservadora alcanzable o tendencia que alcance la cota', async () => {
    const p = conRio('evacuacion', { 24: 'ninguno', 72: 'ninguno', 240: 'ninguno' })
    const prob = (conservador: number, alcanzaTendencia = false) => ({
      principal: 0,
      conservador,
      ventanaHoras: 24 as const,
      metodo: 'analogos-v2+transferencia-km',
      version: 'superacion-terreno-v1',
      tendencia: { alcanza: alcanzaTendencia, nivelSitioM: alcanzaTendencia ? 48.2 : 41, cotaM: 48, subidaM: 0.36 },
    })
    const bajo = await calcularH(p, 24, prob(0.02))
    expect(bajo.scoreRiesgo).toBeLessThan(25)
    expect(bajo.factores.find((f) => f.fuente === 'rio-v04')!.explicacion).toContain('alcance_observado ninguno')
    const pCons = await calcularH(p, 24, prob(0.06))
    expect(pCons.scoreRiesgo).toBe(50)
    expect(pCons.factores.find((f) => f.fuente === 'rio-v04')!.explicacion).toContain('alcance_observado completo: p_umbral 0.06 >= 0.05')
    const tendencia = await calcularH(p, 24, prob(0, true))
    expect(tendencia.scoreRiesgo).toBe(50)
    expect(tendencia.factores.find((f) => f.fuente === 'rio-v04')!.explicacion).toContain('alcance_observado completo: tendencia nivel_sitio 48.2m >= umbral 46m')
    // Con reglas v0.3 el piso observado se aplica igual aunque P sea 0.
    const v03 = await calcularRiesgoEscuela({ cueAnexo: CUE, horizonte: 24, asOf: AS_OF, puertos: p, rioProbabilistico: prob(0.02) })
    expect(v03.scoreRiesgo).toBeGreaterThanOrEqual(50)
  })

  it('zona modelada: mismo margen de error vertical y banda que la zona DEM', async () => {
    const p = conRio('evacuacion', { 24: 'ninguno', 72: 'ninguno', 240: 'ninguno' })
    // Nivel máximo posible en el sitio 46.5 m (tendencia); P exacta 0.
    const prob = (cotaM: number, extra: Partial<EvidenciaRioProbabilistica> = {}): EvidenciaRioProbabilistica => ({
      principal: 0,
      conservador: 0,
      ventanaHoras: 24,
      metodo: 'analogos-v2+transferencia-km',
      version: 'superacion-terreno-v1',
      tendencia: { alcanza: false, nivelSitioM: 46.5, cotaM, subidaM: 0.3 },
      ...extra,
    })
    const rio = (r: Awaited<ReturnType<typeof calcularH>>) => r.factores.find((f) => f.fuente === 'rio-v04')!.explicacion
    // 1,5 m sobre el máximo posible → dentro del margen de 2 m → piso completo.
    const completo = await calcularH(p, 24, prob(48))
    expect(completo.scoreRiesgo).toBe(50)
    expect(rio(completo)).toContain('alcance_observado completo: tendencia nivel_sitio 46.5m >= umbral 46m')
    expect(rio(completo)).toContain('cota_conservadora 48m; margen_error 2m; banda 2m')
    // 3 m sobre el máximo → banda → piso un nivel menor (evacuación → moderado).
    const reducido = await calcularH(p, 24, prob(49.5))
    expect(reducido.scoreRiesgo).toBe(25)
    expect(reducido.nivelRiesgo).toBe('moderado')
    expect(rio(reducido)).toContain('alcance_observado reducido')
    // 5 m sobre el máximo → sin piso.
    const ninguno = await calcularH(p, 24, prob(51.5))
    expect(ninguno.scoreRiesgo).toBeLessThan(25)
    expect(rio(ninguno)).toContain('alcance_observado ninguno')
    // La probabilidad del ensamble contra cota − margen también decide.
    const porP = await calcularH(p, 24, prob(51.5, { alcanceMargen: { cotaConservadoraM: 51.5, pUmbral: 0.1, pBanda: 0.3 } }))
    expect(porP.scoreRiesgo).toBe(50)
    expect(rio(porP)).toContain('alcance_observado completo: p_umbral 0.1 >= 0.05')
    const porBanda = await calcularH(p, 24, prob(51.5, { alcanceMargen: { cotaConservadoraM: 51.5, pUmbral: 0.01, pBanda: 0.2 } }))
    expect(porBanda.scoreRiesgo).toBe(25)
    // Pisos probabilísticos: contra el terreno SIN margen (sin cambios).
    const alto = await calcularH(p, 24, prob(60, { principal: 0.6, conservador: 0.7 }))
    expect(alto.nivelRiesgo).toBe('alto')
  })
})

describe('reglas v0.4 — F6 caudal por horizonte', () => {
  it('v0.4 pide el caudal del horizonte; v0.3 no', async () => {
    const pedidos: Array<number | undefined> = []
    const base = puertosCon(escenario())
    const p: PuertosMotor = {
      ...base,
      peligro: {
        ...base.peligro,
        obtenerNivelCaudal: async (params) => {
          pedidos.push(params.horizonteHoras)
          return base.peligro.obtenerNivelCaudal(params)
        },
      },
    }
    await calcularRiesgoEscuela({ cueAnexo: CUE, horizonte: 72, asOf: AS_OF, puertos: p, reglas: 'v0.4' })
    await calcularRiesgoEscuela({ cueAnexo: CUE, horizonte: 72, asOf: AS_OF, puertos: p })
    expect(pedidos).toEqual([72, undefined])
  })
})
