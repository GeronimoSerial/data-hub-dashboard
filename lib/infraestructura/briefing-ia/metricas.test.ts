import { describe, expect, it } from 'vitest'
import { derivarMetricasAutorizadas, mapaMetricasPorId } from './metricas'
import type { CorteSituacion } from './puertos'

function crearCorte(parcial: Partial<CorteSituacion> = {}): CorteSituacion {
  return {
    id: 'corte-1',
    generadoEn: '2026-09-27T06:00:00Z',
    riskRunId: null,
    cobertura: null,
    conteosPorNivelRiesgo: {},
    kpis: {
      escuelasAfectacionConfirmadaVigente: 0,
      escuelasRiesgoAlto24h: 0,
      fuentesVencidas: 0,
    },
    fuentesSalud: [],
    episodiosAbiertos: 0,
    episodiosCerradosDesdeAnterior: 0,
    generadoPorJobRunId: null,
    creadaEn: '2026-09-27T06:00:00Z',
    ...parcial,
  }
}

describe('derivarMetricasAutorizadas', () => {
  it('corte con cobertura null omite las métricas de cobertura', () => {
    const metricas = derivarMetricasAutorizadas(
      crearCorte({ conteosPorNivelRiesgo: { alto: 2 } }),
    )

    expect(metricas.some((metrica) => metrica.id.startsWith('cobertura.'))).toBe(false)
    expect(metricas.map((metrica) => metrica.id)).toContain('nivel.alto')
  })

  it('corte con conteosPorNivelRiesgo vacío no aporta métricas de nivel', () => {
    const metricas = derivarMetricasAutorizadas(crearCorte())

    expect(metricas.some((metrica) => metrica.id.startsWith('nivel.'))).toBe(false)
  })

  it('orden determinista y alfabético en las claves dinámicas', () => {
    const metricas = derivarMetricasAutorizadas(
      crearCorte({
        cobertura: { departamentos: 10, escuelas: 50, secciones: 5 },
        conteosPorNivelRiesgo: { muy_alto: 3, bajo: 7, alto: 2 },
      }),
    )

    expect(metricas.map((metrica) => metrica.id)).toEqual([
      'kpi.escuelas_afectacion_confirmada_vigente',
      'kpi.escuelas_riesgo_alto_24h',
      'kpi.fuentes_vencidas',
      'nivel.alto',
      'nivel.bajo',
      'nivel.muy_alto',
      'cobertura.departamentos',
      'cobertura.escuelas',
      'cobertura.secciones',
      'fuentes.total',
      'fuentes.vencidas_conteo',
      'episodios.abiertos',
      'episodios.cerrados_desde_anterior',
    ])
  })

  it('nunca incluye provider ni estado de fuentesSalud en ids o etiquetas', () => {
    const metricas = derivarMetricasAutorizadas(
      crearCorte({
        fuentesSalud: [
          { provider: 'smn', estado: 'degradado', frescuraMinutos: 90, vencida: true },
          { provider: 'ign', estado: 'ok', frescuraMinutos: 5, vencida: false },
        ],
      }),
    )

    expect(metricas.find((metrica) => metrica.id === 'fuentes.total')?.valor).toBe(2)
    expect(metricas.find((metrica) => metrica.id === 'fuentes.vencidas_conteo')?.valor).toBe(1)
    const serializado = JSON.stringify(metricas)
    expect(serializado).not.toContain('smn')
    expect(serializado).not.toContain('ign')
    expect(serializado).not.toContain('degradado')
  })

  it('dos llamadas con el mismo input devuelven exactamente el mismo array', () => {
    const corte = crearCorte({
      cobertura: { escuelas: 50 },
      conteosPorNivelRiesgo: { alto: 2, muy_alto: 1 },
    })

    expect(derivarMetricasAutorizadas(corte)).toEqual(derivarMetricasAutorizadas(corte))
  })
})

describe('mapaMetricasPorId', () => {
  it('indexa cada métrica por su id', () => {
    const corte = crearCorte({
      kpis: {
        escuelasAfectacionConfirmadaVigente: 4,
        escuelasRiesgoAlto24h: 9,
        fuentesVencidas: 1,
      },
    })
    const mapa = mapaMetricasPorId(derivarMetricasAutorizadas(corte))

    expect(mapa.get('kpi.escuelas_riesgo_alto_24h')?.valor).toBe(9)
    expect(mapa.get('inexistente')).toBeUndefined()
  })
})
