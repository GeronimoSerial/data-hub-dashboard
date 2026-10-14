import { describe, expect, it } from 'vitest'
import type { LluviaObservadaAmbito } from './lluvia-observada'
import { construirMetricasAmbito, FUENTES_URL } from './metricas'
import type { AvisoSmnDia, CaudalDia, EnsambleDia } from './pronostico'
import type { RioDia } from './rios'
import { evaluarDia, type EntradaEvaluacion } from './reglas'

const lluvia24: LluviaObservadaAmbito = {
  ambito: 'provincia',
  promMm: 12.346,
  maxMm: 62.4,
  celdaMax: 'c1',
  cobertura: 1,
  granulosEsperados: 10,
  granulosRecibidos: 10,
}

const lluvia72: LluviaObservadaAmbito = { ...lluvia24, promMm: 40.1, maxMm: 110.9 }

const rio = (id: string, departamento: string | null, overrides: Partial<RioDia> = {}): RioDia => ({
  estacionId: id,
  rol: 'corrientes',
  nombre: `Estacion ${id}`,
  rio: 'parana',
  departamento,
  estadoMax: 'alerta',
  alturaMaxM: 7.25,
  tendenciaM24h: 0.4,
  margenEvacM: 1.2,
  margenAlertaM: -0.1,
  ultimaMedidaEn: '2026-10-12T12:00:00Z',
  ...overrides,
})

const caudal = (id: string, departamento: string | null): CaudalDia => ({
  puntoId: id,
  nombre: `Punto ${id}`,
  departamento,
  picoM3s: 1523.6,
  picoEn: '2026-10-13T00:00:00Z',
  corridaEn: '2026-10-12T06:00:00Z',
  percentil: 'p90',
})

const ensamble = (departamento: string, p95: number, p99: number): EnsambleDia => ({
  departamento,
  probP95Max: p95,
  probP99Max: p99,
  corridaEn: '2026-10-12T06:00:00Z',
})

const smn = (departamento: string, avisoId: string, nivel: AvisoSmnDia['nivel']): AvisoSmnDia => ({
  departamento,
  nivel,
  avisoId,
  evento: 'Tormentas',
  desde: '2026-10-13T00:00:00Z',
  hasta: '2026-10-13T12:00:00Z',
})

const entradaMuestra: EntradaEvaluacion = {
  tipoDia: 'hoy',
  lluvia24: [{ ...lluvia24, percentilMax: 'p95' }],
  lluvia72: [lluvia72],
  rios: [rio('ptl', 'Concordia'), rio('ita', 'Ituzaingo', { estadoMax: 'evacuacion', tendenciaM24h: null })],
  caudal: [caudal('caudal-uru', 'Concordia')],
  ensamble: [ensamble('Concordia', 0.61, 0.12)],
  smn: [smn('Concordia', 'aviso-42', 'naranja')],
  departamentos: ['Concordia', 'Ituzaingo'],
}

