import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CATALOGO_ESTACIONES_PREFECTURA } from '@/lib/infraestructura/hidrometria/estaciones-prefectura'
import { centroidesLocalidadesEscuelas,
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

function ubicar(eventos: EventoFixture[]) {
  return ubicarEventos({
    eventos: { features: eventos },
    evidenciasCsv: CSV_EVIDENCIAS,
    localidades: LOCALIDADES,
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

  it('matches a locality ignoring its parenthetical but keeps the original for display', () => {
    const { geojson } = ubicar([evento({ localidad: 'Ituzaingó (Isla Apipé)' })])
    expect(geojson.features).toHaveLength(1)
    expect(geojson.features[0].geometry.coordinates).toEqual([-56.7, -27.6])
    expect(geojson.features[0].properties.lugar).toBe('Ituzaingó (Isla Apipé)')
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
      localidades: locs.features.map((f: { properties: { name: string }; geometry: { coordinates: number[] } }) => ({
        nombre: f.properties.name,
        lon: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
      })).concat(centroidesLocalidadesEscuelas(JSON.parse(leer('data/localizaciones.json')))),
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
    for (const f of eventos.features) {
      const id = f.properties.id_evento
      expect(idsSalida.has(id) || idsSinUbicar.has(id) || idsDescartados.has(id)).toBe(true)
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
      localidades: locs.features.map((f: { properties: { name: string }; geometry: { coordinates: number[] } }) => ({
        nombre: f.properties.name,
        lon: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
      })).concat(centroidesLocalidadesEscuelas(JSON.parse(leer('data/localizaciones.json')))),
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
})

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
    expect(puntos).toEqual([{ nombre: 'PASO DE LOS LIBRES', lat: -29.72, lon: -57.09 }])
  })
})
