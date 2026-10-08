// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MetodologiaInundacion } from './metodologia-inundacion'

describe('MetodologiaInundacion', () => {
  it('explica fuentes, clases, umbral y limitaciones en un único lugar', () => {
    render(<MetodologiaInundacion />)

    expect(screen.getByRole('heading', { name: 'Metodología: inundación' })).toBeTruthy()
    expect(screen.getByText(/JRC Global River Flood Hazard Maps v2\.1/)).toBeTruthy()
    expect(screen.getByText(/JRC Global Surface Water/)).toBeTruthy()
    expect(screen.getByText(/Copernicus DEM GLO-30/)).toBeTruthy()
    expect(screen.getByText(/0,15 m/)).toBeTruthy()
    expect(screen.getByText('Alto:', { exact: false })).toBeTruthy()
    expect(screen.getByText('Medio:', { exact: false })).toBeTruthy()
    expect(screen.getByText('Bajo:', { exact: false })).toBeTruthy()
    expect(screen.getByText('Sin riesgo:', { exact: false })).toBeTruthy()
    expect(screen.getByText(/Nunca se muestra como Bajo ni como Sin riesgo/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Junto a laguna' })).toBeTruthy()
    expect(screen.getByText(/25 % del tiempo/)).toBeTruthy()
    expect(screen.getByText(/270 m/)).toBeTruthy()
    expect(screen.getByText(/Las capas de JRC no incluyen defensas/)).toBeTruthy()
    expect(screen.getByText(/Los accesos cortados por lagunas no se detectan/)).toBeTruthy()
    expect(screen.getByText(/No es un pronóstico/)).toBeTruthy()
  })
})
