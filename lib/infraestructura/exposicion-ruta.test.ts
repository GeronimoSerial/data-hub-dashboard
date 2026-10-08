import { describe, expect, it } from 'vitest'
import { AVISO_EXPOSICION_RUTA, construirRespuestaExposicion, ultimaExposicionDeCue } from './exposicion-ruta'
import type { FilaExposicionRuta } from './exposicion-ruta'

function fila(overrides: Partial<FilaExposicionRuta> = {}): FilaExposicionRuta {
  return {
    cueAnexo: 'CUE-1', versionJob: '1', estado: 'con_profundidad', motivoSinDato: null,
    claseRuta: null, muestrasTotal: null, muestrasExpuestas: null, muestrasSinDato: null,
    profundidadMaxRp10M: null, profundidadMaxRp100M: null, profundidadMaxRp500M: null,
    celdasTotal: 3, celdasConDato: 2, celdasConProfundidad: 1, profundidadMaxM: 0.4,
    cobertura: 2 / 3, periodoRetornoAnios: 100, resolucionArcsec: 30,
    escenario: 'historico', fuente: 'WRI Aqueduct v2', celdas: [
      { lon: -60, lat: -31, profundidadM: 0.4 },
      { lon: -60.1, lat: -31.1, profundidadM: 0 },
      { lon: -60.2, lat: -31.2, profundidadM: null },
    ], fechaCorrida: '2026-01-01', licencia: 'CC-BY-4.0', importadoEn: '2026-01-02',
    ...overrides,
  }
}

describe('construirRespuestaExposicion', () => {
  it('usa avisos y motivos con tildes correctas', () => {
    expect(AVISO_EXPOSICION_RUTA).toBe(
      'Indicador histórico/estático por celda de ~1 km; no es pronóstico ni estado del camino ni el trazado de un río.',
    )
    expect(construirRespuestaExposicion('CUE-1', null).motivoSinDato).toBe(
      'Sin dato de exposición para esta escuela.',
    )
    expect(construirRespuestaExposicion('CUE-1', fila({ estado: 'sin_ruta' })).motivoSinDato).toBe(
      'Sin ruta de acceso calculada; no hay dato de exposición a lo largo de la ruta.',
    )
  })
  it('filtra las celdas afectadas por profundidad positiva', () => {
    const respuesta = construirRespuestaExposicion('CUE-1', fila())
    expect(respuesta.disponible).toBe(true)
    expect(respuesta.celdasAfectadas).toEqual([{ lon: -60, lat: -31, profundidadM: 0.4 }])
  })

  it('con profundidad cero conserva disponible y no expone celdas afectadas', () => {
    const respuesta = construirRespuestaExposicion('CUE-1', fila({
      estado: 'sin_profundidad', celdasConProfundidad: 0, profundidadMaxM: 0,
      celdas: [{ lon: -60, lat: -31, profundidadM: 0 }],
    }))
    expect(respuesta.disponible).toBe(true)
    expect(respuesta.resumen.profundidadMaxM).toBe(0)
    expect(respuesta.celdasAfectadas).toEqual([])
  })

  it('sin_ruta y fila ausente son falta de dato', () => {
    expect(construirRespuestaExposicion('CUE-1', fila({ estado: 'sin_ruta' })).disponible).toBe(false)
    expect(construirRespuestaExposicion('CUE-1', null)).toMatchObject({
      disponible: false, motivoSinDato: 'Sin dato de exposición para esta escuela.',
    })
  })

  it('elige la version numerica mas nueva', () => {
    expect(ultimaExposicionDeCue([fila({ versionJob: '9' }), fila({ versionJob: '10' })])?.versionJob).toBe('10')
  })

  it('no convierte profundidad NaN o null en cero', () => {
    const respuesta = construirRespuestaExposicion('CUE-1', fila({
      profundidadMaxM: Number.NaN,
      celdas: [
        { lon: 1, lat: 2, profundidadM: Number.NaN },
        { lon: 3, lat: 4, profundidadM: null },
      ],
    }))
    expect(respuesta.resumen.profundidadMaxM).toBeNull()
    expect(respuesta.celdasAfectadas).toEqual([])
  })
})
