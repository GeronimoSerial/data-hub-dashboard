// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MetodologiaReorganizacion } from './metodologia-reorganizacion'
import type { DatasetV29, EscuelaV29 } from '@/lib/reorganizacion/tipos'

afterEach(cleanup)

// Cifras distintas de las habituales a propósito: el texto debe salir del dataset.
function escuela(cue: string, zona: string): EscuelaV29 {
  return {
    cue,
    nombre: `ESCUELA ${cue}`,
    departamento: 'CAPITAL',
    localidad: 'Corrientes',
    ambito: 'Urbano',
    cui: '',
    jurisdiccion: '',
    modalidad: 'Común',
    matricula: 4,
    historia: { '2023': 4, '2026': 5 },
    lat: -27.4,
    lon: -58.8,
    pof: {},
    agentes: 0,
    zona,
    sueldosTotal: null,
    personasSueldos: null,
    clasificacionZonaSueldos: null,
  }
}

function datasetDePrueba(parcial: Partial<DatasetV29> = {}): DatasetV29 {
  return {
    version: 'V29',
    corte: '2026-10-28',
    escuelas: [escuela('1', 'Zona 1'), escuela('2', 'Aislado')],
    referencias: [
      { cue: '1', nombre: 'A', lat: -27.4, lon: -58.8, primaria: true, secundaria: false, matriculaPrimaria: 4, localidad: 'X', departamento: 'CAPITAL' },
      { cue: '2', nombre: 'B', lat: -27.4, lon: -58.8, primaria: true, secundaria: true, matriculaPrimaria: null, localidad: 'Y', departamento: 'CAPITAL' },
    ],
    ofertaPorCue: { '1': {}, '2': {}, '3': {} },
    centros: [
      { id: 1, lat: -27.4, lon: -58.8 },
      { id: 38, lat: -27.5, lon: -58.9 },
      { id: 60, lat: -27.6, lon: -59 },
    ],
    cobertura: {
      escuelas: 2345,
      alumnos: 9876,
      conCoordenadas: 2344,
      conImportePositivo: 2100,
      conRegistrosPof: 0,
      centros: 3,
      zonasOcupadas: 1,
      historiaPorAnio: { '2023': 1111, '2026': 2222 },
    },
    ...parcial,
  }
}

async function abrir() {
  fireEvent.click(screen.getByRole('button', { name: 'Metodología' }))
  return screen.findByRole('dialog')
}

describe('MetodologiaReorganizacion', () => {
  it('abre el diálogo y muestra las cifras leídas del dataset', async () => {
    render(<MetodologiaReorganizacion dataset={datasetDePrueba()} />)

    const dialogo = await abrir()

    expect(dialogo).toHaveTextContent('Metodología de la reorganización')
    expect(screen.getByText('28/10/2026')).toBeInTheDocument()
    expect(screen.getByText('2.345')).toBeInTheDocument()
    expect(screen.getByText('9.876')).toBeInTheDocument()
    expect(screen.getByText('2.100')).toBeInTheDocument()
    expect(screen.getByText(/2023: 1\.111, 2026: 2\.222/)).toBeInTheDocument()
  })

  it('explica la POF vacía sin afirmar ausencia de personal', async () => {
    render(<MetodologiaReorganizacion dataset={datasetDePrueba()} />)

    await abrir()

    expect(screen.getByText(/ningún establecimiento/)).toBeInTheDocument()
    expect(screen.getByText(/Esto no indica ausencia de personal/)).toBeInTheDocument()
  })

  it('informa los límites de la economía y que no es ahorro', async () => {
    render(<MetodologiaReorganizacion dataset={datasetDePrueba()} />)

    await abrir()

    expect(screen.getByText(/no descuenta cargos a conservar o reubicar, transporte, adecuaciones ni costos del receptor/i)).toBeInTheDocument()
    expect(screen.getByText(/no un ahorro confirmado/)).toBeInTheDocument()
  })

  it('lista los centros sin establecimientos calculados desde el dataset', async () => {
    render(<MetodologiaReorganizacion dataset={datasetDePrueba()} />)

    await abrir()

    expect(screen.getByText('Centros sin establecimientos asignados: 38, 60.')).toBeInTheDocument()
    expect(screen.getByText(/Centros adicionales \(identificador mayor que 59\): 1\./)).toBeInTheDocument()
  })

  it('compara referencias con claves de oferta sin descartar la diferencia', async () => {
    render(<MetodologiaReorganizacion dataset={datasetDePrueba()} />)

    await abrir()

    expect(screen.getByText(/Referencias del corte: 2\. Claves de agregados de oferta: 3\./)).toBeInTheDocument()
  })

  it('se cierra con Escape', async () => {
    render(<MetodologiaReorganizacion dataset={datasetDePrueba()} />)

    const dialogo = await abrir()
    fireEvent.keyDown(dialogo, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
