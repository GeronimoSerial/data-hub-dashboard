import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CATALOGO_ESTACIONES_PREFECTURA } from '@/lib/infraestructura/hidrometria/estaciones-prefectura'
import { auditarUbicaciones,
  centroidesLocalidadesEscuelas,
  puntosDeLocalidades,
  etiquetaConfianza,
  etiquetaEstado,
  EVENTOS_INUNDACIONES_URLS,
  hechosEvento,
  parsearCsv,
  subtituloEvento,
  tituloEvento,
  ubicarEventos,
} from './eventos-inundaciones'

const CSV_EVIDENCIAS = [
  'id_evidencia,fuente,titulo,url,fecha_publicacion',
  'EVD-048,Diario Local,"Crecida, cortes y evacuados",https://example.test/nota,2026-10-01',
  'EVD-002,Prefectura,Altura de los ríos,https://example.test/alturas,2026-10-02',
].join('\n')

const LOCALIDADES = [
  { nombre: 'Bonpland', lon: -58.1, lat: -28.4 },
  { nombre: 'Ituzaingó', lon: -56.7, lat: -27.6 },
  { nombre: 'Santo Tomé', lon: -56.0, lat: -28.5 },
]

const DEPARTAMENTOS = [
  { nombre: 'Ituzaingó', lon: -56.5, lat: -27.5 },
  { nombre: 'Paso de los Libres', lon: -57.1, lat: -29.7 },
]

const ESTACIONES = [
  { nombrePna: 'ITUZAINGO', coordenadas: { lat: -27.608, lon: -56.834 } },
  { nombrePna: 'ITA IBATE', coordenadas: null },
]

type Overrides = Record<string, unknown>

type EventoFixture = {
  type: string
  geometry: { type: string; coordinates?: unknown } | null
  properties: Record<string, unknown>
}

function evento(over: Overrides = {}): EventoFixture {
  return {
    type: 'Feature',
    geometry: null,
    properties: {
      id_evento: 'EV-1',
      tipo_fenomeno: 'inundación',
      tipo_afectacion: 'evacuados',
      departamento: 'Ituzaingó',
      localidad: 'Ituzaingó',
      paraje_barrio: null,
      curso_agua: 'Paraná',
      geometria_tipo: 'punto',
      geometria_precision: 'localidad',
      inicio_evento: '2026-10-01',
      fin_evento: null,
      ultima_actualizacion: '2026-10-10',
      estado_temporal: 'activo',
      evidencias: 'EVD-002;EVD-048',
      fuente_principal: 'EVD-048',
      mediciones: '5,2 m',
      confianza: 'alta',
      limitaciones: null,
      referencia_territorial: null,
      ...over,
    },
  }
}

function ubicar(eventos: EventoFixture[], localidades: typeof LOCALIDADES = LOCALIDADES) {
  return ubicarEventos({
    eventos: { features: eventos },
    evidenciasCsv: CSV_EVIDENCIAS,
    localidades,
    departamentos: DEPARTAMENTOS,
    estaciones: ESTACIONES,
  })
}

describe('parsearCsv', () => {
  it('handles quotes, escaped quotes, embedded commas and newlines, and CRLF', () => {
    const texto = 'a,b,c\r\n"uno, dos","say ""hola""","línea1\nlínea2"\r\n'
    expect(parsearCsv(texto)).toEqual([
      { a: 'uno, dos', b: 'say "hola"', c: 'línea1\nlínea2' },
    ])
  })
})

