import { describe, expect, it } from 'vitest'
import type { RutaGeoJson } from '@/lib/db/schema'
import type { GeometriaAccesoRespuesta } from '@/lib/infraestructura/territorio-mapa'
import type { ExposicionRutaRespuesta } from '@/lib/infraestructura/exposicion-ruta'
import { lineasAcceso } from './acceso'
import { construirCrucesAcceso } from '@/lib/mapas/accesos-capas'

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
  claseRuta: ExposicionRutaRespuesta['claseRuta'] = null,
): ExposicionRutaRespuesta {
  return {
    cueAnexo: '1801605-04',
    disponible: true,
    estado,
    claseRuta,
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
      crucesDetalle: null,
      crucesConRiesgo: false,
      riesgo: null,
    })
  })

  it('muestra la vía principal, el destino y la distancia informada', () => {
    expect(lineasAcceso(geometria({
      viaPrincipal: { nombre: 'Ruta Provincial 13', tipo: 'primary', pavimentada: true },
      destino: { nombre: 'Saladas' },
      distanciaKm: 14,
    }), null)?.via).toBe('Ruta Provincial 13 (pavimentada) → Saladas · 14 km')
  })

  it('calcula la distancia cuando no viene informada', () => {
    expect(lineasAcceso(geometria({
      viaPrincipal: { nombre: 'Ruta Provincial 13', tipo: 'primary', pavimentada: true },
      destino: { nombre: 'Saladas' },
    }), null)?.via).toBe('Ruta Provincial 13 (pavimentada) → Saladas · 1,1 km')
  })

  it.each([
    [
      { nombre: null, tipo: 'residential', pavimentada: true },
      { nombre: 'Corrientes' },
      3,
      'Calle urbana (pavimentada) → Corrientes · 3 km',
    ],
    [
      { nombre: null, tipo: 'unclassified', pavimentada: false },
      { nombre: 'Saladas' },
      6,
      'Camino rural (de ripio) → Saladas · 6 km',
    ],
    [
      { nombre: 'Camino vecinal', tipo: 'track', pavimentada: false },
      { nombre: 'Mercedes' },
      31,
      'Camino vecinal (de tierra) → Mercedes · 31 km',
    ],
  ] as const)('aplica el nombre y la superficie de la vía', (viaPrincipal, destino, distanciaKm, texto) => {
    expect(lineasAcceso(geometria({ viaPrincipal, destino, distanciaKm }), null)?.via).toBe(texto)
  })

  it('omite el destino cuando no está disponible', () => {
    expect(lineasAcceso(geometria({
      viaPrincipal: { nombre: 'Ruta Nacional 12', tipo: 'primary', pavimentada: true },
      distanciaKm: 9,
    }), null)?.via).toBe('Ruta Nacional 12 (pavimentada) · 9 km')
  })

  it('conserva el formato de acceso cuando no hay vía principal', () => {
    expect(lineasAcceso(geometria({
      viaPrincipal: null,
      destino: { nombre: 'Saladas' },
    }), null)?.via).toBe('Camino de acceso · 1,1 km')
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
    ['sin cruces', [], undefined, 'Sin cruces de agua', null, false],
    ['solo puentes', [{ lon: 0, lat: 0, clasificacion: 'puente' }], { puente: 1, vado: 0, sinEvidencia: 0 }, '1 cruce de agua en el camino', '1 con puente', false],
    ['solo vados', [{ lon: 0, lat: 0, clasificacion: 'vado' }], { puente: 0, vado: 1, sinEvidencia: 0 }, '1 cruce de agua en el camino', '1 vado', true],
    ['vado probable', [{ lon: 0, lat: 0, clasificacion: 'vado_probable' }], { puente: 0, vado: 1, sinEvidencia: 0 }, '1 cruce de agua en el camino', '1 vado', true],
    ['mixto sin resumen', [
      { lon: 0, lat: 0, clasificacion: 'vado' },
      { lon: 0, lat: 0, clasificacion: 'sin_evidencia' },
      { lon: 0, lat: 0, clasificacion: 'puente' },
    ], undefined, '3 cruces de agua en el camino', '1 con puente · 1 vado · 1 sin puente registrado', true],
  ] as const)('cuenta y desglosa todos los cruces: %s', (_caso, cruces, resumen, texto, detalle, conRiesgo) => {
    expect(lineasAcceso(geometria({ cruces: [...cruces], resumen }), null)).toMatchObject({
      cruces: texto,
      crucesDetalle: detalle,
      crucesConRiesgo: conRiesgo,
    })
  })

  it('iguala el total de la ficha con los marcadores para tres puentes y un vado', () => {
    const cruces = [
      { lon: 0.001, lat: 0.001, clasificacion: 'puente' as const },
      { lon: 0.002, lat: 0.002, clasificacion: 'puente' as const },
      { lon: 0.003, lat: 0.003, clasificacion: 'puente' as const },
      { lon: 0.004, lat: 0.004, clasificacion: 'vado' as const },
    ]
    const dato = geometria({ cruces, resumen: { puente: 3, vado: 1, sinEvidencia: 0 } })

    expect(Number(lineasAcceso(dato, null)?.cruces.match(/^\d+/)?.[0]))
      .toBe(construirCrucesAcceso(dato).features.length)
    expect(lineasAcceso(dato, null)?.cruces).toBe('4 cruces de agua en el camino')
  })

  it.each([
    ['puentes', [{ lon: 0, lat: 0, clasificacion: 'puente' as const }], { puente: 1, vado: 0, sinEvidencia: 0 }],
    ['vados', [{ lon: 0, lat: 0, clasificacion: 'vado' as const }], { puente: 0, vado: 1, sinEvidencia: 0 }],
    ['mixto', [
      { lon: 0, lat: 0, clasificacion: 'puente' as const },
      { lon: 0, lat: 0, clasificacion: 'sin_evidencia' as const },
    ], { puente: 1, vado: 0, sinEvidencia: 1 }],
    ['vacío', [], { puente: 0, vado: 0, sinEvidencia: 0 }],
  ] as const)('mantiene el total igual a los marcadores en combinación %s', (_caso, cruces, resumen) => {
    for (const incluirResumen of [true, false]) {
      const dato = geometria({ cruces: [...cruces], ...(incluirResumen ? { resumen } : {}) })
      const total = lineasAcceso(dato, null)?.cruces === 'Sin cruces de agua'
        ? 0
        : Number(lineasAcceso(dato, null)?.cruces.match(/^\d+/)?.[0])
      expect(total).toBe(construirCrucesAcceso(dato).features.length)
    }
  })

  it('sin exposición cargada no muestra riesgo', () => {
    expect(lineasAcceso(geometria(), null)?.riesgo).toBeNull()
  })

  it.each([
    ['alto', 'Alto'],
    ['medio', 'Medio'],
    ['bajo', 'Bajo'],
    ['sin_riesgo', 'Sin riesgo'],
    ['sin_dato', 'Sin dato'],
    ['sin_ruta', 'Sin ruta'],
  ] as const)('muestra la etiqueta de la clase %s como "%s"', (clase, etiqueta) => {
    expect(lineasAcceso(geometria(), exposicion('con_profundidad', 1, clase))?.riesgo).toBe(etiqueta)
  })

  it('clase null se muestra como Sin dato', () => {
    expect(lineasAcceso(geometria(), exposicion('con_profundidad', 1, null))?.riesgo).toBe('Sin dato')
  })

  it('una fila antigua sin_profundidad sin clase no produce Bajo ni Sin riesgo', () => {
    const riesgo = lineasAcceso(geometria(), exposicion('sin_profundidad', 0, null))?.riesgo
    expect(riesgo).toBe('Sin dato')
    expect(riesgo).not.toBe('Bajo')
    expect(riesgo).not.toBe('Sin riesgo')
  })
})
