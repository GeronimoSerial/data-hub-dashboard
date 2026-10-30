// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect, type ReactNode } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BASEMAPS } from '@/lib/map-types'
import { CAPA_SECUNDARIAS, CAPA_UNIVERSO, CAPA_ZONAS, ETIQUETAS_CAPAS } from '@/lib/reorganizacion/capas'
import type { CoberturaV29, DatasetV29, EscuelaV29, ReferenciaV29 } from '@/lib/reorganizacion/tipos'

const { MAPA, MAPA_PROPS, CAPAS_PROPS, DATASET } = vi.hoisted(() => ({
  MAPA: { flyTo: vi.fn(), resize: vi.fn(), fitBounds: vi.fn(), stop: vi.fn() },
  MAPA_PROPS: { current: {} as Record<string, unknown> },
  CAPAS_PROPS: { current: {} as Record<string, unknown> },
  DATASET: { current: undefined as unknown },
}))

vi.mock('@/components/mapas/reorganizacion/use-dataset-reorganizacion', () => ({
  useDatasetReorganizacion: () => ({ estado: 'listo', dataset: DATASET.current, reintentar: () => undefined }),
}))

// El mapa real necesita MapLibre; el doble expone sus props y el objeto de mapa.
vi.mock('@/components/mapas/map-reorganizacion-page', () => ({
  default: function MapaStub(props: { panel?: ReactNode; children?: ReactNode; onMapLoad?: (m: unknown) => void }) {
    MAPA_PROPS.current = props as Record<string, unknown>
    const { onMapLoad } = props
    useEffect(() => {
      onMapLoad?.(MAPA)
    }, [onMapLoad])
    return (
      <div data-testid="mapa">
        {props.panel}
        {props.children}
      </div>
    )
  },
}))

vi.mock('@/components/mapas/reorganizacion/capas-reorganizacion', () => ({
  CapasReorganizacion: (props: Record<string, unknown>) => {
    CAPAS_PROPS.current = props
    return null
  },
}))

vi.mock('@/components/mapas/reorganizacion/ficha-escuela', () => ({
  FichaEscuela: (props: {
    escuela: EscuelaV29
    onCerrar: () => void
    onAcercar: (cue: string) => void
    recorridoActivo: boolean
  }) => (
    <div data-testid="ficha-escuela">
      <span>{props.escuela.cue}</span>
      <button onClick={props.onCerrar}>cerrar ficha escuela</button>
      <button onClick={() => props.onAcercar(props.escuela.cue)}>acercar escuela</button>
    </div>
  ),
}))

vi.mock('@/components/mapas/reorganizacion/ficha-referencia', () => ({
  FichaReferencia: (props: { referencia: ReferenciaV29 }) => (
    <div data-testid="ficha-referencia">{props.referencia.cue}</div>
  ),
}))

vi.mock('@/components/mapas/reorganizacion/ficha-zona', () => ({
  FichaZona: (props: { etiqueta: string; miembros: EscuelaV29[] }) => (
    <div data-testid="ficha-zona">
      <span>{props.etiqueta}</span>
      <span>{`miembros:${props.miembros.length}`}</span>
    </div>
  ),
}))

import { ContenedorReorganizacion } from './contenedor-reorganizacion'

const BASE = {
  ambito: '',
  cui: '',
  jurisdiccion: '',
  modalidad: '',
  historia: {},
  pof: {},
  sueldosTotal: null,
  personasSueldos: null,
  clasificacionZonaSueldos: null,
  localidad: 'Corrientes',
  departamento: 'Capital',
  matricula: 100,
  lat: -27.4,
  lon: -58.8,
  agentes: 0,
  zona: 'Zona 1',
}

function escuela(cue: string, nombre: string, extra: Partial<EscuelaV29> = {}): EscuelaV29 {
  return { ...BASE, cue, nombre, ...extra } as EscuelaV29
}

const ESCUELA_A = escuela('1800001', 'Escuela Alfa', { clasificacionZonaSueldos: 'A' })
const ESCUELA_B = escuela('1800002', 'Escuela Beta', { zona: 'Zona 2', clasificacionZonaSueldos: 'B' })
const ESCUELA_C = escuela('1800003', 'Escuela Gamma', {
  zona: 'Zona 2',
  departamento: 'Goya',
  localidad: 'Goya',
  agentes: 2,
  matricula: 50,
})

function construirDataset(): DatasetV29 {
  return {
    version: 'V29',
    corte: '2026-10-28',
    escuelas: [ESCUELA_A, ESCUELA_B, ESCUELA_C],
    referencias: [
      { cue: '1800009', nombre: 'Referencia Nueve', lat: -27.5, lon: -58.9, primaria: true, secundaria: false, matriculaPrimaria: 30, localidad: 'Corrientes', departamento: 'Capital' },
    ],
    ofertaPorCue: {},
    centros: [
      { id: 1, lat: -27.4, lon: -58.8 },
      { id: 2, lat: -27.6, lon: -58.6 },
    ],
    cobertura: { historiaPorAnio: {} } as unknown as CoberturaV29,
  }
}

function capas() {
  return CAPAS_PROPS.current as {
    idsCoincidentes: Set<string>
    hayFiltroActivo: boolean
    resaltados: Set<string>
    seleccionada: string | null
    visibles: { zonas: boolean; otrasPrimarias: boolean; secundarias: boolean }
    recorrido: unknown
    dataset: DatasetV29
  }
}

