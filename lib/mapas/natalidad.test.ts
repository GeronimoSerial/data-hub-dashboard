import { describe, expect, it } from 'vitest'
import {
  agruparInicialPorCue,
  agruparInicialPorDepartamento,
  agruparNacimientosPorDepartamento,
  calcularVariacion,
  colorEscalonado,
  colorSecuencial,
  colorVariacion,
  construirDatosNatalidad,
  construirEscalaSecuencial,
  construirExpresionStep,
  construirFeatureCollectionInicial,
  construirPuntosSparkline,
  ESCALA_VARIACION_BREAKS,
  ESCALA_VARIACION_COLORS,
  COLOR_SIN_DATO,
  type InicialRow,
  type LocalizacionRow,
  type NacidoVivoRow,
} from './natalidad'

describe('calcularVariacion', () => {
  it('calcula abs y pct entre dos años de una serie', () => {
    const serie = { '2014': 100, '2023': 68 }
    expect(calcularVariacion(serie, 2014, 2023)).toEqual({ abs: -32, pct: -32 })
  })

  it('valor inicial 0 da pct null (division invalida), no Infinity', () => {
    const serie = { '2014': 0, '2023': 10 }
    const { abs, pct } = calcularVariacion(serie, 2014, 2023)
    expect(abs).toBe(10)
    expect(pct).toBeNull()
  })

  it('años ausentes en la serie cuentan como 0', () => {
    const serie = { '2020': 5 }
    expect(calcularVariacion(serie, 2014, 2020)).toEqual({ abs: 5, pct: null })
  })
})

describe('agruparNacimientosPorDepartamento', () => {
  const rows: NacidoVivoRow[] = [
    { anio: 2014, coddpto: '18014', departamento: 'Berón de Astrada', nacidosVivos: 33 },
    { anio: 2014, coddpto: '18014', departamento: 'BERÓN DE ASTRADA', nacidosVivos: 2 },
    { anio: 2023, coddpto: '18014', departamento: 'Berón de Astrada', nacidosVivos: 20 },
    { anio: 2014, coddpto: '18999', departamento: 'DESCONOCIDO', nacidosVivos: 56 },
  ]

  it('matchea nombres con acentos y capitalización distinta bajo la misma clave', () => {
    const { porDepartamento } = agruparNacimientosPorDepartamento(rows)
    expect(porDepartamento.size).toBe(1)
    const entry = porDepartamento.get('BERON DE ASTRADA')
    expect(entry?.serie).toEqual({ '2014': 35, '2023': 20 })
  })

  it('DESCONOCIDO suma al total provincial pero no aparece en porDepartamento', () => {
    const { porDepartamento, provincia } = agruparNacimientosPorDepartamento(rows)
    expect(provincia['2014']).toBe(35 + 56)
    for (const entry of porDepartamento.values()) {
      expect(entry.coddpto).not.toBe('18999')
    }
  })
})

describe('agruparInicialPorDepartamento', () => {
  const rows: InicialRow[] = [
    {
      cue_anexo: 'A',
      nombre: 'Escuela A',
      departamento: 'BELLA VISTA',
      localidad: 'X',
      curso: 'Sala de 4',
      secciones: 2,
      alumnos_activos: 40,
    },
    {
      cue_anexo: 'A',
      nombre: 'Escuela A',
      departamento: 'BELLA VISTA',
      localidad: 'X',
      curso: 'Sala de 5',
      secciones: 1,
      alumnos_activos: 20,
    },
    {
      cue_anexo: 'B',
      nombre: 'Escuela B',
      departamento: 'Bella Vista',
      localidad: 'Y',
      curso: 'Sala de 4',
      secciones: 3,
      alumnos_activos: 60,
    },
  ]

  it('cuenta CUEs distintos y suma secciones por curso', () => {
    const map = agruparInicialPorDepartamento(rows)
    const entry = map.get('BELLA VISTA')
    expect(entry?.cues.size).toBe(2)
    expect(entry?.seccionesTotal).toBe(6)
    expect(entry?.seccionesPorCurso).toEqual({ 'Sala de 4': 5, 'Sala de 5': 1 })
  })
})

