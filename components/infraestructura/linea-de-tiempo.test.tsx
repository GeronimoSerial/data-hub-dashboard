// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LineaDeTiempo, severidadDelMovimiento } from './linea-de-tiempo'
import type { DiffParte } from '@/lib/infraestructura/movimiento-diff'
import type { MovimientoHistorial } from './historial-movimiento'

const mov = (id: string, creadaEn: string, cambios: string[], severidad: MovimientoHistorial['severidad'] = null): MovimientoHistorial => ({
  id, tipo: 'actualizacion', rol: 'director', creadaEn, rigeDesde: creadaEn, cambios, severidad,
})
const movimientos = [
  mov('3', '2026-10-04T13:42:00.000Z', ['Se agregó "Evacuación preventiva" · Severidad Crítica'], 'Crítica'),
  mov('2', '2026-10-04T12:15:00.000Z', ['Sigue igual: "Inundación"']),
  mov('1', '2026-10-02T11:00:00.000Z', ['Se inició la situación "Inundación"'], 'Crítica'),
]

beforeEach(() => vi.setSystemTime(new Date('2026-10-04T18:00:00.000Z')))
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('LineaDeTiempo', () => {
  it('elige la mayor gravedad y tolera resúmenes antiguos incompletos', () => {
    const resumen = {
      afectacionesAgregadas: [{ severidad: 'Media' }, { severidad: 'Crítica' }],
      severidadesCambiadas: [{ a: 'Alta' }],
    } as unknown as DiffParte
    expect(severidadDelMovimiento(resumen)).toBe('Crítica')
    expect(severidadDelMovimiento({} as DiffParte)).toBeNull()
  })

  it('oculta confirmaciones sin cambios y el límite cuenta movimientos visibles', () => {
    render(<LineaDeTiempo movimientos={movimientos} limite={1} />)
    expect(screen.queryByText('Sigue igual: "Inundación"')).not.toBeInTheDocument()
    expect(screen.queryByText('Se inició la situación "Inundación"')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver movimientos anteriores (1)' }))
    expect(screen.getByText('Se inició la situación "Inundación"')).toBeInTheDocument()
  })

  it('agrupa cada movimiento con título destacado y detalles debajo', () => {
    render(<LineaDeTiempo movimientos={[mov('detallado', '2026-10-04T13:42:00.000Z', ['Funcionamiento escolar normal', '3 secciones incorporadas', '88 alumnos incorporados'])]} />)
    const entrada = document.querySelector('.linea-de-tiempo__entrada') as HTMLLIElement
    expect(entrada.querySelector('time')).toHaveTextContent('Hoy, 10:42')
    expect(entrada.querySelector('.linea-de-tiempo__titulo')?.tagName).toBe('P')
    expect(entrada.querySelector('.linea-de-tiempo__titulo')).toHaveTextContent('Funcionamiento escolar normal')
    expect(entrada.querySelectorAll('.linea-de-tiempo__detalles li')).toHaveLength(2)
  })

  it('muestra una fecha y hora unificadas por movimiento', () => {
    render(<LineaDeTiempo movimientos={movimientos} />)
    expect(document.querySelectorAll('.linea-de-tiempo__lista > li')).toHaveLength(2)
    expect(screen.getByText('Hoy, 10:42')).toBeInTheDocument()
    expect(screen.getByText('2 de octubre, 08:00')).toBeInTheDocument()
  })
})
