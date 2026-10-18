import { describe, expect, it } from 'vitest'
import { construirMensajeUsuario, PROMPT_SISTEMA_VEREDICTO, VERSION_PROMPT_VEREDICTO } from './prompt'
import type { ItemMensajeVeredicto } from './prompt'

const item = (ambito: string, nivel: ItemMensajeVeredicto['nivel'], metricas: ItemMensajeVeredicto['metricas'] = []): ItemMensajeVeredicto => ({
  fecha: '2026-10-13',
  tipoDia: 'hoy',
  ambito: ambito as ItemMensajeVeredicto['ambito'],
  nivel,
  traza: [{ regla: 'rio.estado', ref: 'rio.ptl.estado_max', valor: 1, umbral: 'alerta', nivel }],
  metricas,
  fuentesAusentes: [],
})

describe('veredicto prompt', () => {
  it('bumps the prompt version for the new structure', () => {
    expect(VERSION_PROMPT_VEREDICTO).toBe('veredicto-v7')
  })

  it('asks for a headline plus one descriptive line per department, without recommendations', () => {
    const p = PROMPT_SISTEMA_VEREDICTO
    expect(p).toMatch(/"dias"/)
    expect(p).toMatch(/"titular"/)
    expect(p).toMatch(/"departamentos"/)
    expect(p).toMatch(/140 caracteres/)
    expect(p).toMatch(/220 caracteres/)
    expect(p).toMatch(/mismo orden/i)
    expect(p).toMatch(/recomendaciones/i)
    expect(p).toMatch(/escuelas/i)
    expect(p).toMatch(/nunca.*(decid|cambi)/i)
    expect(p).toMatch(/JSON/)
  })

  it('groups items per day and lists departments from most to least severe', () => {
    const json = construirMensajeUsuario([
      item('departamento:GOYA', 'vigilancia'),
      item('provincia', 'severo', [{ id: 'alumnos.sin_clases', valor: 80, unidad: 'alumnos', etiqueta: 'Alumnos sin clases', fuenteUrl: 'x' }]),
      item('departamento:ESQUINA', 'severo'),
    ])
    const [dia] = JSON.parse(json)

    expect(dia.fecha).toBe('2026-10-13')
    expect(dia.provincia.nivel).toBe('severo')
    expect(dia.provincia.datos).toEqual([{ ref: 'alumnos.sin_clases', que: 'Alumnos sin clases', valor: 80, unidad: 'alumnos' }])
    expect(dia.departamentos.map((d: { ambito: string }) => d.ambito)).toEqual(['departamento:ESQUINA', 'departamento:GOYA'])
    expect(dia.departamentos[0].nombre).toBe('Esquina')
    expect(json).not.toMatch(/rio\.estado/)
  })
})