function clicEnMapa(features: { layer: string; properties: Record<string, unknown> }[]) {
  const onMapClick = MAPA_PROPS.current.onMapClick as (e: unknown) => void
  act(() => {
    onMapClick({ features: features.map((f) => ({ layer: { id: f.layer }, properties: f.properties })) })
  })
}

beforeEach(() => {
  DATASET.current = construirDataset()
  CAPAS_PROPS.current = {}
  MAPA.flyTo.mockReset()
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ContenedorReorganizacion', () => {
  it('filtrar reduce el listado y los indicadores, pero las capas reciben el universo completo', async () => {
    const usuario = userEvent.setup()
    render(<ContenedorReorganizacion />)

    await usuario.type(screen.getByLabelText('Buscar'), 'Gamma')

    expect(screen.getByText(/^Mostrando 1 de 1 establecimientos/)).toBeTruthy()
    expect(capas().dataset.escuelas).toHaveLength(3)
    expect(capas().hayFiltroActivo).toBe(true)
    expect([...capas().idsCoincidentes]).toEqual(['1800003'])
  })

  it('cambiar la clasificación cambia los resaltados pero no el listado filtrado', async () => {
    const usuario = userEvent.setup()
    render(<ContenedorReorganizacion />)

    await usuario.click(screen.getByRole('combobox', { name: 'Resaltar clasificación salarial' }))
    await usuario.click(await screen.findByRole('option', { name: 'B' }))

    expect(screen.getByText('Mostrando 3 de 3 establecimientos')).toBeTruthy()
    expect([...capas().resaltados]).toEqual(['1800002'])
    expect(capas().hayFiltroActivo).toBe(false)
  })

  it('clic en una escuela abre su ficha y el cierre la quita', async () => {
    const usuario = userEvent.setup()
    render(<ContenedorReorganizacion />)

    clicEnMapa([{ layer: CAPA_UNIVERSO, properties: { cue: '1800001' } }])
    expect(screen.getByTestId('ficha-escuela').textContent).toContain('1800001')
    expect(capas().seleccionada).toBe('1800001')

    await usuario.click(screen.getByRole('button', { name: 'cerrar ficha escuela' }))
    expect(screen.queryByTestId('ficha-escuela')).toBeNull()
    expect(capas().seleccionada).toBeNull()
  })

  it('clic en zona muestra la ficha con la zona completa aunque el listado esté filtrado', async () => {
    const usuario = userEvent.setup()
    render(<ContenedorReorganizacion />)

    await usuario.type(screen.getByLabelText('Buscar'), 'Gamma')
    clicEnMapa([{ layer: CAPA_ZONAS, properties: { id: 2 } }])

    expect(screen.getByTestId('ficha-zona').textContent).toContain('Zona 2')
    expect(screen.getByText('miembros:2')).toBeTruthy()
  })

  it('clic sin entidad cierra la selección', () => {
    render(<ContenedorReorganizacion />)
    clicEnMapa([{ layer: CAPA_UNIVERSO, properties: { cue: '1800002' } }])
    expect(screen.getByTestId('ficha-escuela')).toBeTruthy()

    clicEnMapa([])
    expect(screen.queryByTestId('ficha-escuela')).toBeNull()
  })

  it('en medición de origen un clic en escuela elige el punto y no abre la ficha', async () => {
    const usuario = userEvent.setup()
    render(<ContenedorReorganizacion />)

    await usuario.click(screen.getByRole('tab', { name: 'Recorrido' }))
    await usuario.click(screen.getByRole('button', { name: 'Medir recorrido' }))
    clicEnMapa([{ layer: CAPA_UNIVERSO, properties: { cue: '1800001' } }])

    expect(screen.queryByTestId('ficha-escuela')).toBeNull()
    expect(screen.getByText('Elija el destino en el mapa o en el listado.')).toBeTruthy()
  })

  it('"Acercar" vuela al establecimiento con el zoom de acercamiento', async () => {
    const usuario = userEvent.setup()
    render(<ContenedorReorganizacion />)

    clicEnMapa([{ layer: CAPA_UNIVERSO, properties: { cue: '1800002' } }])
    await usuario.click(screen.getByRole('button', { name: 'acercar escuela' }))

    expect(MAPA.flyTo).toHaveBeenCalledWith({ center: [-58.8, -27.4], zoom: 12 })
  })

  it('alternar una capa cambia visibles y las capas interactivas', async () => {
    const usuario = userEvent.setup()
    render(<ContenedorReorganizacion />)

    await usuario.click(screen.getByRole('tab', { name: 'Capas' }))
    await usuario.click(screen.getByRole('switch', { name: ETIQUETAS_CAPAS.secundarias }))

    expect(capas().visibles.secundarias).toBe(false)
    expect((MAPA_PROPS.current.interactiveLayerIds as string[])).not.toContain(CAPA_SECUNDARIAS)
  })

  it('cambiar el fondo cambia el estilo base del mapa', async () => {
    const usuario = userEvent.setup()
    render(<ContenedorReorganizacion />)

    await usuario.click(screen.getByRole('tab', { name: 'Capas' }))
    await usuario.click(screen.getByText(BASEMAPS.positron.label))

    expect(MAPA_PROPS.current.mapStyle).toBe(BASEMAPS.positron.styleUrl)
  })

  it('sin datos no renderiza capas ni panel', () => {
    DATASET.current = undefined
    render(<ContenedorReorganizacion />)
    expect(CAPAS_PROPS.current).toEqual({})
    expect(screen.queryByText(/Mostrando/)).toBeNull()
    expect(screen.getByTestId('mapa')).toBeTruthy()
  })
})
