// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { AlertasSeccion } from './alertas-seccion'
import { agruparAlertas, type AlertaRadar } from '@/lib/infraestructura/radar-meteo/alertas-agrupadas'
import { regionPublicaActual } from '@/lib/infraestructura/region/publica'

afterEach(cleanup)

const alertaSinDepartamentos: AlertaRadar = {
  id: 'alerta-sin-depto', nivelSat: 'yellow', severidad: 'Moderada', evento: 'Tormentas',
  headline: 'Alerta de tormentas', description: null, instruction: null,
  onset: '2026-10-07T18:00:00Z', expires: '2026-10-08T06:00:00Z', departamentos: [],
}

describe('AlertasSeccion sin departamentos', () => {
  it('muestra el nombre de la región activa como ámbito por defecto', () => {
    const grupos = agruparAlertas([alertaSinDepartamentos], Date.parse('2026-10-06T15:00:00Z'))
    render(<AlertasSeccion grupos={grupos} cargando={false} error={false} claveSeleccionada={null} onSeleccionar={vi.fn()} />)

    expect(regionPublicaActual().nombre).toBe('Corrientes')
    expect(screen.getByText('Corrientes')).toBeInTheDocument()
  })
})
