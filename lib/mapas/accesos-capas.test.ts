import { describe, expect, it } from 'vitest'
import type { EscuelaMapa } from '@/lib/infraestructura/parte-mapa'
import type {
  NivelAislamientoMapa,
  TerritorioMapa,
} from '@/lib/infraestructura/territorio-mapa'
import {
  claseInundacion,
  construirCrucesAcceso,
  construirPuntosAislamiento,
  construirPuntosInundacion,
  construirRutaAcceso,
  DESCRIPCIONES_AISLAMIENTO,
  DESCRIPCIONES_CRUCE,
  ETIQUETAS_AISLAMIENTO,
  ETIQUETAS_INUNDACION,
  ICONOS_ACCESOS_MAPA,
  ID_ICONO_AISLAMIENTO,
  ID_ICONO_CRUCE,
  ID_ICONO_INUNDACION,
  SVG_ICONO_CRUCE_PUENTE,
  SVG_ICONO_CRUCE_SIN_EVIDENCIA,
  SVG_ICONO_CRUCE_VADO,
  resumirCobertura,
  MOTIVOS_SIN_RUTA,
  MOTIVO_SIN_RUTA_GENERICO,
  TEXTOS_ACCESOS,
  textoConPeriodo,
  textoMotivoSinRuta,
  type ClasificacionCruce,
} from './accesos-capas'

type ClaseRioPrueba = 'alto' | 'medio' | 'bajo' | 'sin_riesgo' | 'sin_dato'

function escuela(
  cueAnexo: string,
  coords: { lat: number | null; lon: number | null } = { lat: -31.4, lon: -64.2 },
): EscuelaMapa {
  return {
    cueAnexo,
    nombre: `Escuela ${cueAnexo}`,
    departamento: 'Capital',
    localidad: 'Córdoba',
    lat: coords.lat,
    lon: coords.lon,
    estado: 'sin_afectacion_reportada',
  }
}

function filaAislamiento(nivel: NivelAislamientoMapa) {
  return { nivel, cruces: 0, conPuente: 0, sinPuente: 0, alternativaSinCruce: null }
}

function territorio(opciones: {
  aislamiento?: Record<string, ReturnType<typeof filaAislamiento>>
  susceptibilidad?: Record<string, ClaseRioPrueba | null>
}): TerritorioMapa {
  return {
    aislamiento:
      opciones.aislamiento === undefined
        ? null
        : {
            fuente: 'OpenStreetMap',
            atribucion: '© OpenStreetMap contributors',
            licencia: 'ODbL',
            fechaExtractoOsm: '2026-01-01',
            versionJob: '1',
            escuelas: opciones.aislamiento,
          },
    susceptibilidad:
      opciones.susceptibilidad === undefined
        ? null
        : {
            fuente: 'physrisk',
            indicador: 'inundacion_fluvial',
            escenario: 'historico',
            unidad: 'm',
            periodoRetornoAnios: 100,
            fechaCorrida: '2026-01-01',
            licencia: 'CC-BY',
            escuelas: Object.fromEntries(
              Object.entries(opciones.susceptibilidad).map(([cue, clase]) => [
                cue,
                { inundacionFluvialM: null, claseRio: clase, juntoLaguna: null },
              ]),
            ),
          },
  }
}

describe('claseInundacion', () => {
  it('toma la clase guardada tal cual, con los cinco valores del dominio', () => {
    expect(claseInundacion('alto')).toBe('alto')
    expect(claseInundacion('medio')).toBe('medio')
    expect(claseInundacion('bajo')).toBe('bajo')
    expect(claseInundacion('sin_riesgo')).toBe('sin_riesgo')
    expect(claseInundacion('sin_dato')).toBe('sin_dato')
  })

  it('null, ausente o fuera de dominio es Sin dato, nunca Bajo ni Sin riesgo', () => {
    expect(claseInundacion(null)).toBe('sin_dato')
    expect(claseInundacion(undefined)).toBe('sin_dato')
    expect(claseInundacion('')).toBe('sin_dato')
    expect(claseInundacion('desconocida')).toBe('sin_dato')
  })

  it('las etiquetas son sólo la palabra de la clase', () => {
    expect(ETIQUETAS_INUNDACION).toEqual({
      alto: 'Alto',
      medio: 'Medio',
      bajo: 'Bajo',
      sin_riesgo: 'Sin riesgo',
      sin_dato: 'Sin dato',
    })
  })
})

