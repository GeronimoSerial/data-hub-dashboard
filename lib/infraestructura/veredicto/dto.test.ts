import { describe, expect, it } from 'vitest'
import { aDtoVeredicto, sinFuentesAusentes } from './dto'
import type { FilaVeredicto } from './repositorio'

function fila(overrides: Partial<FilaVeredicto> = {}): FilaVeredicto {
  return {
    id: 'ver-1',
    fecha: '2026-10-12',
    ambito: 'provincia',
    tipoDia: 'observado',
    nivel: 'alerta',
    trazaReglas: {
      reglas: [{ id: 'lluvia-24h', resultado: 'alerta' }],
      version: 'reglas-v1',
    },
    versionReglas: 'reglas-v1',
    metricas: {
      metricas: [
        {
          id: 'lluvia_max_24h',
          valor: 42.5,
          unidad: 'mm',
          etiqueta: 'Lluvia máxima 24 h',
          fuenteUrl: 'https://example.test/fuente',
          interno: 'NO_DEBE_SALIR',
        },
      ],
    },
    inputsHash: 'hash-secreto-123',
    cobertura: { imerg24: true, fuentesAusentes: ['rios'] },
    textoFinal: 'Texto final del veredicto.',
    salidaIa: { frases: [{ texto: 'Frase de la IA.', refs: ['lluvia_max_24h'] }] },
    fuente: 'ia',
    motivoFallback: null,
    modelo: 'modelo-secreto',
    versionPrompt: 'veredicto-v1',
    tokensEntrada: 1200,
    tokensSalida: 300,
    costoUsd: 0.0042,
    latenciaMs: 900,
    enCalibracion: true,
    generadoEn: '2026-10-13T09:00:00.000Z',
    jobRunId: 'job-secreto',
    reemplazadoPor: null,
    cerrado: false,
    ...overrides,
  } as FilaVeredicto
}

describe('aDtoVeredicto', () => {
  it('expone la forma pública con la versión que le pasa el llamador', () => {
    const dto = aDtoVeredicto(fila(), 3)
    expect(dto).toEqual({
      id: 'ver-1',
      fecha: '2026-10-12',
      ambito: 'provincia',
      tipoDia: 'observado',
      nivel: 'alerta',
      texto: 'Texto final del veredicto.',
      fuente: 'ia',
      enCalibracion: true,
      cerrado: false,
      generadoEn: '2026-10-13T09:00:00.000Z',
      version: 3,
      frases: [{ texto: 'Frase de la IA.', refs: ['lluvia_max_24h'] }],
      traza: [{ id: 'lluvia-24h', resultado: 'alerta' }],
      metricas: [
        {
          id: 'lluvia_max_24h',
          valor: 42.5,
          unidad: 'mm',
          etiqueta: 'Lluvia máxima 24 h',
          fuenteUrl: 'https://example.test/fuente',
        },
      ],
      fuentesAusentes: ['rios'],
      aguasArriba: [],
      imergHasta: null,
    })
  })

  it('no expone tokens, costo, modelo, hash, job ni motivo de fallback', () => {
    const serializado = JSON.stringify(aDtoVeredicto(fila({ fuente: 'plantilla', motivoFallback: 'sin credenciales' }), 1))
    for (const interno of [
      'tokensEntrada',
      'tokensSalida',
      'costoUsd',
      'latenciaMs',
      'modelo',
      'versionPrompt',
      'inputsHash',
      'hash-secreto-123',
      'jobRunId',
      'job-secreto',
      'motivoFallback',
      'modelo-secreto',
      'NO_DEBE_SALIR',
    ]) {
      expect(serializado).not.toContain(interno)
    }
  })

  it('con fuente plantilla no devuelve frases', () => {
    const dto = aDtoVeredicto(fila({ fuente: 'plantilla', salidaIa: null }), 1)
    expect(dto.frases).toBeNull()
    expect(dto.fuente).toBe('plantilla')
  })

  it('tolera jsonb sin las claves esperadas', () => {
    const dto = aDtoVeredicto(fila({ trazaReglas: {}, metricas: {}, cobertura: {}, textoFinal: null }), 1)
    expect(dto.traza).toEqual([])
    expect(dto.aguasArriba).toEqual([])
  })

  it('expone imergHasta desde la cobertura cuando el día es hoy', () => {
    const dto = aDtoVeredicto(
      fila({ tipoDia: 'hoy', cobertura: { imerg24: 1, imergHasta: '2026-10-13T21:00:00.000Z' } }),
      1,
    )
    expect(dto.imergHasta).toBe('2026-10-13T21:00:00.000Z')
  })

  it('imergHasta es null si la cobertura no lo trae', () => {
    expect(aDtoVeredicto(fila({ cobertura: { imerg24: 1 } }), 1).imergHasta).toBeNull()
  })

  it('expone las aguas arriba de la traza persistida', () => {
    const aguasArriba = [
      { estacionId: 'pna-iguazu', nombre: 'IGUAZU', rio: 'parana', estadoMax: 'evacuacion', alturaMaxM: 5, umbralM: 4.8 },
    ]
    const dto = aDtoVeredicto(fila({ trazaReglas: { reglas: [], aguasArriba }, metricas: {}, cobertura: {}, textoFinal: null }), 1)
    expect(dto.aguasArriba).toEqual(aguasArriba)
    expect(dto.metricas).toEqual([])
    expect(dto.fuentesAusentes).toEqual([])
    expect(dto.texto).toBeNull()
  })
})

describe('sinFuentesAusentes', () => {
  it('quita la oración de fuentes ausentes de textos guardados con la plantilla anterior', () => {
    expect(sinFuentesAusentes('Sin datos suficientes para evaluar el día. Sin datos de: lluvia satelital (IMERG), alturas de Prefectura.'))
      .toBe('Sin datos suficientes para evaluar el día.')
    expect(sinFuentesAusentes('Prefectura Ituzaingó (río Paraná) — Altura del río: 4,03 m · Evacuación.')).toBe('Prefectura Ituzaingó (río Paraná) — Altura del río: 4,03 m · Evacuación.')
    expect(sinFuentesAusentes(null)).toBeNull()
  })
})
