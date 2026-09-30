import { describe, expect, it } from 'vitest'
import type { FilaAislamientoOsm } from '@/lib/infraestructura/riesgo/motor/adaptadores/aislamiento'
import type { FilaSusceptibilidadEstatica } from '@/lib/infraestructura/riesgo/motor/adaptadores/susceptibilidad'
import {
  construirRespuestaGeometria,
  construirTerritorioMapa,
  type FilaGeometriaAcceso,
} from './territorio-mapa'

function filaAislamiento(
  over: Partial<FilaAislamientoOsm> & { cueAnexo: string; versionJob: string },
): FilaAislamientoOsm {
  return {
    distanciaViaPavimentadaM: null,
    distanciaCabeceraDepartamentalM: null,
    tramosSinPavimentarCount: null,
    crucesAguaCount: null,
    crucesAguaConPuenteCount: null,
    crucesAguaConVadoCount: null,
    tieneAlternativaSinCruce: null,
    indiceAislamiento: null,
    motivoSinDatos: null,
    snapDistanciaM: null,
    fechaExtractoOsm: '2026-01-01',
    licencia: 'ODbL-1.0',
    importadoEn: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function filaSusceptibilidad(
  over: Partial<FilaSusceptibilidadEstatica> & { cueAnexo: string; versionJob: string },
): FilaSusceptibilidadEstatica {
  return {
    peligroInundacionFluvial: null,
    peligroInundacionPluvial: null,
    peligroViento: null,
    peligroCalor: null,
    periodoRetornoAnios: 100,
    fuente: 'physrisk',
    fechaCorrida: '2026-01-01',
    licencia: 'CC-BY-4.0',
    importadoEn: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function filaGeometria(
  over: Partial<FilaGeometriaAcceso> & { cueAnexo: string; versionJob: string },
): FilaGeometriaAcceso {
  return {
    ruta: null,
    cruces: [],
    motivoSinGeometria: null,
    fechaExtractoOsm: '2026-01-01',
    licencia: 'ODbL-1.0',
    importadoEn: '2026-01-01T00:00:00Z',
    ...over,
  }
}

describe('construirTerritorioMapa', () => {
  it('se queda con la última versión por cueAnexo (importadoEn y, en empate, versionJob)', () => {
    const territorio = construirTerritorioMapa(
      [
        filaAislamiento({
          cueAnexo: 'A',
          versionJob: '1',
          importadoEn: '2026-01-01T00:00:00Z',
          indiceAislamiento: 3,
        }),
        filaAislamiento({
          cueAnexo: 'A',
          versionJob: '2',
          importadoEn: '2026-02-01T00:00:00Z',
          indiceAislamiento: 1,
        }),
        // Mismo importadoEn, versionJob '10' debe ganarle a '9' (numérico).
        filaAislamiento({
          cueAnexo: 'B',
          versionJob: '9',
          importadoEn: '2026-02-01T00:00:00Z',
          indiceAislamiento: 0,
        }),
        filaAislamiento({
          cueAnexo: 'B',
          versionJob: '10',
          importadoEn: '2026-02-01T00:00:00Z',
          indiceAislamiento: 2,
        }),
      ],
      [],
    )

    expect(territorio.aislamiento?.escuelas.A.nivel).toBe(1)
    expect(territorio.aislamiento?.escuelas.B.nivel).toBe(2)
  })

  it('no incluye en `escuelas` una escuela sin fila y marca índice nulo como sin_datos_red', () => {
    const territorio = construirTerritorioMapa(
      [
        filaAislamiento({ cueAnexo: 'CON_NIVEL', versionJob: '1', indiceAislamiento: 3 }),
        filaAislamiento({ cueAnexo: 'SIN_CALCULO', versionJob: '1', indiceAislamiento: null }),
      ],
      [],
    )

    expect(Object.keys(territorio.aislamiento?.escuelas ?? {})).toEqual([
      'CON_NIVEL',
      'SIN_CALCULO',
    ])
    expect(territorio.aislamiento?.escuelas.CON_NIVEL.nivel).toBe(3)
    expect(territorio.aislamiento?.escuelas.SIN_CALCULO.nivel).toBe('sin_datos_red')
    expect(territorio.aislamiento?.escuelas.AUSENTE).toBeUndefined()
  })

  it('toma los metadatos de encabezado del valor más frecuente (empate => mayor)', () => {
    const territorio = construirTerritorioMapa(
      [
        // licencia 'ODbL-1.0' x2 (gana por frecuencia); fechas empatadas => mayor.
        filaAislamiento({
          cueAnexo: 'A',
          versionJob: '9',
          licencia: 'ODbL-1.0',
          fechaExtractoOsm: '2026-01-01',
        }),
        filaAislamiento({
          cueAnexo: 'B',
          versionJob: '10',
          licencia: 'ODbL-1.0',
          fechaExtractoOsm: '2026-03-01',
        }),
        filaAislamiento({
          cueAnexo: 'C',
          versionJob: '3',
          licencia: 'otra',
          fechaExtractoOsm: '2026-02-01',
        }),
      ],
      [
        filaSusceptibilidad({
          cueAnexo: 'A',
          versionJob: '1',
          periodoRetornoAnios: 50,
          fechaCorrida: '2026-01-01',
        }),
        filaSusceptibilidad({
          cueAnexo: 'B',
          versionJob: '1',
          periodoRetornoAnios: 500,
          fechaCorrida: '2026-04-01',
        }),
      ],
    )

    expect(territorio.aislamiento?.licencia).toBe('ODbL-1.0')
    expect(territorio.aislamiento?.fechaExtractoOsm).toBe('2026-03-01')
    // versionJob empatado (9, 10, 3): gana el mayor numérico, NO el lexicográfico.
    expect(territorio.aislamiento?.versionJob).toBe('10')

    expect(territorio.susceptibilidad?.periodoRetornoAnios).toBe(500)
    expect(territorio.susceptibilidad?.fechaCorrida).toBe('2026-04-01')
    expect(territorio.susceptibilidad?.licencia).toBe('CC-BY-4.0')
  })

  it('con tablas vacías ambos bloques quedan en null', () => {
    const territorio = construirTerritorioMapa([], [])
    expect(territorio).toEqual({ aislamiento: null, susceptibilidad: null })
  })

  it('una fila con fuente distinta de physrisk se incluye con valor null (no 0)', () => {
    const territorio = construirTerritorioMapa(
      [],
      [
        filaSusceptibilidad({
          cueAnexo: 'NO_DATA',
          versionJob: '1',
          fuente: 'no_disponible',
          peligroInundacionFluvial: 1.5,
        }),
        filaSusceptibilidad({
          cueAnexo: 'CON_DATA',
          versionJob: '1',
          fuente: 'physrisk',
          peligroInundacionFluvial: 0.8,
        }),
      ],
    )

    expect(territorio.susceptibilidad?.escuelas.NO_DATA.inundacionFluvialM).toBeNull()
    expect(territorio.susceptibilidad?.escuelas.CON_DATA.inundacionFluvialM).toBe(0.8)
  })

  it('expone los metadatos estáticos correctos', () => {
    const territorio = construirTerritorioMapa(
      [filaAislamiento({ cueAnexo: 'A', versionJob: '1' })],
      [filaSusceptibilidad({ cueAnexo: 'A', versionJob: '1' })],
    )

    expect(territorio.aislamiento?.fuente).toBe('OpenStreetMap')
    expect(territorio.aislamiento?.atribucion).toBe('© OpenStreetMap contributors')
    expect(territorio.susceptibilidad).toMatchObject({
      fuente: 'physrisk',
      indicador: 'inundacion_fluvial',
      escenario: 'historico',
      unidad: 'm',
    })
  })
})

describe('construirRespuestaGeometria', () => {
  it('sin fila => disponible false con motivo sin_geometria_importada', () => {
    const respuesta = construirRespuestaGeometria('CUE-1', null)
    expect(respuesta).toEqual({
      cueAnexo: 'CUE-1',
      disponible: false,
      motivo: 'sin_geometria_importada',
    })
  })

  it('fila sin ruta => disponible false con motivoSinGeometria y metadatos de extracto', () => {
    const respuesta = construirRespuestaGeometria(
      'CUE-1',
      filaGeometria({
        cueAnexo: 'CUE-1',
        versionJob: '2',
        ruta: null,
        motivoSinGeometria: 'sin_conexion_red',
      }),
    )
    expect(respuesta).toEqual({
      cueAnexo: 'CUE-1',
      disponible: false,
      motivo: 'sin_conexion_red',
      fechaExtractoOsm: '2026-01-01',
      licencia: 'ODbL-1.0',
      atribucion: '© OpenStreetMap contributors',
    })
  })

  it('fila sin ruta y sin motivo => cae al motivo genérico sin_geometria', () => {
    const respuesta = construirRespuestaGeometria(
      'CUE-1',
      filaGeometria({ cueAnexo: 'CUE-1', versionJob: '1', ruta: null, motivoSinGeometria: null }),
    )
    expect(respuesta.disponible).toBe(false)
    expect(respuesta.motivo).toBe('sin_geometria')
  })

  it('fila con ruta => disponible true, ruta/cruces tal cual y resumen contado', () => {
    const ruta = {
      type: 'LineString' as const,
      coordinates: [
        [-60.5, -31.7],
        [-60.6, -31.8],
      ] as Array<[number, number]>,
    }
    const cruces = [
      { lon: -60.51, lat: -31.71, clasificacion: 'puente' as const },
      { lon: -60.52, lat: -31.72, clasificacion: 'puente' as const },
      { lon: -60.53, lat: -31.73, clasificacion: 'vado' as const },
      { lon: -60.54, lat: -31.74, clasificacion: 'sin_evidencia' as const },
    ]
    const respuesta = construirRespuestaGeometria(
      'CUE-1',
      filaGeometria({ cueAnexo: 'CUE-1', versionJob: '3', ruta, cruces }),
    )

    expect(respuesta).toEqual({
      cueAnexo: 'CUE-1',
      disponible: true,
      versionJob: '3',
      fechaExtractoOsm: '2026-01-01',
      licencia: 'ODbL-1.0',
      atribucion: '© OpenStreetMap contributors',
      ruta,
      cruces,
      resumen: { puente: 2, vado: 1, sinEvidencia: 1 },
    })
  })
})
