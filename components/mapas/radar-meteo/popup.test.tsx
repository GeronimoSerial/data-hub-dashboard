// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { RespuestaRadarMeteo } from '@/lib/infraestructura/radar-meteo/use-radar-meteo'
import { PopupRadar } from './popup'

const data = {
  grid: { celdas: [{ lat: -27.46, lon: -58.83, fila: 0, columna: 0 }] },
  valores: {
    precipitation: [[2.25]],
    precipitation_probability: [[40]],
    wind_speed_10m: [[18]],
    wind_direction_10m: [[180]],
    wind_gusts_10m: [[35]],
    granizo: [[0]],
  },
} as unknown as RespuestaRadarMeteo

describe('PopupRadar', () => {
  afterEach(cleanup)

  it('muestra cada magnitud en su propia fila con etiqueta y valor', () => {
    render(<PopupRadar data={data} frame={0} index={0} paso={1} onClose={() => undefined} />)
    const dialogo = screen.getByRole('dialog', { name: 'Pronóstico en el punto seleccionado' })
    expect(within(dialogo).getByText('-27.46, -58.83')).toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: 'Cerrar' })).toBeInTheDocument()

    const filas = Object.fromEntries(Array.from(dialogo.querySelectorAll('dt')).map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]))
    expect(Object.keys(filas)).toEqual(['Lluvia (prob)', 'Lluvia (mm)', 'Viento', 'Granizo'])
    expect(filas['Lluvia (prob)']).toBe('40 %')
    expect(filas['Lluvia (mm)']).toBe('2.3 mm/h')
    expect(filas.Viento).toContain('18 km/h')
    expect(filas.Viento).toContain('ráfaga 35 km/h')
    expect(filas.Granizo).toBe('0')
  })
})