describe('ubicarEventos', () => {
  it('places a single-locality event at the locality point with source URL resolved', () => {
    const { geojson, sinUbicar } = ubicar([evento()])
    expect(sinUbicar).toEqual([])
    expect(geojson.features).toHaveLength(1)
    const [f] = geojson.features
    expect(f.geometry).toEqual({ type: 'Point', coordinates: [-56.7, -27.6] })
    expect(f.properties).toMatchObject({
      id_evento: 'EV-1',
      lugar: 'Ituzaingó',
      precisionFuente: 'localidad',
      precisionMostrada: 'localidad',
      multiLugar: false,
      fuenteTitulo: 'Crecida, cortes y evacuados',
      fuenteUrl: 'https://example.test/nota',
    })
  })

  it('yields one feature per place for a multi-locality event', () => {
    const { geojson, sinUbicar } = ubicar([
      evento({ localidad: 'Bonpland;Santo Tomé', departamento: 'Paso de los Libres;Ituzaingó' }),
    ])
    expect(sinUbicar).toEqual([])
    expect(geojson.features.map((f) => f.properties.lugar)).toEqual(['Bonpland', 'Santo Tomé'])
    expect(geojson.features.every((f) => f.properties.multiLugar === true)).toBe(true)
  })

  it('matches the gazetteer on the full place text before stripping the parenthetical', () => {
    const { geojson } = ubicar([evento({ localidad: 'Ituzaingó (Isla Apipé)' })])
    expect(geojson.features).toHaveLength(1)
    expect(geojson.features[0].geometry.coordinates).toEqual([-56.741868, -27.511299])
    expect(geojson.features[0].properties.metodoUbicacion).toBe('gazetteer')
    expect(geojson.features[0].properties.lugar).toBe('Ituzaingó (Isla Apipé)')
  })

  it('matches a locality ignoring its parenthetical when the full text is not in the gazetteer', () => {
    const { geojson } = ubicar([evento({ localidad: 'Ituzaingó (Campo)' })])
    expect(geojson.features[0].geometry.coordinates).toEqual([-56.7, -27.6])
    expect(geojson.features[0].properties.metodoUbicacion).toBe('localidad')
  })

  it('resolves gazetteer aliases such as Apipé and Yacyretá', () => {
    const { geojson } = ubicar([
      evento({ localidad: 'Apipé' }),
      evento({ id_evento: 'EV-2', localidad: 'Yacyretá' }),
    ])
    expect(geojson.features[0].geometry.coordinates).toEqual([-56.741868, -27.511299])
    expect(geojson.features[1].geometry.coordinates).toEqual([-56.7286, -27.4823])
  })

  it('never pairs a locality with a department by index when the lists differ in length', () => {
    const { geojson, sinUbicar, sinUbicacionPrecisa } = ubicar([
      evento({ localidad: 'Campo X;Campo Y', departamento: 'Ituzaingó' }),
    ])
    expect(geojson.features).toEqual([])
    expect(sinUbicar).toEqual(['EV-1'])
    expect(sinUbicacionPrecisa).toEqual([])
  })

  it('does not use a department fallback whose name is itself a locality', () => {
    const { geojson, sinUbicar, sinUbicacionPrecisa } = ubicar([
      evento({ localidad: 'Campo X;Campo Y', departamento: 'Bonpland;Ituzaingó' }),
    ])
    expect(geojson.features).toEqual([])
    expect(sinUbicar).toEqual(['EV-1'])
    expect(sinUbicacionPrecisa).toEqual([])
  })

  it('does not draw a multi-place department-only place and lists it in sinUbicacionPrecisa', () => {
    const { geojson, sinUbicacionPrecisa } = ubicar([
      evento({ localidad: 'Campo X;Campo Y', departamento: 'Paso de los Libres;Paso de los Libres' }),
    ])
    expect(geojson.features).toEqual([])
    expect(sinUbicacionPrecisa).toEqual([
      { id: 'EV-1', lugar: 'Campo X' },
      { id: 'EV-1', lugar: 'Campo Y' },
    ])
  })

  it('keeps the single-place department fallback drawn as departamento', () => {
    const { geojson, sinUbicacionPrecisa } = ubicar([
      evento({ localidad: 'Campo Inexistente', departamento: 'Ituzaingó' }),
    ])
    expect(sinUbicacionPrecisa).toEqual([])
    expect(geojson.features[0].properties.precisionMostrada).toBe('departamento')
  })

  it('moves an aggregate provincial figure to resumenProvincial and marks its named places as agregado', () => {
    const { geojson, sinUbicar, resumenProvincial } = ubicar(
      [
        evento({
          id_evento: 'EV-20261013-007',
          tipo_afectacion: 'evacuados y autoevacuados (cifra provincial consolidada)',
          mediciones: '67 personas',
          localidad: 'Isla Apipé;Paso de los Libres',
          departamento: 'Ituzaingó;Paso de los Libres',
          geometria_precision: 'localidad',
        }),
      ],
      [...LOCALIDADES, { nombre: 'Paso de los Libres', lon: -57.09, lat: -29.68 }],
    )
    expect(sinUbicar).toEqual([])
    expect(resumenProvincial).toHaveLength(1)
    expect(resumenProvincial[0]).toMatchObject({
      id_evento: 'EV-20261013-007',
      lugares: ['Isla Apipé', 'Paso de los Libres'],
      estadoEtiqueta: expect.any(String),
      confianzaEtiqueta: expect.any(String),
    })
    expect(geojson.features).toHaveLength(2)
    expect(geojson.features.every((f) => f.properties.agregado === true)).toBe(true)
    expect(geojson.features.every((f) => f.properties.id_evento === 'EV-20261013-007')).toBe(true)
    expect(geojson.features.map((f) => f.geometry.coordinates)).toEqual([
      [-56.741868, -27.511299],
      [-57.09, -29.68],
    ])
    expect(geojson.features.some((f) => f.properties.precisionMostrada === 'departamento')).toBe(false)
  })

  it('keeps a single-place aggregate in resumenProvincial without a department point', () => {
    const { geojson, resumenProvincial } = ubicar([
      evento({ tipo_afectacion: 'cifra provincial', localidad: 'Ituzaingó', departamento: 'Ituzaingó' }),
    ])
    expect(resumenProvincial).toHaveLength(1)
    expect(geojson.features.every((f) => f.properties.precisionMostrada !== 'departamento')).toBe(true)
  })

  it('audits every placed, aggregated, undetermined and unlocated event with its method', () => {
    const { geojson, sinUbicar, sinUbicacionPrecisa, resumenProvincial } = ubicar([
      evento({ localidad: 'Bonpland' }),
      evento({ id_evento: 'EV-2', localidad: 'Campo X;Campo Y', departamento: 'Paso de los Libres;Paso de los Libres' }),
      evento({ id_evento: 'EV-3', localidad: 'Campo Z', departamento: 'Nadie', tipo_afectacion: 'provincial' }),
      evento({ id_evento: 'EV-4', localidad: 'Nada', departamento: 'Nadie' }),
    ])
    const filas = auditarUbicaciones({ geojson, sinUbicar, sinUbicacionPrecisa, resumenProvincial, descartados: [] })
    expect(filas).toContainEqual({ id: 'EV-1', lugar: 'Bonpland', metodo: 'localidad', lat: -28.4, lon: -58.1 })
    expect(filas).toContainEqual({ id: 'EV-2', lugar: 'Campo X', metodo: 'no determinada', lat: null, lon: null })
    expect(filas).toContainEqual({ id: 'EV-3', lugar: 'Campo Z', metodo: 'resumen', lat: null, lon: null })
    expect(filas).toContainEqual({ id: 'EV-4', lugar: '', metodo: 'no determinada', lat: null, lon: null })
  })

  it('falls back to the department centroid with precisionMostrada departamento', () => {
    const { geojson, sinUbicar } = ubicar([
      evento({ localidad: 'Campo Inexistente', departamento: 'Ituzaingó' }),
    ])
    expect(sinUbicar).toEqual([])
    expect(geojson.features[0].geometry.coordinates).toEqual([-56.5, -27.5])
    expect(geojson.features[0].properties.precisionMostrada).toBe('departamento')
  })

  it('uses the Prefectura station for estación precision when the name matches', () => {
    const { geojson } = ubicar([
      evento({ localidad: 'Ituzaingo', geometria_precision: 'estación' }),
    ])
    expect(geojson.features[0].geometry.coordinates).toEqual([-56.834, -27.608])
    expect(geojson.features[0].properties.precisionMostrada).toBe('estación')
  })

  it('skips a station without coordinates and falls back to the locality', () => {
    const { geojson } = ubicar([
      evento({ localidad: 'Ita Ibate', geometria_precision: 'estación', departamento: 'Ituzaingó' }),
    ])
    expect(geojson.features[0].properties.precisionMostrada).toBe('departamento')
  })

  it('lists totally unknown events in sinUbicar', () => {
    const { geojson, sinUbicar } = ubicar([
      evento({ id_evento: 'EV-9', localidad: 'Nada', departamento: 'Nadie' }),
    ])
    expect(geojson.features).toEqual([])
    expect(sinUbicar).toEqual(['EV-9'])
  })

  it('uses a non-null source geometry as-is', () => {
    const { geojson } = ubicar([
      evento({ geometria_precision: 'localidad', localidad: 'Nada', departamento: 'Nadie' }),
    ].map((e) => ({ ...e, geometry: { type: 'Point', coordinates: [-57, -28] } })))
    expect(geojson.features[0].geometry).toEqual({ type: 'Point', coordinates: [-57, -28] })
    expect(geojson.features[0].properties.precisionMostrada).toBe('localidad')
  })

  it('resolves the source URL from the evidencias CSV and null when missing', () => {
    const { geojson } = ubicar([evento({ fuente_principal: 'EVD-999' })])
    expect(geojson.features[0].properties.fuenteUrl).toBeNull()
    expect(geojson.features[0].properties.fuenteTitulo).toBeNull()
  })
})

