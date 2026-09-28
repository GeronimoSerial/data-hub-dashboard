import { describe, expect, it } from 'vitest'
import type { FeatureCollection, Polygon } from 'geojson'
import type { Feature, Point } from 'geojson'
import {
  agruparEscuelasPorDepartamento,
  agruparNacimientosPorDepartamento,
  agruparPadronPorCue,
  buscarEscuelas,
  calcularVariacion,
  colorEscalonado,
  colorSecuencial,
  colorVariacion,
  construirDatosNatalidad,
  construirEscalaSecuencial,
  construirEscuelasCompletas,
  construirExpresionStep,
  construirFeatureCollectionEscuelas,
  construirPuntosSparkline,
  ESCALA_VARIACION_BREAKS,
  ESCALA_VARIACION_COLORS,
  COLOR_SIN_DATO,
  inferirNivelesDesdeOferta,
  NIVELES,
  opcionesAnioDesde,
  opcionesAnioHasta,
  sanearCoordenadasFueraDeLimites,
  type EscuelaCompleta,
  type EscuelaProperties,
  type GeoEscuelaRow,
  type NacidoVivoRow,
  type PadronRow,
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

describe('agruparPadronPorCue', () => {
  const rows: PadronRow[] = [
    { cue_anexo: 'A', nombre: 'Escuela A', departamento: 'BELLA VISTA', localidad: 'X', nivel: 'Inicial', curso: 'Sala de 4', secciones: 2 },
    { cue_anexo: 'A', nombre: 'Escuela A', departamento: 'BELLA VISTA', localidad: 'X', nivel: 'Inicial', curso: 'Sala de 5', secciones: 1 },
    { cue_anexo: 'A', nombre: 'Escuela A', departamento: 'BELLA VISTA', localidad: 'X', nivel: 'Primario', curso: '1º', secciones: 1 },
    { cue_anexo: 'B', nombre: 'Escuela B', departamento: 'BELLA VISTA', localidad: 'Y', nivel: 'Secundario', curso: '1º', secciones: 3 },
  ]

  it('agrupa por CUE y por nivel, con desglose de cursos y total de secciones', () => {
    const porCue = agruparPadronPorCue(rows)
    const escuelaA = porCue.get('A')
    expect(escuelaA).toEqual([
      { nivel: 'Inicial', secciones: 3, cursos: [{ curso: 'Sala de 4', secciones: 2 }, { curso: 'Sala de 5', secciones: 1 }] },
      { nivel: 'Primario', secciones: 1, cursos: [{ curso: '1º', secciones: 1 }] },
    ])
  })

  it('respeta el orden de NIVELES aunque las filas vengan en otro orden', () => {
    const porCue = agruparPadronPorCue(rows)
    const nivelesA = porCue.get('A')!.map((n) => n.nivel)
    expect(nivelesA).toEqual(['Inicial', 'Primario'])
    expect(NIVELES.indexOf('Inicial')).toBeLessThan(NIVELES.indexOf('Primario'))
  })
})

describe('inferirNivelesDesdeOferta', () => {
  it('mapea patrones inequívocos de ofertaTipo a Nivel', () => {
    expect(inferirNivelesDesdeOferta(['Común - Jardín de infantes'])).toEqual(['Inicial'])
    expect(inferirNivelesDesdeOferta(['Común - Primaria de 6 años'])).toEqual(['Primario'])
    expect(inferirNivelesDesdeOferta(['Común - Secundaria Completa req. 6 años'])).toEqual(['Secundario'])
    expect(inferirNivelesDesdeOferta(['Común - SNU'])).toEqual(['Superior'])
    expect(inferirNivelesDesdeOferta(['Común - Servicios complementarios'])).toEqual(['Servicios Educativos'])
  })

  it('una escuela con varias ofertas devuelve varios niveles, sin duplicados y en orden NIVELES', () => {
    expect(
      inferirNivelesDesdeOferta(['Común - Jardín maternal', 'Común - Jardín de infantes', 'Común - Primaria de 6 años']),
    ).toEqual(['Inicial', 'Primario'])
  })

  it('ofertaTipo sin patrón confiable (p. ej. artística/técnica) devuelve []', () => {
    expect(inferirNivelesDesdeOferta(['Común - Cursos y Talleres de Artística'])).toEqual([])
  })
})

describe('sanearCoordenadasFueraDeLimites', () => {
  // Cuadrado 0,0 - 1,1 en (lon,lat) — geometría simple, sólo para ejercitar
  // el saneo (el point-in-polygon real se testea a fondo en geo.test.ts).
  const departamentos: FeatureCollection<Polygon, { nombre: string }> = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { nombre: 'CAPITAL' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 1],
              [0, 0],
            ],
          ],
        },
      },
    ],
  }

  const dentro: GeoEscuelaRow = {
    cueAnexo: '1', nombre: 'Dentro', estado: 'Activo', sector: 'Estatal', ofertaTipo: [],
    localidad: 'X', departamento: 'CAPITAL', domicilio: '', cui: 1, lat: 0.5, lon: 0.5,
  }
  // A ~0.005° del borde (lon=1): unos 500m en el ecuador, dentro de la tolerancia de 1km.
  const cercaDelBorde: GeoEscuelaRow = {
    cueAnexo: '2', nombre: 'Cerca del borde', estado: 'Activo', sector: 'Estatal', ofertaTipo: [],
    localidad: 'X', departamento: 'CAPITAL', domicilio: '', cui: 2, lat: 0.5, lon: 1.005,
  }
  const lejos: GeoEscuelaRow = {
    cueAnexo: '3', nombre: 'Lejos', estado: 'Activo', sector: 'Estatal', ofertaTipo: [],
    localidad: 'X', departamento: 'CAPITAL', domicilio: '', cui: 3, lat: 10, lon: 10,
  }
  const sinCoords: GeoEscuelaRow = {
    cueAnexo: '4', nombre: 'Sin coords', estado: 'Activo', sector: 'Estatal', ofertaTipo: [],
    localidad: 'X', departamento: 'CAPITAL', domicilio: '', cui: 4, lat: null, lon: null,
  }

  it('mantiene un punto adentro del polígono', () => {
    const { rows, descartadas } = sanearCoordenadasFueraDeLimites([dentro], departamentos)
    expect(rows).toEqual([dentro])
    expect(descartadas).toEqual([])
  })

  it('mantiene un punto afuera pero dentro de la tolerancia (hueco de geometría simplificada)', () => {
    const { rows, descartadas } = sanearCoordenadasFueraDeLimites([cercaDelBorde], departamentos)
    expect(rows).toEqual([cercaDelBorde])
    expect(descartadas).toEqual([])
  })

  it('anula lat/lon de un punto lejos de todo contorno y lo reporta con su distancia', () => {
    const { rows, descartadas } = sanearCoordenadasFueraDeLimites([lejos], departamentos)
    expect(rows).toEqual([{ ...lejos, lat: null, lon: null }])
    expect(descartadas).toHaveLength(1)
    expect(descartadas[0].cueAnexo).toBe('3')
    expect(descartadas[0].distanciaKm).toBeGreaterThan(1)
  })

  it('una fila ya sin coordenadas pasa intacta', () => {
    const { rows, descartadas } = sanearCoordenadasFueraDeLimites([sinCoords], departamentos)
    expect(rows).toEqual([sinCoords])
    expect(descartadas).toEqual([])
  })
})

