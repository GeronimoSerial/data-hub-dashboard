// @vitest-environment jsdom
import type React from 'react'
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CAPA_ETIQUETA_SELECCION, CapasReorganizacion, type CapasReorganizacionProps } from './capas-reorganizacion'
import {
  CAPA_OTRAS_PRIMARIAS,
  CAPA_RECORRIDO_PUNTOS,
  CAPA_RECORRIDO_TRAZADO,
  CAPA_SECUNDARIAS,
  CAPA_SELECCION,
  CAPA_UNIVERSO,
  CAPA_ZONAS,
  FUENTE_OTRAS_PRIMARIAS,
  FUENTE_RECORRIDO,
  FUENTE_SECUNDARIAS,
  FUENTE_SELECCION,
  FUENTE_UNIVERSO,
  FUENTE_ZONAS,
  paintUniverso,
} from '@/lib/reorganizacion/capas'
import type { DatasetV29, EscuelaV29, ReferenciaV29 } from '@/lib/reorganizacion/tipos'

type Registro = Record<string, unknown> & { id?: string; children?: React.ReactNode }

const { capas, fuentes } = vi.hoisted(() => ({
  capas: [] as Registro[],
  fuentes: [] as Registro[],
}))

vi.mock('react-map-gl/maplibre', () => ({
  Source: (props: Registro) => {
    fuentes.push(props)
    return <div>{props.children}</div>
  },
  Layer: (props: Registro) => {
    capas.push(props)
    return null
  },
}))

function escuela(indice: number, extra: Partial<EscuelaV29> = {}): EscuelaV29 {
  return {
    cue: `C${indice}`,
    nombre: `Escuela ${indice}`,
    departamento: 'Capital',
    localidad: 'Corrientes',
    ambito: 'Urbano',
    cui: '',
    jurisdiccion: '',
    modalidad: 'Común',
    matricula: 5,
    historia: {},
    lat: -27.4 + indice * 0.001,
    lon: -58.8,
    pof: {},
    agentes: 0,
    zona: 'Zona 1',
    sueldosTotal: null,
    personasSueldos: null,
    clasificacionZonaSueldos: null,
    ...extra,
  }
}

function referencia(cue: string, extra: Partial<ReferenciaV29>): ReferenciaV29 {
  return {
    cue,
    nombre: `Referencia ${cue}`,
    lat: -27.5,
    lon: -58.7,
    primaria: false,
    secundaria: false,
    matriculaPrimaria: null,
    localidad: 'Corrientes',
    departamento: 'Capital',
    ...extra,
  }
}

const ESCUELAS = Array.from({ length: 265 }, (_, i) => escuela(i))
const REFERENCIAS = [
  referencia('C0', { primaria: true }),
  referencia('R1', { primaria: true }),
  referencia('R2', { secundaria: true }),
]

const DATASET: DatasetV29 = {
  version: 'V29',
  corte: '2026-10-28',
  escuelas: ESCUELAS,
  referencias: REFERENCIAS,
  ofertaPorCue: {},
  centros: [{ id: 1, lat: -27.4, lon: -58.8 }],
  cobertura: {
    escuelas: 265,
    alumnos: 1376,
    conCoordenadas: 265,
    conImportePositivo: 262,
    conRegistrosPof: 0,
    centros: 1,
    zonasOcupadas: 1,
    historiaPorAnio: {},
  },
}

const BASE: CapasReorganizacionProps = {
  dataset: DATASET,
  idsCoincidentes: new Set<string>(),
  hayFiltroActivo: false,
  resaltados: new Set<string>(),
  seleccionada: null,
  visibles: { zonas: true, otrasPrimarias: true, secundarias: true },
  recorrido: null,
  tema: 'claro',
}

function renderizar(props: Partial<CapasReorganizacionProps> = {}) {
  capas.length = 0
  fuentes.length = 0
  render(<CapasReorganizacion {...BASE} {...props} />)
  return {
    ids: capas.map((capa) => capa.id),
    capa: (id: string) => capas.find((capaRenderizada) => capaRenderizada.id === id),
    fuente: (id: string) => fuentes.find((fuenteRenderizada) => fuenteRenderizada.id === id),
  }
}

