// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LineaDeTiempo, agruparPorDia, severidadDelMovimiento } from './linea-de-tiempo'
import type { DiffParte } from '@/lib/infraestructura/movimiento-diff'
import type { MovimientoHistorial } from './historial-movimiento'

const AHORA = new Date('2026-10-04T18:00:00.000Z')
const mov = (id: string, creadaEn: string, cambios: string[], severidad: MovimientoHistorial['severidad'] = null): MovimientoHistorial => ({
  id, tipo: 'actualizacion', rol: 'director', creadaEn, rigeDesde: creadaEn, cambios, severidad,
})
const movimientos = [
  mov('3', '2026-10-04T13:42:00.000Z', ['Se agregó "Evacuación preventiva" · Severidad Crítica'], 'Crítica'),
  mov('2', '2026-10-04T12:15:00.000Z', ['Sigue igual: "Inundación"']),
  mov('1', '2026-10-02T11:00:00.000Z', ['Se inició el reporte por "Inundación"'], 'Crítica'),
]

afterEach(() => cleanup())

describe('agruparPorDia', () => {
  it('agrupa por día local con "Hoy" y "Ayer"', () => {
    expect(agruparPorDia(movimientos, AHORA).map((g) => g.dia)).toEqual(['Hoy, dom 04/10', 'vie 02/10'])
  })

  it('elige la mayor gravedad y tolera resúmenes antiguos incompletos', () => {
    const resumen = {
      afectacionesAgregadas: [{ severidad: 'Media' }, { severidad: 'Crítica' }],
      severidadesCambiadas: [{ a: 'Alta' }],
    } as unknown as DiffParte
    expect(severidadDelMovimiento(resumen)).toBe('Crítica')
    expect(severidadDelMovimiento({} as DiffParte)).toBeNull()
  })
})

describe('LineaDeTiempo', () => {
  it('con límite muestra las últimas N y pliega el resto', () => {
    render(<LineaDeTiempo movimientos={movimientos} limite={2} />)
    expect(screen.getByText('Sigue igual: "Inundación"')).toBeInTheDocument()
    expect(screen.queryByText('Se inició el reporte por "Inundación"')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver 1 movimiento anterior' }))
    expect(screen.getByText('Se inició el reporte por "Inundación"')).toBeInTheDocument()
  })
  it('muestra la hora de cada entrada', () => {
    render(<LineaDeTiempo movimientos={movimientos} />)
    expect(document.querySelectorAll('.linea-de-tiempo__lista > li')).toHaveLength(3)
    expect(screen.getAllByText(/^\d{2}:\d{2}$/)).toHaveLength(3)
  })
})