describe('agruparInicialPorCue + construirFeatureCollectionInicial', () => {
  const rows: InicialRow[] = [
    {
      cue_anexo: '1800001-00',
      nombre: 'Escuela con coordenadas',
      departamento: 'BELLA VISTA',
      localidad: 'X',
      curso: 'Sala de 4',
      secciones: 2,
      alumnos_activos: 40,
    },
    {
      cue_anexo: '1800002-00',
      nombre: 'Escuela sin coordenadas',
      departamento: 'BELLA VISTA',
      localidad: 'Y',
      curso: 'Plurisala',
      secciones: 1,
      alumnos_activos: 15,
    },
  ]

  const localizaciones: LocalizacionRow[] = [
    {
      cueAnexo: '1800001-00',
      nombre: 'Escuela con coordenadas',
      departamento: 'BELLA VISTA',
      localidad: 'X',
      lat: -28.5,
      lon: -59.0,
      geoCalidad: 'excelente',
    },
    {
      cueAnexo: '1800002-00',
      nombre: 'Escuela sin coordenadas',
      departamento: 'BELLA VISTA',
      localidad: 'Y',
      lat: null,
      lon: null,
      geoCalidad: null,
    },
  ]

  it('agrupa filas por CUE en salas y no incluye alumnos_activos', () => {
    const porCue = agruparInicialPorCue(rows)
    const escuela = porCue.get('1800001-00')
    expect(escuela?.salas).toEqual([{ curso: 'Sala de 4', secciones: 2 }])
    expect(escuela?.seccionesTotal).toBe(2)
    expect(escuela).not.toHaveProperty('alumnos_activos')
    expect(escuela).not.toHaveProperty('alumnosActivos')
  })

  it('un CUE sin coordenadas no genera feature pero se cuenta como sin coordenadas', () => {
    const porCue = agruparInicialPorCue(rows)
    const { featureCollection, cuesSinCoordenadas, cuesTotal } =
      construirFeatureCollectionInicial(porCue, localizaciones)

    expect(cuesTotal).toBe(2)
    expect(cuesSinCoordenadas).toBe(1)
    expect(featureCollection.features).toHaveLength(1)
    expect(featureCollection.features[0].properties.cueAnexo).toBe('1800001-00')
    expect(featureCollection.features[0].geometry.coordinates).toEqual([-59.0, -28.5])
  })
})

describe('construirDatosNatalidad', () => {
  const nacimientos: NacidoVivoRow[] = [
    { anio: 2014, coddpto: '18007', departamento: 'Bella Vista', nacidosVivos: 830 },
    { anio: 2023, coddpto: '18007', departamento: 'Bella Vista', nacidosVivos: 500 },
    { anio: 2014, coddpto: '18999', departamento: 'DESCONOCIDO', nacidosVivos: 56 },
    { anio: 2023, coddpto: '18999', departamento: 'DESCONOCIDO', nacidosVivos: 10 },
    // Departamento que NO está en la lista de conocidos (typo deliberado).
    { anio: 2014, coddpto: '99999', departamento: 'Departamento Inexistente', nacidosVivos: 5 },
  ]
  const inicial: InicialRow[] = [
    {
      cue_anexo: '1800001-00',
      nombre: 'Escuela',
      departamento: 'BELLA VISTA',
      localidad: 'X',
      curso: 'Sala de 4',
      secciones: 2,
      alumnos_activos: 40,
    },
  ]

  it('arma departamentos con serie, variacion y oferta de inicial; separa DESCONOCIDO', () => {
    const datos = construirDatosNatalidad({
      nacimientos,
      inicial,
      nombresDepartamentosConocidos: ['Bella Vista'],
      fuenteNatalidad: { nombre: 'DEIS', url: 'https://example.org' },
      fuenteInicial: 'Padrón GE 2026',
      extraidoEn: '2026-09-25',
    })

    expect(datos.meta.anioInicio).toBe(2014)
    expect(datos.meta.anioFin).toBe(2023)

    const bellaVista = datos.departamentos.find((d) => d.clave === 'BELLA VISTA')
    expect(bellaVista?.nombre).toBe('Bella Vista')
    expect(bellaVista?.serie).toEqual({ '2014': 830, '2023': 500 })
    expect(bellaVista?.variacion.abs).toBe(-330)
    expect(bellaVista?.inicial).toEqual({
      cues: 1,
      seccionesTotal: 2,
      seccionesPorCurso: { 'Sala de 4': 2 },
    })

    // DESCONOCIDO no debe aparecer como departamento del mapa.
    expect(datos.departamentos.some((d) => d.clave.includes('DESCONOCIDO'))).toBe(false)
    expect(datos.provincia.serie).toEqual({ '2014': 891, '2023': 510 })

    // El departamento sin match geográfico se reporta, no se descarta.
    expect(datos.departamentosSinMatch).toContain('Departamento Inexistente')
    expect(datos.departamentos.some((d) => d.nombre === 'Departamento Inexistente')).toBe(true)
  })
})

