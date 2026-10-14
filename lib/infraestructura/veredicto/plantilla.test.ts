import { describe, expect, it } from 'vitest'
import { textoPlantilla } from './plantilla'

const base = {
  fecha: '2026-10-12',
  tipoDia: 'observado' as const,
  ambito: 'provincia',
  metricas: [
    { id: 'lluvia.obs_24h.max_mm', valor: 62.4, unidad: 'mm', etiqueta: 'x', fuenteUrl: 'https://f' },
    { id: 'rio.ptl.altura_max_m', valor: 7.25, unidad: 'm', etiqueta: 'Altura máxima Paso de los Libres', fuenteUrl: 'https://f' },
    { id: 'rio.ptl.alerta_m', valor: 7.1, unidad: 'm', etiqueta: 'Nivel de alerta Paso de los Libres', fuenteUrl: 'https://f' },
  ],
}

describe('textoPlantilla', () => {
  it('arma el texto determinista con la señal más fuerte, valor y unidad', () => {
    const texto = textoPlantilla({
      ...base,
      nivel: 'alerta',
      traza: [
        { regla: 'lluvia.obs_24h', ref: 'lluvia.obs_24h.max_mm', valor: 62.4, umbral: 'p95', nivel: 'vigilancia' },
        { regla: 'rio.estado', ref: 'rio.ptl.estado_max', valor: 7.25, umbral: 'alerta', nivel: 'alerta' },
      ],
      fuentesAusentes: ['smn', 'glofas'],
    })
    expect(texto).toBe(
      'Prefectura Paso de los Libres en alerta (altura máxima 7,25 m; alerta 7,1 m). Sin datos de: avisos del SMN, caudal pronosticado (GloFAS).',
    )
  })

  it('omite la señal y las fuentes ausentes cuando no hay', () => {
    const texto = textoPlantilla({ ...base, nivel: 'sin_senal', traza: [], fuentesAusentes: [] })
    expect(texto).toBe('Sin señales en los datos disponibles.')
  })

  it('usa los rótulos de nivel y tipo de día legibles', () => {
    const texto = textoPlantilla({
      ...base,
      tipoDia: 'pronostico',
      nivel: 'severo',
      traza: [{ regla: 'caudal.percentil', ref: 'caudal.c1.pico_m3s', valor: 1523.6, umbral: 'p99', nivel: 'severo' }],
      metricas: [{ id: 'caudal.c1.pico_m3s', valor: 1523.6, unidad: 'm3/s', etiqueta: 'x', fuenteUrl: 'https://f' }],
      fuentesAusentes: [],
    })
    expect(texto).toBe('Caudal pico: 1.523,6 m3/s.')
  })

  it('nivel sin_dato se rotula Sin dato', () => {
    expect(textoPlantilla({ ...base, nivel: 'sin_dato', traza: [], fuentesAusentes: ['imerg'] })).toBe(
      'Sin datos suficientes para evaluar el día. Sin datos de: lluvia satelital (IMERG).',
    )
  })
})
