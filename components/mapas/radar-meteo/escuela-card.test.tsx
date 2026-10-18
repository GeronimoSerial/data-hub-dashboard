// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { PronosticoEscuelaBloque } from './escuela-card'

describe('tarjeta de pronóstico puntual', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it('presenta lluvia horaria, acumulados diarios y ráfaga desde el fixture', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        cueAnexo: '180000100', nombre: 'Escuela Rural', departamento: { nombre: 'Capital' },
        horas: [{ hora: '2026-10-01T15:00:00Z', lluviaMm: { valor: 4 }, rafagaKmh: { valor: 33.567633422 } }],
        dias: [
          { fecha: '2026-10-01', lluviaMm: 42.111896 },
          { fecha: '2026-10-02', lluviaMm: 0.806715 },
          { fecha: '2026-10-03', lluviaMm: 0 },
          { fecha: '2026-10-04', lluviaMm: 2.25 },
          { fecha: '2026-10-05', lluviaMm: 1 },
          { fecha: '2026-10-06', lluviaMm: null },
          { fecha: '2026-10-07', lluviaMm: 7 },
        ],
        frescura: { edadMinutos: 12 }, contextoEnsamble: { probabilidad25: 0.38 },
      }),
    }))
    const { container } = render(<PronosticoEscuelaBloque cueAnexo="180000100" />)
    await waitFor(() => expect(screen.getByText(/Ráfaga máxima/)).toBeInTheDocument())
    expect(screen.getByText(/Ráfaga máxima: 34 km\/h/)).toBeInTheDocument()
    expect(screen.getByText('42,1')).toBeInTheDocument()
    expect(screen.getByText('0,8')).toBeInTheDocument()
    expect(screen.getByText('2,3')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(container.querySelectorAll('.pronostico-escuela__dias > span')).toHaveLength(7)
    expect(screen.getByText(/Probabilidad de más de 25 mm: 38 %/)).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/P≥25|ensamble/i)
  })

  it('muestra un estado explícito cuando el pronóstico puntual está seco en 48 h', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        cueAnexo: '180000100', nombre: 'Escuela Rural', departamento: { nombre: 'Capital' },
        horas: [{ hora: '2026-10-01T15:00:00Z', lluviaMm: { valor: 0.04 }, rafagaKmh: { valor: null } }],
        dias: [],
      }),
    }))
    render(<PronosticoEscuelaBloque cueAnexo="180000100" />)
    expect(await screen.findByText('Sin lluvia prevista en 48 h')).toBeInTheDocument()
    expect(screen.queryByLabelText('Lluvia por hora, próximas 48 horas')).toBeNull()
    expect(screen.queryByText(/Actualizado hace|hace — min/)).not.toBeInTheDocument()
  })

  it('oculta la probabilidad departamental menor a cinco por ciento', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        cueAnexo: '180000100', nombre: 'Escuela Rural', departamento: { nombre: 'Capital' },
        horas: [], dias: [], contextoEnsamble: { probabilidad25: 0.04 },
      }),
    }))
    render(<PronosticoEscuelaBloque cueAnexo="180000100" />)
    await waitFor(() => expect(screen.getByText(/Ráfaga máxima/)).toBeInTheDocument())
    expect(screen.queryByText(/P≥25 mm en el departamento/)).not.toBeInTheDocument()
  })
})