describe('construirEscuelasCompletas', () => {
  const geo: GeoEscuelaRow[] = [
    {
      cueAnexo: '1800001-00', nombre: 'Con padrón', estado: 'Activo', sector: 'Estatal',
      ofertaTipo: ['Común - Jardín de infantes'], localidad: 'X', departamento: 'BELLA VISTA',
      domicilio: 'Calle 1', cui: 1, lat: -28.5, lon: -59.0,
    },
    {
      cueAnexo: '1800002-00', nombre: 'Sin padrón, oferta inferible', estado: 'Activo', sector: 'Privado',
      ofertaTipo: ['Común - Primaria de 6 años'], localidad: 'Y', departamento: 'BELLA VISTA',
      domicilio: 'Calle 2', cui: 2, lat: -28.6, lon: -59.1,
    },
    {
      cueAnexo: '1800003-00', nombre: 'Sin coordenadas', estado: 'Activo', sector: 'Estatal',
      ofertaTipo: [], localidad: 'Z', departamento: 'BELLA VISTA', domicilio: 'Calle 3', cui: 3,
      lat: null, lon: null,
    },
  ]

  const padronRows: PadronRow[] = [
    { cue_anexo: '1800001-00', nombre: 'Con padrón', departamento: 'BELLA VISTA', localidad: 'X', nivel: 'Inicial', curso: 'Sala de 4', secciones: 2 },
    { cue_anexo: '1800004-00', nombre: 'Sólo en padrón', departamento: 'BELLA VISTA', localidad: 'W', nivel: 'Primario', curso: '1º', secciones: 1 },
  ]

  it('un CUE del GEO con fila de padrón usa esos niveles (tienePadron: true)', () => {
    const { escuelas } = construirEscuelasCompletas(geo, padronRows)
    const escuela = escuelas.find((e) => e.cueAnexo === '1800001-00')
    expect(escuela?.tienePadron).toBe(true)
    expect(escuela?.niveles).toEqual([{ nivel: 'Inicial', secciones: 2, cursos: [{ curso: 'Sala de 4', secciones: 2 }] }])
    expect(escuela?.seccionesTotal).toBe(2)
  })

  it('un CUE del GEO sin fila de padrón infiere el nivel de ofertaTipo (tienePadron: false, secciones: 0)', () => {
    const { escuelas } = construirEscuelasCompletas(geo, padronRows)
    const escuela = escuelas.find((e) => e.cueAnexo === '1800002-00')
    expect(escuela?.tienePadron).toBe(false)
    expect(escuela?.niveles).toEqual([{ nivel: 'Primario', secciones: 0, cursos: [] }])
  })

  it('un CUE del padrón sin fila de GEO se reporta en padronSinGeo y queda sin coordenadas', () => {
    const { escuelas, padronSinGeo } = construirEscuelasCompletas(geo, padronRows)
    expect(padronSinGeo).toEqual(['1800004-00'])
    const escuela = escuelas.find((e) => e.cueAnexo === '1800004-00')
    expect(escuela?.lat).toBeNull()
    expect(escuela?.lon).toBeNull()
    expect(escuela?.tienePadron).toBe(true)
    expect(escuela?.departamento).toBe('BELLA VISTA')
  })
})

