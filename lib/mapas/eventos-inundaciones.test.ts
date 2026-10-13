import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CATALOGO_ESTACIONES_PREFECTURA } from '@/lib/infraestructura/hidrometria/estaciones-prefectura'
import { centroidesLocalidadesEscuelas,
  EVENTOS_INUNDACIONES_URLS,
  parsearCsv,
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
    const enDepartamento = resultado.geojson.features.filter((f) => f.properties.precisionMostrada === 'departamento')
    expect(enDepartamento.map((f) => f.properties.lugar)).not.toContain('Paso de los Libres')
    for (const f of eventos.features) {
      const id = f.properties.id_evento
      expect(idsSalida.has(id) || idsSinUbicar.has(id)).toBe(true)
    }
    expect(EVENTOS_INUNDACIONES_URLS.eventos).toBe('/data/eventos-inundaciones/eventos.geojson')
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