describe('construirMetricasAmbito', () => {
  it('emite métricas numéricas de lluvia, ríos, caudal, ensamble y SMN con unidad y fuente', () => {
    const metricas = construirMetricasAmbito({
      ambito: 'provincia',
      lluvia24,
      lluvia72,
      rios: [rio('ptl', 'Concordia')],
      caudal: [caudal('caudal-uru', 'Concordia')],
      ensamble: [ensamble('Concordia', 0.61, 0.12)],
      smn: [smn('Concordia', 'aviso-42', 'naranja')],
    })
    const porId = Object.fromEntries(metricas.map((m) => [m.id, m]))

    expect(porId['lluvia.obs_24h.max_mm']).toMatchObject({ valor: 62.4, unidad: 'mm', fuenteUrl: FUENTES_URL.imerg })
    expect(porId['lluvia.obs_24h.prom_mm']).toMatchObject({ valor: 12.35, unidad: 'mm' })
    expect(porId['lluvia.obs_72h.max_mm']).toMatchObject({ valor: 110.9, unidad: 'mm' })
    expect(porId['lluvia.obs_72h.prom_mm']).toMatchObject({ valor: 40.1, unidad: 'mm' })
    expect(porId['rio.ptl.altura_max_m']).toMatchObject({ valor: 7.25, unidad: 'm', fuenteUrl: FUENTES_URL.prefectura })
    expect(porId['rio.ptl.evacuacion_m']).toMatchObject({ valor: 8.45, unidad: 'm' })
    expect(porId['rio.ptl.alerta_m']).toMatchObject({ valor: 7.15, unidad: 'm' })
    expect(porId['rio.ptl.tendencia_m_24h']).toMatchObject({ valor: 0.4, unidad: 'm' })
    expect(porId['rio.ptl.estado_max']).toMatchObject({ valor: 1, unidad: 'nivel' })
    expect(porId['caudal.caudal-uru.pico_m3s']).toMatchObject({ valor: 1523.6, unidad: 'm3/s', fuenteUrl: FUENTES_URL.glofas })
    expect(porId['lluvia.ens.prob_p95']).toMatchObject({ valor: 61, unidad: '%', fuenteUrl: FUENTES_URL.ensamble })
    expect(porId['lluvia.ens.prob_p99']).toMatchObject({ valor: 12, unidad: '%' })
    expect(porId['smn.aviso-42.nivel']).toMatchObject({ valor: 2, unidad: 'nivel', fuenteUrl: FUENTES_URL.smn })
    for (const m of metricas) expect(Number.isFinite(m.valor)).toBe(true)
  })

  it('mapea estado de río a número: normal 0, alerta 1, evacuación 2', () => {
    const metricas = construirMetricasAmbito({
      ambito: 'provincia',
      rios: [
        rio('a', 'X', { estadoMax: 'normal' }),
        rio('b', 'X', { estadoMax: 'evacuacion' }),
      ],
    })
    const porId = Object.fromEntries(metricas.map((m) => [m.id, m.valor]))
    expect(porId['rio.a.estado_max']).toBe(0)
    expect(porId['rio.b.estado_max']).toBe(2)
  })

  it('filtra por departamento cuando el ámbito es un departamento', () => {
    const metricas = construirMetricasAmbito({
      ambito: 'departamento:Concordia',
      rios: [rio('ptl', 'Concordia'), rio('ita', 'Ituzaingo')],
      caudal: [caudal('c1', 'Concordia'), caudal('c2', 'Ituzaingo')],
      ensamble: [ensamble('Concordia', 0.1, 0.01), ensamble('Ituzaingo', 0.9, 0.5)],
      smn: [smn('Concordia', 'a1', 'amarillo'), smn('Ituzaingo', 'a2', 'rojo')],
    })
    const ids = metricas.map((m) => m.id)
    expect(ids).toContain('rio.ptl.altura_max_m')
    expect(ids.some((id) => id.startsWith('rio.ita.'))).toBe(false)
    expect(ids).toContain('caudal.c1.pico_m3s')
    expect(ids.some((id) => id.startsWith('caudal.c2.'))).toBe(false)
    expect(ids).toContain('smn.a1.nivel')
    expect(ids.some((id) => id.startsWith('smn.a2.'))).toBe(false)
    expect(metricas.find((m) => m.id === 'lluvia.ens.prob_p95')?.valor).toBe(10)
  })

  it('todas las refs de la traza de reglas existen entre las métricas del ámbito', () => {
    const resultados = evaluarDia(entradaMuestra)
    const metricas = construirMetricasAmbito({
      ambito: 'provincia',
      lluvia24,
      lluvia72,
      rios: entradaMuestra.rios,
      caudal: entradaMuestra.caudal,
      ensamble: entradaMuestra.ensamble,
      smn: entradaMuestra.smn,
    })
    const ids = new Set(metricas.map((m) => m.id))
    const refs = resultados.flatMap((r) => r.traza.map((t) => t.ref))
    expect(refs.length).toBeGreaterThan(0)
    for (const ref of refs) expect(ids.has(ref), `falta la métrica ${ref}`).toBe(true)
  })
})

describe('métrica de lluvia pronosticada ECMWF', () => {
  it('emite lluvia.pron_24h.max_mm con unidad mm y fuente ECMWF', () => {
    const metricas = construirMetricasAmbito({
      ambito: 'departamento:Concordia',
      lluviaPronosticada: [{ ambito: 'departamento:Concordia', maxMm: 85.04, celdaMax: 'c1', horas: 24 }],
    })
    expect(metricas).toContainEqual({
      id: 'lluvia.pron_24h.max_mm',
      valor: 85,
      unidad: 'mm',
      etiqueta: 'Lluvia pronosticada máxima 24 h (ECMWF)',
      fuenteUrl: FUENTES_URL.ecmwf,
    })
    expect(FUENTES_URL.ecmwf).toBe('https://open-meteo.com/en/docs/ecmwf-api')
  })
})
