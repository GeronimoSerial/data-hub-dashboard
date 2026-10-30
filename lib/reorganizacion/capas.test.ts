import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DatasetV29, EscuelaV29, ReferenciaV29 } from './tipos'
import {
  construirRecorrido,
  construirReferencias,
  construirSeleccion,
  construirUniverso,
  construirZonas,
  paintUniverso,
} from './capas'

function escuela(cue: string, overrides: Partial<EscuelaV29> = {}): EscuelaV29 {
  return {
    cue,
    nombre: `Escuela ${cue}`,
    departamento: 'Capital',
    localidad: 'Corrientes',
    ambito: 'Urbano',
    cui: '',
    jurisdiccion: '',
    modalidad: '',
    matricula: 100,
    historia: {},
    lat: -27.47,
    lon: -58.83,
    pof: {},
    agentes: 0,
    zona: 'Zona 1',
    sueldosTotal: null,
    personasSueldos: null,
    clasificacionZonaSueldos: null,
    ...overrides,
  }
}

function referencia(cue: string, overrides: Partial<ReferenciaV29> = {}): ReferenciaV29 {
  return {
    cue,
    nombre: `Referencia ${cue}`,
    lat: -27.5,
    lon: -58.8,
    primaria: true,
    secundaria: false,
    matriculaPrimaria: null,
    localidad: 'Corrientes',
    departamento: 'Capital',
    ...overrides,
  }
}

const SIN_RESALTE = new Set<string>()

function distanciaKm(a: [number, number], b: [number, number]): number {
  const radio = 6371.0088
  const rad = (grados: number) => (grados * Math.PI) / 180
  const dLat = rad(b[1] - a[1])
  const dLon = rad(b[0] - a[0])
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2
  return 2 * radio * Math.asin(Math.sqrt(h))
}

describe('construirUniverso', () => {
  it('incluye todas las escuelas del corte V29 con o sin filtro activo', () => {
    const dataset = JSON.parse(
      readFileSync(new URL('./data/v29.json', import.meta.url), 'utf8'),
    ) as DatasetV29
    const sinFiltro = construirUniverso(dataset.escuelas, {
      idsCoincidentes: new Set(),
      hayFiltroActivo: false,
      resaltados: SIN_RESALTE,
      seleccionada: null,
    })
    const conFiltro = construirUniverso(dataset.escuelas, {
      idsCoincidentes: new Set([dataset.escuelas[0].cue]),
      hayFiltroActivo: true,
      resaltados: SIN_RESALTE,
      seleccionada: null,
    })

    expect(sinFiltro.features).toHaveLength(265)
    expect(conFiltro.features).toHaveLength(265)
  })

  it('atenúa con coincide false en vez de quitar escuelas', () => {
    const escuelas = [escuela('A'), escuela('B')]
    const { features } = construirUniverso(escuelas, {
      idsCoincidentes: new Set(['A']),
      hayFiltroActivo: true,
      resaltados: new Set(['A']),
      seleccionada: null,
    })

    expect(features.map((f) => [f.properties.cue, f.properties.coincide])).toEqual([
      ['A', true],
      ['B', false],
    ])
    expect(features[0].properties.resaltada).toBe(true)
    expect(features[1].properties.resaltada).toBe(false)
  })

  it('marca la escuela seleccionada y deja colección vacía sin selección en construirSeleccion', () => {
    const escuelas = [escuela('A'), escuela('B')]
    const { features } = construirUniverso(escuelas, {
      idsCoincidentes: new Set(),
      hayFiltroActivo: false,
      resaltados: SIN_RESALTE,
      seleccionada: 'B',
    })

    expect(features.map((f) => f.properties.seleccionada)).toEqual([false, true])
    expect(construirSeleccion(null)).toEqual({ type: 'FeatureCollection', features: [] })
    expect(construirSeleccion(escuelas[1]).features[0].properties).toEqual({ cue: 'B', nombre: 'Escuela B' })
  })

  it('separa el anillo de selección por grosor, no solo por color', () => {
    const paint = paintUniverso({ oscuro: false }) as Record<string, unknown>
    expect(paint['circle-stroke-width']).toEqual(['case', ['get', 'seleccionada'], 3, ['get', 'resaltada'], 2, 1])
  })
})

describe('construirReferencias', () => {
  it('excluye las CUE del universo para no duplicar puntos', () => {
    const referencias = [
      referencia('A', { primaria: true }),
      referencia('X', { primaria: true, matriculaPrimaria: null }),
      referencia('Y', { primaria: false, secundaria: true }),
    ]
    const otras = construirReferencias(referencias, 'primaria', [escuela('A')])
    const secundarias = construirReferencias(referencias, 'secundaria', [escuela('Y')])

    expect(otras.features.map((f) => f.properties.cue)).toEqual(['X'])
    expect(otras.features[0].properties.matriculaPrimaria).toBeNull()
    expect(secundarias.features).toHaveLength(0)
  })
})

describe('construirZonas', () => {
  it('dibuja un círculo cerrado de 64 vértices de 10 km de radio por centro', () => {
    const centros = [{ id: 1, lat: -27.47, lon: -58.83 }]
    const escuelas = [escuela('A', { historia: { '2023': 10, '2026': 12 } })]
    const { features } = construirZonas(centros, escuelas)

    expect(features).toHaveLength(1)
    const anillo = features[0].geometry.coordinates[0]
    expect(anillo).toHaveLength(65)
    expect(anillo[64]).toEqual(anillo[0])

    const radios = anillo.map((punto) => distanciaKm([centros[0].lon, centros[0].lat], punto as [number, number]))
    expect(Math.max(...radios)).toBeGreaterThan(9.9)
    expect(Math.max(...radios)).toBeLessThan(10.1)

    expect(features[0].properties).toEqual({
      id: 1,
      etiqueta: 'Zona 1',
      miembros: 1,
      tendencia: 'sube',
      color: '#719C29',
    })
  })
})

describe('construirRecorrido', () => {
  const origen = { nombre: 'Origen', lat: -27.47, lon: -58.83 }
  const destino = { nombre: 'Destino', lat: -27.5, lon: -58.8 }

  it('sin geometría dibuja solo origen y destino, nunca una línea recta', () => {
    const { features } = construirRecorrido(origen, destino, null)

    expect(features.map((f) => f.properties)).toEqual([{ rol: 'origen' }, { rol: 'destino' }])
    expect(features.every((f) => f.geometry.type === 'Point')).toBe(true)
  })

  it('con geometría agrega el trazado vial antes de los puntos', () => {
    const geometria = { type: 'LineString' as const, coordinates: [[-58.83, -27.47], [-58.8, -27.5]] as [number, number][] }
    const { features } = construirRecorrido(origen, destino, geometria)

    expect(features[0].geometry).toEqual(geometria)
    expect(features[0].properties).toEqual({ rol: 'trazado' })
    expect(features).toHaveLength(3)
  })
})