describe('constructores de puntos', () => {
  it('omite escuelas sin coordenadas o sin cobertura', () => {
    const escuelas = [
      escuela('CON-COBERTURA'),
      escuela('SIN-COORDS', { lat: null, lon: null }),
      escuela('SIN-COBERTURA'),
    ]
    const t = territorio({ aislamiento: { 'CON-COBERTURA': filaAislamiento(1) } })

    const puntos = construirPuntosAislamiento(escuelas, t)
    expect(puntos.features).toHaveLength(1)
    expect(puntos.features[0].properties.cueAnexo).toBe('CON-COBERTURA')
    expect(puntos.features[0].properties.icono).toBe(ID_ICONO_AISLAMIENTO[1])
    expect(puntos.features[0].geometry.coordinates).toEqual([-64.2, -31.4])
  })

  it('construye la capa de inundación sólo con clase alto|medio|bajo', () => {
    const escuelas = [
      escuela('BAJO'),
      escuela('SIN-RIESGO'),
      escuela('SIN-DATO'),
      escuela('SIN-FILA'),
      escuela('SIN-COORDS', { lat: null, lon: null }),
    ]
    const t = territorio({
      susceptibilidad: { BAJO: 'bajo', 'SIN-RIESGO': 'sin_riesgo', 'SIN-DATO': null, 'SIN-COORDS': 'alto' },
    })

    const puntos = construirPuntosInundacion(escuelas, t)
    expect(puntos.features).toHaveLength(1)
    expect(puntos.features[0].properties).toMatchObject({
      cueAnexo: 'BAJO',
      clase: 'bajo',
      icono: ID_ICONO_INUNDACION.bajo,
    })
  })
})

describe('resumirCobertura', () => {
  it('cuenta todo el padrón, incluidas las escuelas sin coordenadas', () => {
    const escuelas = [
      escuela('A'),
      escuela('B', { lat: null, lon: null }),
      escuela('C'),
      escuela('D'),
    ]
    const t = territorio({
      aislamiento: {
        A: filaAislamiento(0),
        C: filaAislamiento('sin_datos_red'),
      },
      susceptibilidad: { A: 'bajo', B: 'alto', C: null },
    })

    const resumen = resumirCobertura(escuelas, t)

    expect(resumen.total).toBe(4)
    expect(resumen.aislamiento[0]).toBe(1)
    expect(resumen.aislamiento.sin_datos_red).toBe(1)
    // B (sin coords) y D no tienen fila de aislamiento.
    expect(resumen.aislamiento.sin_cobertura).toBe(2)

    expect(resumen.inundacion.bajo).toBe(1)
    expect(resumen.inundacion.alto).toBe(1)
    // C tiene fila con clase null y D no tiene fila: ambos cuentan sin dato.
    expect(resumen.inundacion.sin_dato).toBe(2)
    expect(resumen.inundacion.sin_riesgo).toBe(0)
    expect(resumen.inundacion.medio).toBe(0)
  })
})

describe('construirRutaAcceso', () => {
  it('conserva exactamente las coordenadas del dato', () => {
    const coordinates: Array<[number, number]> = [
      [-64.2, -31.4],
      [-64.1, -31.3],
      [-64.0, -31.2],
    ]
    const resultado = construirRutaAcceso({
      cueAnexo: 'A',
      disponible: true,
      ruta: { type: 'LineString', coordinates },
    })

    expect(resultado).not.toBeNull()
    expect(resultado?.features).toHaveLength(1)
    expect(resultado?.features[0].geometry.coordinates).toEqual(coordinates)
    expect(resultado?.features[0].geometry.coordinates).toHaveLength(3)
  })

  it('devuelve null cuando no está disponible', () => {
    expect(construirRutaAcceso(null)).toBeNull()
    expect(construirRutaAcceso({ cueAnexo: 'A', disponible: false })).toBeNull()
  })
})