describe('construirPuntosSparkline', () => {
  it('el año de valor máximo queda arriba (y menor) y el mínimo abajo', () => {
    const serie = { '2014': 100, '2015': 50, '2016': 10 }
    const puntos = construirPuntosSparkline(serie, [2014, 2015, 2016], 100, 30)
    expect(puntos[0][1]).toBe(0) // 100 (máximo) -> y=0 (arriba)
    expect(puntos[2][1]).toBe(30) // 10 (mínimo) -> y=height (abajo)
    expect(puntos[0][0]).toBe(0)
    expect(puntos[2][0]).toBe(100)
  })

  it('una serie plana no divide por cero: todos los puntos a media altura', () => {
    const serie = { '2014': 5, '2015': 5 }
    const puntos = construirPuntosSparkline(serie, [2014, 2015], 100, 40)
    expect(puntos.every(([, y]) => y === 20)).toBe(true)
  })
})

describe('escalas de color', () => {
  it('colorEscalonado sigue la semantica >= break (igual que MapLibre step)', () => {
    const breaks = [10, 20]
    const colors = ['bajo', 'medio', 'alto']
    expect(colorEscalonado(5, breaks, colors)).toBe('bajo')
    expect(colorEscalonado(10, breaks, colors)).toBe('medio')
    expect(colorEscalonado(19, breaks, colors)).toBe('medio')
    expect(colorEscalonado(20, breaks, colors)).toBe('alto')
    expect(colorEscalonado(1000, breaks, colors)).toBe('alto')
  })

  it('construirEscalaSecuencial reparte por cuantiles y colorSecuencial usa esos breaks', () => {
    const valores = [10, 20, 30, 40, 50]
    const escala = construirEscalaSecuencial(valores)
    expect(escala.breaks.length).toBeGreaterThan(0)
    expect(colorSecuencial(escala.breaks[0] - 1, escala)).toBe(escala.colors[0])
    expect(colorSecuencial(1000, escala)).toBe(escala.colors[escala.colors.length - 1])
  })

  it('construirEscalaSecuencial con arreglo vacio no rompe', () => {
    const escala = construirEscalaSecuencial([])
    expect(escala.breaks).toEqual([])
    expect(escala.colors).toHaveLength(1)
  })

  it('colorVariacion: null (division invalida) pinta color neutro, nunca la clase de 0%', () => {
    expect(colorVariacion(null)).toBe(COLOR_SIN_DATO)
    expect(colorVariacion(-50)).toBe(ESCALA_VARIACION_COLORS[0])
    expect(colorVariacion(0)).toBe(colorEscalonado(0, ESCALA_VARIACION_BREAKS, ESCALA_VARIACION_COLORS))
    expect(colorVariacion(30)).toBe(ESCALA_VARIACION_COLORS[ESCALA_VARIACION_COLORS.length - 1])
  })

  it('construirExpresionStep produce la misma clase que colorEscalonado para varios valores', () => {
    const breaks = [-40, -25, -10, 0, 10, 25]
    const colors = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const expresion = construirExpresionStep(breaks, colors, 'valor')
    expect(expresion[0]).toBe('step')
    expect(expresion).toEqual([
      'step',
      ['coalesce', ['get', 'valor'], 0],
      'a',
      -40,
      'b',
      -25,
      'c',
      -10,
      'd',
      0,
      'e',
      10,
      'f',
      25,
      'g',
    ])

    for (const valor of [-100, -40, -30, -10, 0, 5, 10, 25, 90]) {
      expect(colorEscalonado(valor, breaks, colors)).toBe(
        colors[
          (() => {
            let idx = 0
            for (let i = 0; i < breaks.length; i++) if (valor >= breaks[i]) idx = i + 1
            return idx
          })()
        ],
      )
    }
  })
})
