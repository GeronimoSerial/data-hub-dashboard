import { describe, expect, it } from 'vitest'
import type { RutaGeoJson } from '@/lib/db/schema'
import type { GeometriaAccesoRespuesta } from '@/lib/infraestructura/territorio-mapa'
import type { ExposicionRutaRespuesta } from '@/lib/infraestructura/exposicion-ruta'
import { lineasAcceso } from './acceso'

const rutaConocida: RutaGeoJson = {
  type: 'LineString',
  coordinates: [[0, 0], [0.01, 0]],
}

function geometria(
  extras: Partial<GeometriaAccesoRespuesta> = {},
): GeometriaAccesoRespuesta {
  return {
    cueAnexo: '1801605-04',
    disponible: true,
    ruta: rutaConocida,
    cruces: [],
    ...extras,
  }
}

function exposicion(
  estado: ExposicionRutaRespuesta['estado'],
  profundidadMaxM: number | null,
): ExposicionRutaRespuesta {
  return {
    cueAnexo: '1801605-04',
    disponible: true,
    estado,
    versionJob: null,
    resumen: {
      celdasTotal: 0,
      celdasConDato: 0,
      celdasConProfundidad: 0,
      profundidadMaxM,
      cobertura: 0,
    },
    celdasAfectadas: [],
    resolucionArcsec: null,
    periodoRetornoAnios: null,
    escenario: null,
    fuente: null,
    licencia: null,
    fechaCorrida: null,
    aviso: '',
  }
}

describe('lineasAcceso', () => {
  it('formatea la vía disponible con la longitud calculada', () => {
    expect(lineasAcceso(geometria(), null)).toEqual({
      via: 'Camino de acceso · 1,1 km',
      cruces: 'Sin cruces de agua',
      riesgo: null,
    })
  })

  it.each([
    ['geometría nula', null],
    ['geometría no disponible', geometria({ disponible: false })],
    ['ruta ausente', geometria({ ruta: undefined })],
  ])('devuelve null cuando no hay acceso calculado: %s', (_caso, valor) => {
    expect(lineasAcceso(valor, null)).toBeNull()
  })

  it('devuelve null cuando la ruta no tiene suficientes coordenadas', () => {
    const rutaIncompleta: RutaGeoJson = { type: 'LineString', coordinates: [[0, 0]] }
    expect(lineasAcceso(geometria({ ruta: rutaIncompleta }), null)?.via).toBeNull()
  })

  it.each([
    [0, [], 'Sin cruces de agua'],
    [1, [{ lon: 0, lat: 0, clasificacion: 'vado' }], '1 cruce de agua en el camino'],
    [2, [
      { lon: 0, lat: 0, clasificacion: 'vado' },
      { lon: 0, lat: 0, clasificacion: 'sin_evidencia' },
      { lon: 0, lat: 0, clasificacion: 'puente' },
    ], '2 cruces de agua en el camino'],
  ] as const)('cuenta cruces clasificados como puntos débiles (%i)', (_cantidad, cruces, texto) => {
    expect(lineasAcceso(geometria({ cruces: [...cruces] }), null)?.cruces).toBe(texto)
  })

  it('usa el resumen de vados y cruces sin evidencia, aunque haya puentes', () => {
    expect(lineasAcceso(geometria({ resumen: { puente: 4, vado: 1, sinEvidencia: 1 } }), null)?.cruces)
      .toBe('2 cruces de agua en el camino')
  })

  it.each([
    [null, null, null],
    ['sin_ruta', 1, null],
    ['sin_dato', 1, null],
    ['sin_profundidad', null, 'Bajo'],
    ['con_profundidad', 0, null],
    ['con_profundidad', 0.49, 'Medio'],
    ['con_profundidad', 0.5, 'Alto'],
  ] as const)('clasifica el riesgo para estado %s y profundidad %s', (estado, profundidad, riesgo) => {
    const dato = estado === null ? null : exposicion(estado, profundidad)
    expect(lineasAcceso(geometria(), dato)?.riesgo).toBe(riesgo)
  })
})