describe('eventos-inundaciones real data', () => {
  it('places or lists every event id from public/data', () => {
    const leer = (ruta: string) => readFileSync(resolve(process.cwd(), 'public', ruta), 'utf8')
    const eventos = JSON.parse(leer('data/eventos-inundaciones/eventos.geojson'))
    const locs = JSON.parse(leer('data/localities.geojson'))
    const deps = JSON.parse(leer('data/departamentos-corrientes-georef-2026-09-27.geojson'))

    const resultado = ubicarEventos({
      eventos,
      evidenciasCsv: leer('data/eventos-inundaciones/evidencias.csv'),
      localidades: puntosDeLocalidades(locs.features.map((f: { properties: { name: string }; geometry: { coordinates: number[] } }) => ({
        nombre: f.properties.name,
        lon: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
      })), JSON.parse(leer('data/localizaciones.json'))),
      departamentos: deps.features.map((f: { properties: { nombre: string; centroide: { lon: number; lat: number } } }) => ({
        nombre: f.properties.nombre,
        lon: f.properties.centroide.lon,
        lat: f.properties.centroide.lat,
      })),
      estaciones: CATALOGO_ESTACIONES_PREFECTURA,
    })

    const idsSalida = new Set(resultado.geojson.features.map((f) => f.properties.id_evento))
    const idsSinUbicar = new Set(resultado.sinUbicar)
    const idsDescartados = new Set(resultado.descartados.map((d) => d.id))
    const enDepartamento = resultado.geojson.features.filter((f) => f.properties.precisionMostrada === 'departamento')
    expect(enDepartamento.map((f) => f.properties.lugar)).not.toContain('Paso de los Libres')
    const idsResumen = new Set(resultado.resumenProvincial.map((r) => r.id_evento))
    const idsPrecision = new Set(resultado.sinUbicacionPrecisa.map((s) => s.id))
    for (const f of eventos.features) {
      const id = f.properties.id_evento
      expect(
        idsSalida.has(id) || idsSinUbicar.has(id) || idsDescartados.has(id) || idsResumen.has(id) || idsPrecision.has(id),
      ).toBe(true)
    }
    expect(EVENTOS_INUNDACIONES_URLS.eventos).toBe('/data/eventos-inundaciones/eventos.geojson')
  })

  it('reports the real events without a URL source in descartados', () => {
    const leer = (ruta: string) => readFileSync(resolve(process.cwd(), 'public', ruta), 'utf8')
    const eventos = JSON.parse(leer('data/eventos-inundaciones/eventos.geojson'))
    const resultado = ubicarEventos({
      eventos,
      evidenciasCsv: leer('data/eventos-inundaciones/evidencias.csv'),
      localidades: [],
      departamentos: [],
      estaciones: CATALOGO_ESTACIONES_PREFECTURA,
    })
    const descartados = new Map(resultado.descartados.map((d) => [d.id, d.motivo]))
    expect(descartados.has('EV-20261012-003')).toBe(true)
    expect(descartados.has('EV-20261013-006')).toBe(true)
  })

  it('exposes human-readable labels without snake_case or evidence ids for every real feature', () => {
    const leer = (ruta: string) => readFileSync(resolve(process.cwd(), 'public', ruta), 'utf8')
    const eventos = JSON.parse(leer('data/eventos-inundaciones/eventos.geojson'))
    const locs = JSON.parse(leer('data/localities.geojson'))
    const deps = JSON.parse(leer('data/departamentos-corrientes-georef-2026-09-27.geojson'))
    const resultado = ubicarEventos({
      eventos,
      evidenciasCsv: leer('data/eventos-inundaciones/evidencias.csv'),
      localidades: puntosDeLocalidades(locs.features.map((f: { properties: { name: string }; geometry: { coordinates: number[] } }) => ({
        nombre: f.properties.name,
        lon: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
      })), JSON.parse(leer('data/localizaciones.json'))),
      departamentos: deps.features.map((f: { properties: { nombre: string; centroide: { lon: number; lat: number } } }) => ({
        nombre: f.properties.nombre,
        lon: f.properties.centroide.lon,
        lat: f.properties.centroide.lat,
      })),
      estaciones: CATALOGO_ESTACIONES_PREFECTURA,
    })
    expect(resultado.geojson.features.length).toBeGreaterThan(0)

    const textos: string[] = []
    for (const f of resultado.geojson.features) {
      const p = f.properties
      textos.push(p.titulo, p.subtitulo, p.estadoEtiqueta, p.confianzaEtiqueta, ...p.hechos)
      textos.push(...p.fuentes.map((s) => s.medio))
    }
    for (const texto of textos) {
      expect(texto).not.toMatch(/[a-z]+_[a-z]+/)
      expect(texto).not.toMatch(/\bEVD?-\d/)
    }
  })

  it('keeps EV-20261013-007 as a provincial aggregate with no department-centroid point', () => {
    const resultado = ubicarDatosReales()
    const agregado = resultado.resumenProvincial.find((r) => r.id_evento === 'EV-20261013-007')
    expect(agregado).toBeDefined()
    const puntos = resultado.geojson.features.filter((f) => f.properties.id_evento === 'EV-20261013-007')
    expect(puntos.every((f) => f.properties.precisionMostrada !== 'departamento')).toBe(true)
    expect(puntos.every((f) => f.properties.agregado === true)).toBe(true)
  })

  it('audits every kept event id from public/data at least once', () => {
    const resultado = ubicarDatosReales()
    const filas = auditarUbicaciones(resultado)
    const ids = new Set(filas.map((f) => f.id))
    const mantenidos = [
      ...resultado.geojson.features.map((f) => f.properties.id_evento),
      ...resultado.resumenProvincial.map((r) => r.id_evento),
      ...resultado.sinUbicacionPrecisa.map((s) => s.id),
      ...resultado.sinUbicar,
    ]
    expect(mantenidos.length).toBeGreaterThan(0)
    for (const id of mantenidos) expect(ids.has(id)).toBe(true)
  })
})

