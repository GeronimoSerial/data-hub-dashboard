import { describe, expect, it } from 'vitest'
import {
  ESTADOS_ADJUNTO,
  ESTADOS_BORRADOR,
  MAX_FOTOS_POR_ENVIO,
  TRANSICIONES_ADJUNTO,
  TRANSICIONES_BORRADOR,
} from './reportes-offline-contratos'

describe('contratos de reportes offline', () => {
  it('limita a tres fotos por envío', () => {
    expect(MAX_FOTOS_POR_ENVIO).toBe(3)
  })

  it('deja enviado y descartado como estados terminales', () => {
    expect(TRANSICIONES_BORRADOR.enviado).toEqual([])
    expect(TRANSICIONES_BORRADOR.descartado).toEqual([])
  })

  it('solo reabre un envío pendiente por rechazo explícito', () => {
    expect(TRANSICIONES_BORRADOR.envio_pendiente).toEqual(['enviado', 'activo'])
    for (const estado of ESTADOS_BORRADOR) {
      if (estado === 'envio_pendiente') continue
      expect(TRANSICIONES_BORRADOR[estado]).not.toContain('activo')
    }
  })

  it('tiene una transición definida para cada estado de adjunto y solo estados conocidos', () => {
    const conocidos = new Set<string>(ESTADOS_ADJUNTO)
    for (const estado of ESTADOS_ADJUNTO) {
      expect(TRANSICIONES_ADJUNTO[estado]).toBeDefined()
      for (const destino of TRANSICIONES_ADJUNTO[estado]) {
        expect(conocidos.has(destino)).toBe(true)
      }
    }
  })

  it('no permite pasar de disponible a otro estado', () => {
    expect(TRANSICIONES_ADJUNTO.disponible).toEqual([])
  })
})
