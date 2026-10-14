import { describe, expect, it } from 'vitest'
import { construirMensajeUsuario, PROMPT_SISTEMA_VEREDICTO, VERSION_PROMPT_VEREDICTO } from './prompt'

describe('prompt del veredicto', () => {
  it('declara la versión del prompt', () => {
    expect(VERSION_PROMPT_VEREDICTO).toBe('veredicto-v1')
  })

  it('el prompt de sistema fija las reglas clave', () => {
    const p = PROMPT_SISTEMA_VEREDICTO
    expect(p).toMatch(/2 o 3 frases/)
    expect(p).toMatch(/refs/)
    expect(p).toMatch(/nunca.*(decid|cambi)/i)
    expect(p).toMatch(/observad/i)
    expect(p).toMatch(/pron[oó]stico/i)
    expect(p).toMatch(/escuela/i)
    expect(p).toMatch(/órdenes/i)
    expect(PROMPT_SISTEMA_VEREDICTO).toMatch(/"veredictos"/)
    expect(p).toMatch(/probabilidad/i)
    expect(p).toMatch(/JSON/)
  })

  it('construirMensajeUsuario serializa cada ámbito-día con la forma de la sección 8.1', () => {
    const json = construirMensajeUsuario([
      {
        fecha: '2026-10-12',
        tipoDia: 'observado',
        ambito: 'provincia',
        nivel: 'alerta',
        traza: [{ regla: 'rio.estado', ref: 'rio.ptl.estado_max', valor: 7.25, umbral: 'alerta', nivel: 'alerta' }],
        metricas: [{ id: 'rio.ptl.estado_max', valor: 1, unidad: 'nivel', etiqueta: 'x', fuenteUrl: 'https://f' }],
        fuentesAusentes: ['smn'],
      },
    ])
    const data = JSON.parse(json)
    expect(data).toEqual([
      {
        fecha: '2026-10-12',
        tipo_dia: 'observado',
        ambito: 'provincia',
        nivel: 'alerta',
        traza: [{ regla: 'rio.estado', ref: 'rio.ptl.estado_max', nivel: 'alerta' }],
        metricas: [{ ref: 'rio.ptl.estado_max', valor: 1, unidad: 'nivel', fuente_url: 'https://f' }],
        fuentes_ausentes: ['smn'],
      },
    ])
  })
})