function ubicarDatosReales() {
  const leer = (ruta: string) => readFileSync(resolve(process.cwd(), 'public', ruta), 'utf8')
  const eventos = JSON.parse(leer('data/eventos-inundaciones/eventos.geojson'))
  const locs = JSON.parse(leer('data/localities.geojson'))
  const deps = JSON.parse(leer('data/departamentos-corrientes-georef-2026-09-27.geojson'))
  return ubicarEventos({
    eventos,
    evidenciasCsv: leer('data/eventos-inundaciones/evidencias.csv'),
    localidades: puntosDeLocalidades(locs.features.map((f: { properties: { name: string }; geometry: { coordinates: number[] } }) => ({
      nombre: f.properties.name,
      lon: f.geometry.coordinates[0],
      lat: f.geometry.coordinates[1],
    })), JSON.parse(leer('data/localizaciones.json'))),
    departamentos: deps.features.map((f: { properties: { nombre: string; centroide: { lon: number; lat: number } } }) => ({
      nombre: f.properties.nombre,
      lon: f.properties.centroide.lon,
      lat: f.properties.centroide.lat,
    })),
    estaciones: CATALOGO_ESTACIONES_PREFECTURA,
  })
}

describe('filtro de calidad', () => {
  it('drops events with confianza muy baja', () => {
    const resultado = ubicar([evento({ confianza: 'muy baja' })])
    expect(resultado.geojson.features).toEqual([])
    expect(resultado.sinUbicar).toEqual([])
    expect(resultado.descartados).toEqual([{ id: 'EV-1', motivo: 'confianza_muy_baja' }])
  })

  it('drops baja events without any http(s) source', () => {
    const resultado = ubicar([evento({ confianza: 'baja', evidencias: 'EVD-999', fuente_principal: 'EVD-999' })])
    expect(resultado.geojson.features).toEqual([])
    expect(resultado.descartados).toEqual([{ id: 'EV-1', motivo: 'sin_fuente_verificable' }])
  })

  it('keeps baja events with at least one source', () => {
    const resultado = ubicar([evento({ confianza: 'baja' })])
    expect(resultado.geojson.features).toHaveLength(1)
    expect(resultado.descartados).toEqual([])
  })

  it('drops media events without any http(s) source', () => {
    const resultado = ubicar([evento({ confianza: 'media', evidencias: 'EVD-999', fuente_principal: 'EVD-999' })])
    expect(resultado.geojson.features).toEqual([])
    expect(resultado.descartados).toEqual([{ id: 'EV-1', motivo: 'sin_fuente_verificable' }])
  })

  it('lists sources main first, deduplicated, with only http(s) urls', () => {
    const resultado = ubicar([
      evento({ evidencias: 'EVD-002;EVD-048;EVD-002;EVD-777', fuente_principal: 'EVD-048' }),
    ])
    expect(resultado.geojson.features[0].properties.fuentes).toEqual([
      { medio: 'Diario Local', fecha: '1/10', url: 'https://example.test/nota' },
      { medio: 'Prefectura', fecha: '2/10', url: 'https://example.test/alturas' },
    ])
  })
})

