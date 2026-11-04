// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RenaperNatalidadPanel, type DatosRenaperNatalidad } from './renaper-natalidad-panel'

const datos: DatosRenaperNatalidad = {
  meta: { fuente: { nombre: 'RENAPER — Nacimientos identificados', url: 'https://estadisticas.renaper.gob.ar/app_myn/' }, corteFuente: '2026-09', extraidoEn: '2026-11-04', anios: [2024, 2025], metodologia: 'Registros administrativos de personas identificadas con DNI.' },
  provincia: { nombre: 'Corrientes', serie: { '2024': 12284, '2025': 12077 } },
  departamentos: { CONCEPCION: { nombre: 'CONCEPCION', serie: { '2024': 210, '2025': 200 } } },
  conciliacion: { '2024': { sumaDepartamentos: 12284, diferenciaProvincia: 0 }, '2025': { sumaDepartamentos: 12076, diferenciaProvincia: 1 } },
}

describe('RenaperNatalidadPanel', () => {
  it('muestra la serie provincial independiente hasta 2025 y advierte discrepancias', () => {
    render(<RenaperNatalidadPanel datos={datos} />)
    expect(screen.getByRole('row', { name: '2025 12.077 1' })).toBeTruthy()
    expect(screen.getByText(/No se empalma con DEIS/)).toBeTruthy()
    expect(screen.getByText(/diferencia publicada/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /RENAPER/ }).getAttribute('href')).toBe(datos.meta.fuente.url)
  })

  it('normaliza el departamento seleccionado y no inventa valores ausentes', () => {
    render(<RenaperNatalidadPanel datos={datos} departamento="Concepción" />)
    expect(within(screen.getByRole('row', { name: '2025 200' })).getByText('200')).toBeTruthy()
  })

  it('expone error de carga sin afectar la disponibilidad del mapa DEIS', () => {
    render(<RenaperNatalidadPanel datos={null} error />)
    expect(screen.getByText(/No se pudo cargar RENAPER/)).toBeTruthy()
  })
})