describe('construirCrucesAcceso', () => {
  it('asigna ícono y etiqueta por clasificación', () => {
    const clasificaciones: ClasificacionCruce[] = ['puente', 'vado', 'sin_evidencia']
    const resultado = construirCrucesAcceso({
      cueAnexo: 'A',
      disponible: true,
      cruces: clasificaciones.map((clasificacion, i) => ({
        lon: -64 + i / 100,
        lat: -31 + i / 100,
        clasificacion,
      })),
    })

    expect(resultado.features).toHaveLength(3)
    for (const [i, clasificacion] of clasificaciones.entries()) {
      expect(resultado.features[i].properties.clasificacion).toBe(clasificacion)
      expect(resultado.features[i].properties.icono).toBe(ID_ICONO_CRUCE[clasificacion])
      expect(resultado.features[i].properties.etiqueta).toBeTruthy()
    }
  })

  it('devuelve una colección vacía cuando no está disponible', () => {
    expect(construirCrucesAcceso(null).features).toHaveLength(0)
    expect(construirCrucesAcceso({ cueAnexo: 'A', disponible: false }).features).toHaveLength(0)
  })
})

describe('ICONOS_ACCESOS_MAPA', () => {
  it('tiene ids únicos y todos los svg son SVG válidos', () => {
    const ids = ICONOS_ACCESOS_MAPA.map((icono) => icono.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const icono of ICONOS_ACCESOS_MAPA) {
      expect(icono.svg.startsWith('<svg')).toBe(true)
    }
  })
})