describe('construirFeatureCollectionEscuelas', () => {
  const escuelas: EscuelaCompleta[] = [
    {
      cueAnexo: '1', nombre: 'Con coords, inicial', departamento: 'BELLA VISTA', localidad: 'X',
      sector: 'Estatal', ofertaTipo: [], domicilio: 'D1',
      niveles: [{ nivel: 'Inicial', secciones: 2, cursos: [{ curso: 'Sala de 4', secciones: 2 }] }],
      seccionesTotal: 2, tienePadron: true, lat: -28.5, lon: -59.0,
    },
    {
      cueAnexo: '2', nombre: 'Con coords, primario', departamento: 'BELLA VISTA', localidad: 'Y',
      sector: 'Estatal', ofertaTipo: [], domicilio: 'D2',
      niveles: [{ nivel: 'Primario', secciones: 1, cursos: [{ curso: '1º', secciones: 1 }] }],
      seccionesTotal: 1, tienePadron: true, lat: -28.6, lon: -59.1,
    },
    {
      cueAnexo: '3', nombre: 'Sin coords', departamento: 'BELLA VISTA', localidad: 'Z',
      sector: 'Estatal', ofertaTipo: [], domicilio: 'D3',
      niveles: [], seccionesTotal: 0, tienePadron: false, lat: null, lon: null,
    },
  ]

  it('una escuela sin coordenadas no genera feature pero se cuenta en sinCoordenadas', () => {
    const { featureCollection, sinCoordenadas } = construirFeatureCollectionEscuelas(escuelas)
    expect(sinCoordenadas).toBe(1)
    expect(featureCollection.features).toHaveLength(2)
  })

  it('esInicial es true sólo para escuelas con oferta de Inicial', () => {
    const { featureCollection } = construirFeatureCollectionEscuelas(escuelas)
    const conInicial = featureCollection.features.find((f) => f.properties.cueAnexo === '1')
    const sinInicial = featureCollection.features.find((f) => f.properties.cueAnexo === '2')
    expect(conInicial?.properties.esInicial).toBe(true)
    expect(sinInicial?.properties.esInicial).toBe(false)
    expect(conInicial?.geometry.coordinates).toEqual([-59.0, -28.5])
  })
})

