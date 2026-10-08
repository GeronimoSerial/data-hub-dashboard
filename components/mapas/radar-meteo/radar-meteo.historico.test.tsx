// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { RespuestaRadarMeteo } from '@/lib/infraestructura/radar-meteo/use-radar-meteo'
import type { CorridaRadarMeteo } from '@/lib/infraestructura/radar-meteo/use-corridas-radar-meteo'

const estado = vi.hoisted(() => ({
  corridas: [] as CorridaRadarMeteo[],
  cargandoCorridas: false,
  llamadasRadar: [] as Array<{ asOf?: string }>,
}))

vi.mock('@/lib/infraestructura/radar-meteo/use-radar-meteo', () => ({
  useRadarMeteo: (opciones: { asOf?: string }) => {
    estado.llamadasRadar.push({ asOf: opciones.asOf })
    return { data: { sinDatos: true, razon: 'Sin datos de prueba.' } as unknown as RespuestaRadarMeteo, loading: false, error: null }
  },
}))

vi.mock('@/lib/infraestructura/radar-meteo/use-corridas-radar-meteo', () => ({
  useCorridasRadarMeteo: () => ({
    data: estado.corridas.length || estado.cargandoCorridas ? { corridas: estado.corridas } : null,
    loading: estado.cargandoCorridas,
    error: null,
  }),
}))

vi.mock('react-map-gl/maplibre', async () => {
  const React = await import('react')
  return {
    Layer: () => null,
    Marker: () => null,
    Source: (props: { children?: React.ReactNode }) => <>{props.children}</>,
  }
})

import { RadarMeteo } from './radar-meteo'

const CORRIDA_NUEVA: CorridaRadarMeteo = { id: 'run-2', runAt: '2026-10-07T18:00:00Z', fetchedAt: '2026-10-07T21:27:00Z' }
const CORRIDA_ANTERIOR: CorridaRadarMeteo = { id: 'run-1', runAt: '2026-10-07T12:00:00Z', fetchedAt: '2026-10-07T15:10:00Z' }

function renderRadar() {
  return render(
    <RadarMeteo
      activo
      variable="lluvia"
      resumen={null}
      alertasResaltadas={[]}
      onVerAlertas={() => undefined}
    />,
  )
}

describe('RadarMeteo — historico de pronosticos publicados', () => {
  beforeEach(() => {
    estado.corridas = []
    estado.cargandoCorridas = false
    estado.llamadasRadar.length = 0
  })

  afterEach(() => {
    cleanup()
  })

  it('oculta el selector cuando no hay corridas', () => {
    renderRadar()

    expect(screen.queryByRole('combobox', { name: 'Pronóstico publicado' })).not.toBeInTheDocument()
  })

  it('lista las corridas y pide el pronostico de la elegida con asOf', () => {
    estado.corridas = [CORRIDA_NUEVA, CORRIDA_ANTERIOR]
    renderRadar()

    const selector = screen.getByRole('combobox', { name: 'Pronóstico publicado' })
    expect(screen.getByRole('option', { name: 'Último pronóstico' })).toBeInTheDocument()
    expect(within(selector).getAllByRole('option')).toHaveLength(3)
    expect(estado.llamadasRadar.at(-1)?.asOf).toBeUndefined()

    fireEvent.change(selector, { target: { value: CORRIDA_ANTERIOR.fetchedAt } })

    expect(estado.llamadasRadar.at(-1)?.asOf).toBe(CORRIDA_ANTERIOR.fetchedAt)
  })

  it('muestra el aviso de pronostico pasado y "Volver al último" restaura la corrida mas reciente', () => {
    estado.corridas = [CORRIDA_NUEVA, CORRIDA_ANTERIOR]
    renderRadar()

    fireEvent.change(screen.getByRole('combobox', { name: 'Pronóstico publicado' }), { target: { value: CORRIDA_ANTERIOR.fetchedAt } })

    expect(screen.getByRole('status')).toHaveTextContent('Estás viendo el pronóstico publicado el')
    expect(screen.queryByText(/desactualizado/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Volver al último' }))

    expect(estado.llamadasRadar.at(-1)?.asOf).toBeUndefined()
    expect(screen.queryByRole('button', { name: 'Volver al último' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Pronóstico publicado' })).toHaveValue('')
  })
})