describe('íconos de cruces de agua', () => {
  it('usa fondo blanco y trazo y borde semánticos, con paths de Lucide', () => {
    const iconos = [
      { svg: SVG_ICONO_CRUCE_PUENTE, color: '#356f23' },
      { svg: SVG_ICONO_CRUCE_VADO, color: '#b45f04' },
      { svg: SVG_ICONO_CRUCE_SIN_EVIDENCIA, color: '#5f5e5c' },
    ]

    for (const { svg, color } of iconos) {
      expect(svg).toContain(`stroke="${color}"`)
      expect(svg).toContain(`<circle cx="12" cy="12" r="11" fill="#ffffff" stroke="${color}" stroke-width="1" />`)
      expect(svg).not.toMatch(/#(?:9ca3af|6b7280|fde68a)/)
    }

    expect(SVG_ICONO_CRUCE_VADO).toContain('<path d="M2 12q2.5 2 5 0t5 0 5 0 5 0" />')
    expect(SVG_ICONO_CRUCE_VADO).toContain('<path d="M2 19q2.5 2 5 0t5 0 5 0 5 0" />')
    expect(SVG_ICONO_CRUCE_VADO).toContain('<path d="M2 5q2.5 2 5 0t5 0 5 0 5 0" />')
    expect(SVG_ICONO_CRUCE_SIN_EVIDENCIA).toContain(
      '<path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />',
    )
    expect(SVG_ICONO_CRUCE_SIN_EVIDENCIA).toContain('<path d="M12 17h.01" />')
    expect(SVG_ICONO_CRUCE_SIN_EVIDENCIA).not.toContain('<circle cx="12" cy="12" r="10" />')
  })
})

const NIVELES = [0, 1, 2, 3, 'sin_datos_red'] as const

describe('DESCRIPCIONES_AISLAMIENTO', () => {
  it('explica en lenguaje llano cada nivel, incluido el no calculable', () => {
    for (const nivel of NIVELES) {
      expect(DESCRIPCIONES_AISLAMIENTO[nivel].nombre.length).toBeGreaterThan(0)
      expect(DESCRIPCIONES_AISLAMIENTO[nivel].detalle.length).toBeGreaterThan(20)
    }
  })

  it('usa el nombre corto como etiqueta única de leyenda, ficha y control', () => {
    for (const nivel of NIVELES) {
      expect(ETIQUETAS_AISLAMIENTO[nivel]).toBe(DESCRIPCIONES_AISLAMIENTO[nivel].nombre)
    }
  })
})

describe('textoConPeriodo', () => {
  it('reemplaza todas las apariciones de {periodo} con el valor recibido', () => {
    expect(textoConPeriodo('{periodo} años y {periodo}', 250)).toBe('250 años y 250')
  })

  it('usa 100 cuando el dato no trae período de retorno', () => {
    const conDefault = textoConPeriodo(TEXTOS_ACCESOS.queMideInundacion, null)
    expect(conDefault).toContain('una vez cada 100 años')
    expect(conDefault).not.toContain('{periodo}')
    expect(textoConPeriodo(TEXTOS_ACCESOS.queMideInundacion, undefined)).toBe(conDefault)
  })

  it('el texto de inundación aclara que es un modelo, no un registro de inundaciones', () => {
    expect(TEXTOS_ACCESOS.queMideInundacion).toContain('con el clima histórico')
    expect(TEXTOS_ACCESOS.queMideInundacion).not.toContain('registros históricos')
  })

  it('el texto de sin cobertura descarta explícitamente leerlo como nivel 0', () => {
    expect(TEXTOS_ACCESOS.sinCobertura).toContain('No equivale a nivel 0')
  })

  it('reemplaza todas las apariciones de periodo en subtítulo y escenario', () => {
    for (const texto of [TEXTOS_ACCESOS.subtituloInundacion, TEXTOS_ACCESOS.periodoEscenario]) {
      const resultado = textoConPeriodo(texto, 250)
      expect(resultado).not.toContain('{periodo}')
      const cantidad = texto.match(/\{periodo\}/g)?.length ?? 0
      expect(resultado.match(/250/g)?.length).toBe(cantidad)
    }
    expect(TEXTOS_ACCESOS.queMideInundacion).toContain('{periodo}')
  })
})

describe('copias territoriales', () => {
  it('explica cabecera y caminos principales con palabras claras', () => {
    const textos = [
      ...Object.entries(TEXTOS_ACCESOS)
        .filter(([clave]) => !['queMideInundacion', 'queMideAcceso'].includes(clave))
        .map(([, valor]) => valor),
      ...Object.values(MOTIVOS_SIN_RUTA),
      ...Object.values(DESCRIPCIONES_AISLAMIENTO).flatMap(({ nombre, detalle }) => [nombre, detalle]),
      ...Object.values(DESCRIPCIONES_CRUCE),
    ]
    for (const texto of textos) {
      if (texto.includes('cabecera')) expect(texto).toContain('ciudad cabecera')
      expect(texto).not.toContain('red principal')
    }
  })

  it('define motivos de ruta distintos y devuelve el genérico para motivos desconocidos', () => {
    const valores = Object.values(MOTIVOS_SIN_RUTA)
    expect(new Set(valores).size).toBe(valores.length)
    for (const valor of valores) {
      expect(valor).not.toBe(MOTIVO_SIN_RUTA_GENERICO)
      expect(valor).not.toContain('OSM')
      expect(valor).not.toContain('physrisk')
      expect(valor).not.toContain('null')
    }
    for (const motivo of Object.keys(MOTIVOS_SIN_RUTA)) {
      expect(textoMotivoSinRuta(motivo)).toBe(MOTIVOS_SIN_RUTA[motivo])
    }
    expect(textoMotivoSinRuta('desconocido')).toBe(MOTIVO_SIN_RUTA_GENERICO)
    expect(textoMotivoSinRuta(undefined)).toBe(MOTIVO_SIN_RUTA_GENERICO)
    expect(textoMotivoSinRuta(null)).toBe(MOTIVO_SIN_RUTA_GENERICO)
  })

  it('describe los tres tipos de cruce', () => {
    expect(Object.keys(DESCRIPCIONES_CRUCE).sort()).toEqual(['puente', 'sin_evidencia', 'vado'])
  })

  it('no afirma que los datos confirmen la transitabilidad de hoy', () => {
    const textos = [...Object.values(MOTIVOS_SIN_RUTA), ...Object.values(TEXTOS_ACCESOS)]
    for (const texto of textos) {
      expect(texto).not.toContain('transitable')
      if (texto.includes('se puede pasar')) expect(texto).toContain('No dice')
    }
  })

})
