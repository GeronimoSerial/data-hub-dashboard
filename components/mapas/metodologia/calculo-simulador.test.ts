import { describe, expect, it } from 'vitest'
import { calcularRiesgoEscuela } from '@/lib/infraestructura/riesgo/motor/calculo'
import { crearPuertosFake } from '@/lib/infraestructura/riesgo/motor/__fixtures__/puertos-fake'
import { DIAS_POR_HORIZONTE_V04, MOTOR_VERSION, NIVEL_PELIGRO_A_NUMERO, REGLAS_V04_VERSION } from '@/lib/infraestructura/riesgo/motor/config'
import type { ExposicionHorizonteV04 } from '@/lib/infraestructura/riesgo/motor/exposicion-v04'
import type { HorizontePeligro, NivelPeligro } from '@/lib/infraestructura/riesgo/motor/puertos'
import { riesgoBaseV04, simularRiesgo, vulnerabilidadEnCorte, type EntradaSimulador } from './calculo-simulador'
import { FORMULAS_MOTOR } from './formula'

const asOf = '2026-10-20T12:00:00Z'
const cue = '1800001-00'
const base: EntradaSimulador = {
  horizonte: 72, peligro: 66, caudal: 33, lluviaMm: 90,
  historial: { cantidad: 2, horas: 200, accesos: 1 }, profundidadM: 0.4,
  principal: null, conservador: null, rio: null, alcance: 'completo',
}
const nivel = (n: number | null) => Object.entries(NIVEL_PELIGRO_A_NUMERO).find(([, x]) => x === n)?.[0] as NivelPeligro

async function calcularReferencia(e: EntradaSimulador) {
  const h = e.historial
  const antecedentes = Array.from({ length: h?.cantidad ?? 0 }, (_, i) => ({
    motivo: i < (h?.accesos ?? 0) ? 'Acceso interrumpido' : 'Inundación',
    categoria: 'establecimiento', accesoInterrumpido: i < (h?.accesos ?? 0),
    rigeDesde: new Date(Date.parse(asOf) - (h!.horas / h!.cantidad) * 3600_000).toISOString(), retiradaEn: asOf,
  }))
  const puertos = crearPuertosFake({
    territorio: { [cue]: { cueAnexo: cue, geometryRef: 'celda', departamento: null, puntoRioId: 'rio', motivoExclusion: null } },
    peligro: { celda: e.peligro === null ? [] : [{
      geometryRef: 'celda', horizonteHoras: e.horizonte, nivel: nivel(e.peligro),
      metodo: e.peligroProvisorio ? 'umbral_provisorio' : 'percentiles', base: 'deterministico',
      probabilidadP95: null, probabilidadP99: null, precipitacionMm: null, percentilReferencia: null,
      emitidoEn: asOf, validoHasta: asOf, versionRegla: 'ejemplo',
    }] },
    caudal: e.caudal === null ? {} : { rio: { puntoId: 'rio', nivel: nivel(e.caudal), percentilActual: null, emitidoEn: asOf, validoHasta: asOf } },
    lluvia24h: { celda: e.lluviaMm }, lluvia72h: { celda: e.lluviaMm },
    historial: { [cue]: { cueAnexo: cue, antecedentes, fuenteDisponible: h !== null, cantidadConfirmadas: 0, duracionTotalHoras: 0, accesoInterrumpidoCantidad: 0 } },
    susceptibilidad: e.profundidadM === null ? {} : { [cue]: { cueAnexo: cue, indicadores: {}, profundidadFluvialRp100M: e.profundidadM, version: 'ejemplo' } },
    aislamiento: e.aislamientoDisponible === false ? {} : { [cue]: { cueAnexo: cue, nivel: 0, crucesAguaCount: 0, crucesAguaConPuenteCount: 0, crucesAguaConVadoCount: 0, tieneAlternativaSinCruce: true, versionJob: 'ejemplo', fechaExtractoOsm: asOf, licencia: 'ODbL' } },
  })
  if (e.climatologia) {
    puertos.lluviaObservada.obtenerAcumulado = async () => ({
      geometryRef: 'celda', acumuladoMm24h: e.lluviaMm, acumuladoMm72h: e.lluviaMm,
      climatologia24h: e.climatologia, climatologia72h: e.climatologia, observadoEn: asOf,
    })
  }
  const exposicion: ExposicionHorizonteV04 = {
    criterio: 'dem_agua_posible', alcance: e.alcance, margenM: null, sueloM: null,
    nivelRioDemM: null, anomaliaM: null, aguaPosibleM: null, subida: null,
    confianzaBaja: e.exposicionIncierta ?? false, detalle: 'alcance resuelto',
  }
  puertos.rioPrefectura = { obtenerEvidencia: async () => e.rio === null ? null : e.rio === 'sin_dato'
    ? { cueAnexo: cue, estacionId: 'pna', rio: 'parana', disponibilidad: 'sin_dato', motivo: 'sin lectura' }
    : { ...e.rio, cueAnexo: cue, estacionId: 'pna', rio: 'parana', evacuacionM: 7, medidaEn: asOf, criterioExposicion: 'ejemplo', exposicionV04: { 24: exposicion, 72: exposicion, 240: exposicion } } }
  return calcularRiesgoEscuela({
    cueAnexo: cue, horizonte: e.horizonte, asOf, puertos, reglas: 'v0.4',
    rioProbabilistico: e.principal === null ? null : {
      principal: e.principal, conservador: e.conservador, ventanaHoras: e.horizonte,
      metodo: 'ejemplo', version: 'ejemplo', alcanceMargen: {
        cotaConservadoraM: 10, pUmbral: e.alcance === 'completo' ? 1 : 0,
        pBanda: e.alcance !== 'ninguno' ? 1 : 0,
      },
    },
  })
}