describe('agruparEscuelasPorDepartamento', () => {
  const escuelas: EscuelaCompleta[] = [
    {
      cueAnexo: '1', nombre: 'A', departamento: 'BELLA VISTA', localidad: 'X', sector: 'Estatal',
      ofertaTipo: [], domicilio: null,
      niveles: [{ nivel: 'Inicial', secciones: 2, cursos: [{ curso: 'Sala de 4', secciones: 2 }] }],
      seccionesTotal: 2, tienePadron: true, lat: -28.5, lon: -59.0,
    },
    {
      cueAnexo: '2', nombre: 'B', departamento: 'Bella Vista', localidad: 'Y', sector: 'Estatal',
      ofertaTipo: [], domicilio: null,
      niveles: [
        { nivel: 'Inicial', secciones: 1, cursos: [{ curso: 'Plurisala', secciones: 1 }] },
        { nivel: 'Primario', secciones: 3, cursos: [{ curso: '1º', secciones: 3 }] },
      ],
      seccionesTotal: 4, tienePadron: true, lat: null, lon: null,
    },
  ]

  it('cuenta escuelas y secciones por nivel, normalizando el nombre de departamento', () => {
    const map = agruparEscuelasPorDepartamento(escuelas)
    const entry = map.get('BELLA VISTA')
    expect(entry?.porNivel.Inicial).toEqual({ escuelas: 2, secciones: 3 })
    expect(entry?.porNivel.Primario).toEqual({ escuelas: 1, secciones: 3 })
    expect(entry?.porNivel.Secundario).toEqual({ escuelas: 0, secciones: 0 })
  })

  it('desglosa secciones de Inicial por sala', () => {
    const map = agruparEscuelasPorDepartamento(escuelas)
    expect(map.get('BELLA VISTA')?.inicialSeccionesPorCurso).toEqual({ 'Sala de 4': 2, Plurisala: 1 })
  })

  it('usa TODAS las escuelas, con o sin coordenadas', () => {
    const map = agruparEscuelasPorDepartamento(escuelas)
    // La escuela '2' no tiene coordenadas y aun así entra en el agregado.
    expect(map.get('BELLA VISTA')?.porNivel.Primario.escuelas).toBe(1)
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
  const escuelas: EscuelaCompleta[] = [
    {
      cueAnexo: '1800001-00', nombre: 'Escuela', departamento: 'BELLA VISTA', localidad: 'X',
      sector: 'Estatal', ofertaTipo: [], domicilio: null,
      niveles: [{ nivel: 'Inicial', secciones: 2, cursos: [{ curso: 'Sala de 4', secciones: 2 }] }],
      seccionesTotal: 2, tienePadron: true, lat: -28.5, lon: -59.0,
    },
  ]

  it('arma departamentos con serie, variacion, oferta por nivel e inicial; separa DESCONOCIDO', () => {
    const datos = construirDatosNatalidad({
      nacimientos,
      escuelas,
      nombresDepartamentosConocidos: ['Bella Vista'],
      fuenteNatalidad: { nombre: 'DEIS', url: 'https://example.org' },
      fuenteLocalizaciones: 'Localizaciones: relevamiento GEO 2025-10-02',
      fuenteSecciones: 'Secciones: padrón Gestión Educativa, ciclo 2026',
      extraidoEn: '2026-09-25',
    })

    expect(datos.meta.anioInicio).toBe(2014)
    expect(datos.meta.anioFin).toBe(2023)
    expect(datos.meta.fuenteLocalizaciones).toBe('Localizaciones: relevamiento GEO 2025-10-02')
    expect(datos.meta.fuenteSecciones).toBe('Secciones: padrón Gestión Educativa, ciclo 2026')

    const bellaVista = datos.departamentos.find((d) => d.clave === 'BELLA VISTA')
    expect(bellaVista?.nombre).toBe('Bella Vista')
    expect(bellaVista?.serie).toEqual({ '2014': 830, '2023': 500 })
    expect(bellaVista?.variacion.abs).toBe(-330)
    expect(bellaVista?.inicial).toEqual({
      cues: 1,
      seccionesTotal: 2,
      seccionesPorCurso: { 'Sala de 4': 2 },
    })
    expect(bellaVista?.porNivel.Inicial).toEqual({ escuelas: 1, secciones: 2 })
    expect(bellaVista?.porNivel.Secundario).toEqual({ escuelas: 0, secciones: 0 })

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

// ── Rango de años seleccionable (T10a) ──────────────────────────────────────

describe('opcionesAnioHasta / opcionesAnioDesde', () => {
  const anios = [2014, 2016, 2020, 2023]

  it('opcionesAnioHasta devuelve sólo los años estrictamente mayores que "desde"', () => {
    expect(opcionesAnioHasta(anios, 2016)).toEqual([2020, 2023])
  })

  it('opcionesAnioDesde devuelve sólo los años estrictamente menores que "hasta"', () => {
    expect(opcionesAnioDesde(anios, 2020)).toEqual([2014, 2016])
  })

  it('opcionesAnioHasta con el último año como "desde" no deja ninguna opción', () => {
    expect(opcionesAnioHasta(anios, 2023)).toEqual([])
  })

  it('opcionesAnioDesde con el primer año como "hasta" no deja ninguna opción', () => {
    expect(opcionesAnioDesde(anios, 2014)).toEqual([])
  })
})

// ── Búsqueda de escuelas (T10a) ──────────────────────────────────────────────

describe('buscarEscuelas', () => {
  function escuela(overrides: Partial<EscuelaProperties>): Feature<Point, EscuelaProperties> {
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-58.8, -27.5] },
      properties: {
        cueAnexo: '1800001-00',
        nombre: 'ESCUELA GENERICA',
        departamento: 'CAPITAL',
        localidad: 'CORRIENTES',
        sector: 'Estatal',
        ofertaTipo: [],
        domicilio: null,
        niveles: [],
        seccionesTotal: 0,
        tienePadron: true,
        esInicial: false,
        ...overrides,
      },
    }
  }

  const featureCollection = {
    type: 'FeatureCollection' as const,
    features: [
      escuela({ cueAnexo: '1801605-04', nombre: 'ESCUELA N° 1 SAN MARTÍN', localidad: 'GOYA' }),
      escuela({ cueAnexo: '1802000-00', nombre: 'JARDÍN DE INFANTES N° 5', localidad: 'SANTO TOMÉ' }),
      escuela({ cueAnexo: '1803000-00', nombre: 'ESCUELA N° 20 SARMIENTO', localidad: 'GOYA' }),
    ],
  }

  it('menos de 2 caracteres no busca nada (evita listar todo con una tecla)', () => {
    expect(buscarEscuelas(featureCollection, 'g')).toEqual([])
  })

  it('matchea por nombre insensible a mayúsculas/acentos, prefijo primero', () => {
    const resultados = buscarEscuelas(featureCollection, 'jardin')
    expect(resultados.map((f) => f.properties.cueAnexo)).toEqual(['1802000-00'])
  })

  it('matchea por CUE-anexo', () => {
    const resultados = buscarEscuelas(featureCollection, '1801605')
    expect(resultados.map((f) => f.properties.cueAnexo)).toEqual(['1801605-04'])
  })

  it('matchea por localidad y ordena varios resultados alfabéticamente dentro del mismo rango', () => {
    const resultados = buscarEscuelas(featureCollection, 'goya')
    expect(resultados.map((f) => f.properties.cueAnexo)).toEqual(['1801605-04', '1803000-00'])
  })

  it('sin coincidencias devuelve una lista vacía', () => {
    expect(buscarEscuelas(featureCollection, 'inexistente')).toEqual([])
  })

  it('respeta el límite de resultados', () => {
    expect(buscarEscuelas(featureCollection, 'escuela', 1)).toHaveLength(1)
  })

  describe('ranking (feedback "se ven pésimos", 2026-09-25)', () => {
    const conCue = {
      type: 'FeatureCollection' as const,
      features: [
        escuela({ cueAnexo: '1801605-04', nombre: 'JARDÍN N° 17', localidad: 'GOYA' }),
        escuela({ cueAnexo: '1802000-00', nombre: 'ESCUELA N° 170', localidad: 'GOYA' }),
        escuela({ cueAnexo: '1803000-00', nombre: 'ESCUELA N° 173', localidad: 'GOYA' }),
      ],
    }

    it('CUE-anexo exacto gana contra prefijo de nombre/CUE', () => {
      const conPrefijo = {
        type: 'FeatureCollection' as const,
        features: [
          escuela({ cueAnexo: '1801605-04', nombre: '1801605 ESCUELA GENERICA' }),
          escuela({ cueAnexo: '1801605-99', nombre: 'OTRA ESCUELA' }),
        ],
      }
      const resultados = buscarEscuelas(conPrefijo, '1801605-99')
      expect(resultados.map((f) => f.properties.cueAnexo)[0]).toBe('1801605-99')
    })

    it('una palabra completa del nombre ("17") rankea antes que "170"/"173" (match numérico completo)', () => {
      const resultados = buscarEscuelas(conCue, '17')
      expect(resultados.map((f) => f.properties.nombre)).toEqual([
        'JARDÍN N° 17',
        'ESCUELA N° 170',
        'ESCUELA N° 173',
      ])
    })

    it('"17" matchea "N° 17" como palabra aunque no sea prefijo del nombre completo', () => {
      const resultados = buscarEscuelas(conCue, '17')
      expect(resultados.map((f) => f.properties.cueAnexo)).toContain('1801605-04')
    })
  })
})