describe('CapasReorganizacion', () => {
  beforeEach(() => {
    capas.length = 0
    fuentes.length = 0
  })

  it('dibuja las capas de abajo hacia arriba: zonas, primarias, secundarias y universo', () => {
    const { ids } = renderizar()

    expect(ids).toEqual([CAPA_ZONAS, CAPA_OTRAS_PRIMARIAS, CAPA_SECUNDARIAS, CAPA_UNIVERSO])
  })

  it('omite las capas ocultas y mantiene siempre el universo', () => {
    const { ids } = renderizar({ visibles: { zonas: false, otrasPrimarias: false, secundarias: false } })

    expect(ids).toEqual([CAPA_UNIVERSO])
  })

  it('el universo tiene siempre los 265 establecimientos, con o sin filtro', () => {
    const sinFiltro = renderizar()
    expect(sinFiltro.fuente(FUENTE_UNIVERSO)?.data).toMatchObject({ type: 'FeatureCollection' })
    expect((sinFiltro.fuente(FUENTE_UNIVERSO)?.data as { features: unknown[] }).features).toHaveLength(265)

    const conFiltro = renderizar({ hayFiltroActivo: true, idsCoincidentes: new Set(['C1']) })
    const features = (conFiltro.fuente(FUENTE_UNIVERSO)?.data as { features: { properties: Record<string, unknown> }[] }).features
    expect(features).toHaveLength(265)
    expect(features.filter((f) => f.properties.coincide)).toHaveLength(1)
  })

  it('marca como resaltadas las escuelas de la clasificación salarial sin quitarlas del universo', () => {
    const { fuente } = renderizar({ resaltados: new Set(['C2', 'C3']) })
    const features = (fuente(FUENTE_UNIVERSO)?.data as { features: { properties: Record<string, unknown> }[] }).features

    expect(features).toHaveLength(265)
    expect(features.filter((f) => f.properties.resaltada)).toHaveLength(2)
  })

  it('las referencias excluyen las escuelas del universo', () => {
    const { fuente } = renderizar()

    const primarias = fuente(FUENTE_OTRAS_PRIMARIAS)?.data as { features: { properties: { cue: string } }[] }
    const secundarias = fuente(FUENTE_SECUNDARIAS)?.data as { features: { properties: { cue: string } }[] }
    expect(primarias.features.map((f) => f.properties.cue)).toEqual(['R1'])
    expect(secundarias.features.map((f) => f.properties.cue)).toEqual(['R2'])
  })

  it('usa la zona completa de 20 km, no el listado filtrado', () => {
    const { fuente } = renderizar({ hayFiltroActivo: true, idsCoincidentes: new Set() })
    const zonas = fuente(FUENTE_ZONAS)?.data as { features: { properties: { id: number } }[] }

    expect(zonas.features.map((f) => f.properties.id)).toEqual([1])
  })

  it('la etiqueta de selección sólo existe con una escuela seleccionada', () => {
    expect(renderizar().ids).not.toContain(CAPA_ETIQUETA_SELECCION)
    expect(renderizar().ids).not.toContain(CAPA_SELECCION)

    const { ids, capa, fuente } = renderizar({ seleccionada: 'C3' })
    expect(ids).toEqual([
      CAPA_ZONAS,
      CAPA_OTRAS_PRIMARIAS,
      CAPA_SECUNDARIAS,
      CAPA_UNIVERSO,
      CAPA_SELECCION,
      CAPA_ETIQUETA_SELECCION,
    ])
    expect(capa(CAPA_ETIQUETA_SELECCION)?.layout).toMatchObject({ 'text-field': ['get', 'nombre'] })
    expect(fuente(FUENTE_SELECCION)?.data).toEqual({
      type: 'FeatureCollection',
      features: [
        expect.objectContaining({ properties: { cue: 'C3', nombre: 'Escuela 3' } }),
      ],
    })
  })

  it('dibuja el recorrido con trazado y puntos, sin línea cuando no hay geometría', () => {
    const origen = { nombre: 'Origen', lat: -27.4, lon: -58.8 }
    const destino = { nombre: 'Destino', lat: -27.5, lon: -58.7 }
    const trazado = {
      type: 'LineString' as const,
      coordinates: [[-58.8, -27.4], [-58.7, -27.5]] as [number, number][],
    }

    const conTrazado = renderizar({ recorrido: { origen, destino, geometria: trazado } })
    expect(conTrazado.ids).toEqual([
      CAPA_ZONAS,
      CAPA_OTRAS_PRIMARIAS,
      CAPA_SECUNDARIAS,
      CAPA_UNIVERSO,
      CAPA_RECORRIDO_TRAZADO,
      CAPA_RECORRIDO_PUNTOS,
    ])
    expect((conTrazado.fuente(FUENTE_RECORRIDO)?.data as { features: unknown[] }).features).toHaveLength(3)

    const sinTrazado = renderizar({ recorrido: { origen, destino, geometria: null } })
    expect((sinTrazado.fuente(FUENTE_RECORRIDO)?.data as { features: unknown[] }).features).toHaveLength(2)
  })

  it('sin recorrido no crea su fuente', () => {
    expect(renderizar().fuente(FUENTE_RECORRIDO)).toBeUndefined()
  })

  it('el tema oscuro cambia la pintura del universo', () => {
    const { capa } = renderizar({ tema: 'oscuro' })

    expect(capa(CAPA_UNIVERSO)?.paint).toEqual(paintUniverso({ oscuro: true }))
  })
})