describe('etiquetas legibles', () => {
  it('builds the title from the affectation, adding the river for floods', () => {
    expect(tituloEvento({
      tipo_fenomeno: 'crecida fluvial',
      tipo_afectacion: 'evacuación preventiva de familias; playas bajo agua',
      curso_agua: 'río Uruguay',
    })).toBe('Evacuación preventiva de familias por crecida del río Uruguay')
  })

  it('appends the rain or storm phenomenon and strips parentheticals', () => {
    expect(tituloEvento({
      tipo_fenomeno: 'tormenta con lluvia intensa y viento',
      tipo_afectacion: 'árboles y postes caídos (EVD-009)',
      curso_agua: 'no aplica',
    })).toBe('Árboles y postes caídos por tormenta con lluvia intensa y viento')
  })

  it('states when no damage was reported', () => {
    expect(tituloEvento({
      tipo_fenomeno: 'lluvia',
      tipo_afectacion: 'ninguna informada (sin anegamientos)',
      curso_agua: 'no aplica',
    })).toBe('Lluvia sin daños informados')
  })

  it('builds the subtitle with a day/month range and keeps aprox.', () => {
    expect(subtituloEvento('Ituzaingó', '2026-10-06', null)).toBe('Ituzaingó · desde 6/10')
    expect(subtituloEvento('Ituzaingó', '2026-10-06', '2026-10-08 12:00')).toBe('Ituzaingó · 6/10 – 8/10')
    expect(subtituloEvento('X', '2026-10-07 noche (aprox.)', null)).toBe('X · desde 7/10 (aprox.)')
    expect(subtituloEvento('X', 'no sé', null)).toBe('X')
  })

  it('extracts up to three facts without evidence references', () => {
    expect(hechosEvento('evacuados: 13 personas (EVD-002, 7/10); 25 personas; ver EV-20261011-001; 31 personas; 40 personas'))
      .toEqual(['Evacuados: 13 personas', '25 personas', '31 personas'])
  })

  it('truncates long facts to 140 characters with an ellipsis', () => {
    const [hecho] = hechosEvento('a'.repeat(200))
    expect(hecho.length).toBeLessThanOrEqual(140)
    expect(hecho.endsWith('…')).toBe(true)
  })

  it('returns no facts for non-text measurements', () => {
    expect(hechosEvento(null)).toEqual([])
  })

  it('maps the estado and confianza labels', () => {
    expect(etiquetaEstado('vigente_segun_ultimo_reporte')).toBe('Vigente según el último reporte')
    expect(etiquetaEstado('ocurrido')).toBe('Finalizado')
    expect(etiquetaEstado('evolucion_desconocida')).toBe('Evolución desconocida')
    expect(etiquetaEstado('otro')).toBe('Estado sin informar')
    expect(etiquetaConfianza('alta')).toBe('Confianza alta')
    expect(etiquetaConfianza('media')).toBe('Confianza media')
    expect(etiquetaConfianza('baja')).toBe('Confianza baja')
  })
})

