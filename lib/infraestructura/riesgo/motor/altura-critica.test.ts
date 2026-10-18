import { describe, expect, it } from 'vitest'
import {
  DEFENSAS_COSTERAS_V04,
  OFFSETS_CALIBRADOS_V04,
  TRATAMIENTO_DEFENSA_V04,
  aplicarEvidenciaSeco,
  alturaCriticaCalibrada,
  alturaCriticaModelada,
  defensaDeLocalidad,
  evaluarAlcanceAlturaCritica,
  explicacionAlturaCritica,
  offsetUtilizable,
  type DefensaCostera,
} from './altura-critica'
import { evidenciaSecoS2 } from './evidencia-seco-s2'
import { BANDA_EXPOSICION_V04_M, MARGEN_ERROR_DEM_V04_M } from './config'

const maximos = (valores: number[]) => ({ 24: valores.map((v) => v - 0.5), 72: valores.map((v) => v - 0.2), 240: valores })
const sinSubida = { 24: null, 72: null, 240: null }

describe('altura crítica con offset calibrado (b = 1)', () => {
  it('h_crit = cota − margen − a; banda = h_crit − BANDA', () => {
    expect(OFFSETS_CALIBRADOS_V04['pna-corrientes'].aM).toBe(41.35)
    const r = alturaCriticaCalibrada(41.35, 50.5)
    expect(r.alturaCriticaM).toBe(Number((50.5 - MARGEN_ERROR_DEM_V04_M - 41.35).toFixed(2)))
    expect(r.alturaCriticaBandaM).toBe(Number((r.alturaCriticaM - BANDA_EXPOSICION_V04_M).toFixed(2)))
  })

  it('sólo se usan veredictos usar / usar con reservas; Paso de la Patria (contradicho) y La Cruz no', () => {
    expect(offsetUtilizable('pna-paso-de-los-libres')?.aM).toBe(37.12)
    expect(offsetUtilizable('pna-monte-caseros')?.aM).toBe(32.05)
    expect(offsetUtilizable('pna-paso-de-la-patria')).toBeNull()
    expect(OFFSETS_CALIBRADOS_V04['pna-paso-de-la-patria'].veredicto).toBe('contradicho')
    expect(offsetUtilizable('pna-la-cruz')).toBeNull()
  })
})

describe('altura crítica en la zona modelada (inversión de la transferencia km)', () => {
  it('desplazamiento paralelo: h_crit = h_ref + (umbral − nivel_sitio)', () => {
    // nivel actual en el sitio 47,2 m con h_ref 6,0 m; umbral (cota − margen) 48,0 m.
    expect(alturaCriticaModelada({ hReferenciaM: 6, nivelSitioM: 47.2, umbralM: 48 })).toBe(6.8)
  })
})

describe('evidencia de seco Sentinel-2 como piso de h_crit', () => {
  it('nunca baja la altura crítica por debajo de lo observado seco', () => {
    const r = aplicarEvidenciaSeco({ alturaCriticaM: 6.3, alturaCriticaBandaM: 4.3 }, { hSecoM: 7.38, fecha: '2023-11-12', estacionId: 'pna-paso-de-la-patria' })
    expect(r).toEqual({ alturaCriticaM: 7.38, alturaCriticaBandaM: 5.38, elevadaPorSeco: true })
    expect(aplicarEvidenciaSeco({ alturaCriticaM: 9, alturaCriticaBandaM: 7 }, { hSecoM: 7.38, fecha: 'x', estacionId: 'y' }).elevadaPorSeco).toBe(false)
    expect(aplicarEvidenciaSeco({ alturaCriticaM: 9, alturaCriticaBandaM: 7 }, null)).toEqual({ alturaCriticaM: 9, alturaCriticaBandaM: 7, elevadaPorSeco: false })
  })

  it('la tabla versionada trae las escuelas de Paso de la Patria contradichas', () => {
    const e = evidenciaSecoS2('1800050-04')
    expect(e?.hSecoM).toBeGreaterThan(0)
    expect(evidenciaSecoS2('0000000-00')).toBeNull()
  })
})