async function comparar(e: EntradaSimulador) {
  const real = await calcularReferencia(e)
  const sim = simularRiesgo(e)
  expect({ A: sim.A, V: sim.V, R: sim.R, confianza: sim.confianza }).toEqual({
    A: real.scoreAmenaza, V: real.scoreVulnerabilidad, R: real.scoreRiesgo, confianza: real.confianza,
  })
  expect(sim.pesos.map((p) => p.peso).sort()).toEqual(real.factores.filter((f) => f.peso > 0).map((f) => f.peso).sort())
  expect(real.modeloVersion).toBe(`${MOTOR_VERSION}+${REGLAS_V04_VERSION}`)
  return sim
}

describe('simulador contra calculo.ts con reglas operativas', () => {
  for (const horizonte of Object.keys(DIAS_POR_HORIZONTE_V04).map(Number) as HorizontePeligro[]) {
    it(`redistribuye y redondea igual con cada combinación de faltantes a ${horizonte} h`, async () => {
      for (let mascara = 0; mascara < 64; mascara++) {
        await comparar({
          ...base, horizonte,
          peligro: mascara & 1 ? null : base.peligro, caudal: mascara & 2 ? null : base.caudal,
          lluviaMm: mascara & 4 ? null : base.lluviaMm, historial: mascara & 8 ? null : base.historial,
          profundidadM: mascara & 16 ? null : base.profundidadM,
          principal: mascara & 32 ? null : 0.17, conservador: 0.19,
        })
      }
    })
  }

  it('conserva la amenaza completa con V desconocida y la mitad con V cero', async () => {
    expect((await comparar({ ...base, historial: null, profundidadM: null })).R).toBe(simularRiesgo(base).A === null ? null : Math.round(simularRiesgo(base).A!))
    const cero = await comparar({ ...base, historial: { cantidad: 0, horas: 0, accesos: 0 }, profundidadM: 0 })
    expect(cero.R).toBe(Math.round(cero.A! / 2))
  })

  it('coincide para pisos observados completos, reducidos y sin alcance', async () => {
    for (const estado of ['normal', 'alerta', 'evacuacion'] as const) {
      for (const alcance of ['completo', 'reducido', 'ninguno'] as const) {
        for (const principal of [null, 0, 0.1, 0.5]) {
          await comparar({ ...base, peligro: 0, lluviaMm: 0, caudal: 0,
            historial: null, profundidadM: 0, principal, conservador: 0.1,
            rio: { estado, lecturaM: 4, alertaM: 5, variacionM: 1 }, alcance })
        }
      }
    }
  })

  it('usa principal para alto y conservadora para moderado, con bordes inclusivos', async () => {
    const bajo = { ...base, peligro: 0, caudal: 0, lluviaMm: 0, historial: null, profundidadM: 0 }
    for (const principal of [null, 0, 0.1999, 0.2, 0.4999, 0.5, 1]) {
      for (const conservador of [null, 0.1999, 0.2, 0.5, 1]) await comparar({ ...bajo, principal, conservador })
    }
    expect((await comparar({ ...bajo, principal: 0.2, conservador: 0.1999 })).R).toBeLessThan(25)
    expect((await comparar({ ...bajo, principal: 0, conservador: 0.2 })).R).toBe(25)
    expect((await comparar({ ...bajo, principal: 0.5, conservador: null })).R).toBe(50)
    expect((await comparar({ ...bajo, principal: null, conservador: 1 })).R).toBe(0)
  })

  it('distingue dato ausente de cero y replica las penalizaciones de confianza', async () => {
    for (const rio of [null, 'sin_dato'] as const) {
      for (const principal of [null, 0]) await comparar({ ...base, rio, principal, peligroProvisorio: true, aislamientoDisponible: false })
    }
    await comparar({ ...base, rio: { estado: 'alerta', lecturaM: 5, alertaM: 5, variacionM: 0 }, exposicionIncierta: true })
    const sinAmenaza = await comparar({ ...base, peligro: null, caudal: null, lluviaMm: null })
    expect(sinAmenaza.R).toBeNull()
  })

  it('puntúa lluvia por ventana y climatología, y satura sólo la profundidad fluvial', async () => {
    for (const horizonte of [24, 72, 240] as const) {
      for (const lluviaMm of [0, 50, 80, 90, 120, 180, 250]) {
        for (const profundidadM of [0, 0.123456, 1, 2, null]) {
          await comparar({ ...base, horizonte, lluviaMm, profundidadM, climatologia: { p90: 60, p95: 90, p99: 140, version: 'ejemplo' } })
        }
      }
    }
  })

  it('las curvas de la superficie coinciden con los cortes del riesgo redondeado', () => {
    for (const corte of [25, 50, 75]) {
      for (const amenaza of [10, 25, 33, 50, 66, 80, 100]) {
        const v = vulnerabilidadEnCorte(amenaza, corte)
        if (v === null) continue
        expect(riesgoBaseV04(amenaza, v - 0.0001)).toBeLessThan(corte)
        expect(riesgoBaseV04(amenaza, v + 0.0001)).toBeGreaterThanOrEqual(corte)
      }
    }
    expect(vulnerabilidadEnCorte(0, 25)).toBeNull()
    expect(vulnerabilidadEnCorte(100, 25)).toBeNull()
  })

  it('la fórmula publicada y la superficie dan el mismo riesgo base que el núcleo', async () => {
    const coeficientes = FORMULAS_MOTOR.riesgo.match(/\[(\d+(?:\{,\}\d+)?)\+(\d+(?:\{,\}\d+)?)/)!
    const b = Number(coeficientes[1].replace('{,}', '.'))
    const k = Number(coeficientes[2].replace('{,}', '.'))
    for (const amenaza of [0, 33, 66, 100]) {
      for (const profundidadM of [0, 0.1, 0.5, 1, null]) {
        const r = await comparar({ ...base, peligro: amenaza, caudal: null, lluviaMm: null, historial: null, profundidadM })
        expect(r.R).toBe(riesgoBaseV04(r.A!, r.V))
        if (r.V !== null) expect(r.R).toBe(Math.round(r.A! * (b + k * r.V / 100)))
      }
    }
  })
})