describe('centroidesLocalidadesEscuelas', () => {
  it('uses the median school position per locality and skips approximated or missing coordinates', () => {
    const puntos = centroidesLocalidadesEscuelas([
      { localidad: 'PASO DE LOS LIBRES', lat: -29.71, lon: -57.08, geoCalidad: null },
      { localidad: 'PASO DE LOS LIBRES', lat: -29.72, lon: -57.09, geoCalidad: null },
      { localidad: 'PASO DE LOS LIBRES', lat: -29.0, lon: -58.0, geoCalidad: 'Aproximada por departamento' },
      { localidad: 'PASO DE LOS LIBRES', lat: -29.73, lon: -57.1, geoCalidad: null },
      { localidad: 'SIN COORDENADAS', lat: null, lon: null, geoCalidad: null },
    ])
    expect(puntos).toEqual([{ nombre: 'PASO DE LOS LIBRES', origen: 'escuelas', lat: -29.72, lon: -57.09 }])
  })
})

describe('puntosDeLocalidades', () => {
  it('prefers school medians over area centroids from localities.geojson', () => {
    const puntos = puntosDeLocalidades(
      [{ nombre: 'GOYA', lat: -29.4155, lon: -59.246 }],
      [{ localidad: 'GOYA', lat: -29.1487, lon: -59.2611, geoCalidad: null }],
    )
    expect(puntos[0]).toMatchObject({ nombre: 'GOYA', lat: -29.1487 })
  })
})