describe('P(máx escala ≥ h_crit) y compuerta del piso observado', () => {
  it('P monótona entre horizontes y completo si P ≥ umbral alcanzable', () => {
    const m = maximos([5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 4, 4, 4, 4, 4, 4, 4, 4, 4])
    const r = evaluarAlcanceAlturaCritica({ alturaCriticaM: 9.8, alturaCriticaBandaM: 7.8, h0M: 6, maximos: m, subidaDeterministaM: sinSubida, defensa: null, aEstacionM: null })
    expect(r[24].pAlcanzar).toBeLessThanOrEqual(r[72].pAlcanzar!)
    expect(r[72].pAlcanzar).toBeLessThanOrEqual(r[240].pAlcanzar!)
    expect(r[240].alcance).toBe('completo')
    expect(r[24].alcance).toBe('reducido')
  })

  it('la tendencia/onda que llega a h_crit da piso completo aunque P sea 0', () => {
    const m = maximos(Array(20).fill(5))
    const r = evaluarAlcanceAlturaCritica({ alturaCriticaM: 7, alturaCriticaBandaM: 6.5, h0M: 6, maximos: m, subidaDeterministaM: { 24: 0.2, 72: 0.6, 240: 1.2 }, defensa: null, aEstacionM: null })
    expect(r[240].alcance).toBe('completo')
    expect(r[240].decide).toBe('tendencia')
    expect(r[24].alcance).toBe('ninguno')
  })
})

describe('defensas costeras', () => {
  const m = maximos(Array(20).fill(10))
  const base = { alturaCriticaM: 7, alturaCriticaBandaM: 5, h0M: 6, maximos: m, subidaDeterministaM: sinSubida, aEstacionM: 30 }

  it('Goya, Corrientes y Esquina están defendidas con coronamiento desconocido; tratamiento por defecto piso_reducido', () => {
    expect(TRATAMIENTO_DEFENSA_V04).toBe('piso_reducido')
    expect(defensaDeLocalidad('Goya')?.cotaCoronamientoM).toBeNull()
    expect(defensaDeLocalidad('CORRIENTES')).not.toBeNull()
    expect(defensaDeLocalidad('ESQUINA')).not.toBeNull()
    expect(defensaDeLocalidad('BELLA VISTA')).toBeNull()
    expect(DEFENSAS_COSTERAS_V04.length).toBe(3)
  })

  it('coronamiento desconocido: el piso baja un nivel (provisorio) y la explicación lo dice', () => {
    const r = evaluarAlcanceAlturaCritica({ ...base, defensa: defensaDeLocalidad('GOYA') })
    expect(r[240].alcance).toBe('reducido')
    expect(r[240].alcanceSinDefensa).toBe('completo')
    const texto = explicacionAlturaCritica({ ...r[240], alturaCriticaM: 7, alturaCriticaBandaM: 5, h0M: 6, record: null, fuente: 'calibrada', estacionId: 'pna-goya', evidenciaSecoS2: null, defensa: defensaDeLocalidad('GOYA'), pAlcanzarPorHorizonte: { 24: 1, 72: 1, 240: 1 } }, 240)
    expect(texto).toContain('protegida por defensa costera; cota de coronamiento desconocida: piso reducido un nivel (provisorio)')
  })

  const conCota = (cotaCoronamientoM: number): DefensaCostera => ({ ...defensaDeLocalidad('GOYA')!, cotaCoronamientoM })

  it('coronamiento conocido y desbordado: piso completo', () => {
    // a 30 + h 10 = 40 ≥ coronamiento 39.
    expect(evaluarAlcanceAlturaCritica({ ...base, defensa: conCota(39) })[240].alcance).toBe('completo')
  })

  it('coronamiento conocido, agua debajo: sin piso, o reducido dentro de la banda', () => {
    expect(evaluarAlcanceAlturaCritica({ ...base, defensa: conCota(45) })[240].alcance).toBe('ninguno')
    expect(evaluarAlcanceAlturaCritica({ ...base, defensa: conCota(41) })[240].alcance).toBe('reducido')
  })
})
