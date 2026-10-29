// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { limpiarCacheSeries, TarjetaEstacionRio, type EstacionTarjeta } from './tarjeta-estacion-rio'

const LECTURAS = [
  { medidaEn: '2026-10-20T12:00:00Z', lecturaM: 7.1, inconsistente: false },
  { medidaEn: '2026-10-21T12:00:00Z', lecturaM: 7.4, inconsistente: false },
  { medidaEn: '2026-10-22T12:00:00Z', lecturaM: 7.8, inconsistente: false },
]

const FALLA = { ok: false, status: 500, json: async () => ({}) }
const OK = { ok: true, status: 200, json: async () => ({ lecturas: LECTURAS }) }

const estacion = (ultimaMedidaEn: string): EstacionTarjeta => ({
  estacionId: 'parana-1',
  nombre: 'Paraná',
  rio: 'parana',
  estado: 'normal',
  vencida: false,
  lectura: { lecturaM: 7.8, medidaEn: ultimaMedidaEn, alertaM: 7.9, evacuacionM: 10.8, inconsistente: false },
})

const NOTA_RESPALDO = 'No se pudo actualizar la serie; se muestran los últimos datos disponibles.'

// Deja correr el reintento (1,5 s) y las promesas pendientes.
const asentar = () => act(async () => {
  await vi.advanceTimersByTimeAsync(1500)
})

const fetchMock = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  limpiarCacheSeries()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  limpiarCacheSeries()
})

describe('TarjetaEstacionRio serie', () => {
  it('reintenta una vez tras un fallo transitorio y dibuja la serie', async () => {
    fetchMock.mockResolvedValueOnce(FALLA).mockResolvedValueOnce(OK)
    render(<TarjetaEstacionRio estacion={estacion('2026-10-22T12:00:00Z')} onCerrar={() => {}} />)
    await asentar()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('img', { name: /Altura del río/ })).toBeInTheDocument()
    expect(screen.queryByText(NOTA_RESPALDO)).not.toBeInTheDocument()
  })

  it('muestra la última serie cargada con una nota cuando la recarga falla dos veces', async () => {
    fetchMock.mockResolvedValueOnce(OK)
    const { rerender } = render(<TarjetaEstacionRio estacion={estacion('2026-10-22T12:00:00Z')} onCerrar={() => {}} />)
    await asentar()
    expect(screen.getByRole('img', { name: /Altura del río/ })).toBeInTheDocument()

    fetchMock.mockResolvedValue(FALLA)
    rerender(<TarjetaEstacionRio estacion={estacion('2026-10-23T12:00:00Z')} onCerrar={() => {}} />)
    await asentar()

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(screen.getByText(NOTA_RESPALDO)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Altura del río/ })).toBeInTheDocument()
    expect(screen.queryByText('No se pudo cargar la serie.')).not.toBeInTheDocument()
  })

  it('muestra el error cuando no hay serie previa y la carga falla dos veces', async () => {
    fetchMock.mockResolvedValue(FALLA)
    render(<TarjetaEstacionRio estacion={estacion('2026-10-22T12:00:00Z')} onCerrar={() => {}} />)
    await asentar()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.getByText('No se pudo cargar la serie.')).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: /Altura del río/ })).not.toBeInTheDocument()
    expect(screen.queryByText(NOTA_RESPALDO)).not.toBeInTheDocument()
  })
})
