import { describe, expect, it } from 'vitest'
import { crearAdapterPeligroNoDisponible } from './peligro'

const AS_OF = '2026-09-26T12:00:00.000Z'

describe('crearAdapterPeligroNoDisponible', () => {
  it('devuelve una fila sin_dato por horizonte, con ausencias explícitas', async () => {
    const adapter = crearAdapterPeligroNoDisponible()
    const filas = await adapter.obtenerNivelesCelda({
      geometryRef: 'geom-1',
      horizontes: [24, 72, 240],
      asOf: AS_OF,
    })

    expect(filas).toHaveLength(3)
    expect(filas.map((f) => f.horizonteHoras)).toEqual([24, 72, 240])
    for (const fila of filas) {
      expect(fila).toEqual({
        geometryRef: 'geom-1',
        horizonteHoras: fila.horizonteHoras,
        nivel: 'sin_dato',
        base: 'sin_dato',
        probabilidadP95: null,
        probabilidadP99: null,
        precipitacionMm: null,
        percentilReferencia: null,
        emitidoEn: AS_OF,
        validoHasta: AS_OF,
        versionRegla: 'peligro-no-disponible-v0',
      })
    }
  })

  it('devuelve fila de caudal sin_dato (no null) con ausencias explícitas', async () => {
    const adapter = crearAdapterPeligroNoDisponible()
    const fila = await adapter.obtenerNivelCaudal({ puntoId: 'rio-1', asOf: AS_OF })

    expect(fila).toEqual({
      puntoId: 'rio-1',
      percentilActual: null,
      nivel: 'sin_dato',
      emitidoEn: AS_OF,
      validoHasta: AS_OF,
    })
  })
})
