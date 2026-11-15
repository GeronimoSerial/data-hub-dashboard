// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { CircuitGuide, ShipmentJourney, TaskCard } from './kit'

afterEach(() => { cleanup(); window.localStorage.clear() })

describe('guidance building blocks', () => {
  it('TaskCard states the pending action first', () => {
    render(<TaskCard title="Te llegó un envío" description="Confirmá qué recibiste." action={<button type="button">Confirmar</button>} />)
    const card = screen.getByRole('region', { name: 'Lo que tenés que hacer' })
    expect(card).toHaveTextContent('Te llegó un envío')
    expect(card).toHaveTextContent('Confirmá qué recibiste.')
  })

  it('ShipmentJourney shows each step with who confirmed it and marks the current one', () => {
    render(<ShipmentJourney steps={[
      { label: 'Enviado', state: 'done', detail: 'Planeamiento · 14/11' },
      { label: 'Llegó a la cabecera', state: 'current' },
      { label: 'Llegó a la escuela', state: 'pending' },
    ]} />)
    const items = screen.getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual(['✓EnviadoPlaneamiento · 14/11', '2Llegó a la cabeceraTodavía no', '3Llegó a la escuelaTodavía no'])
    expect(items[1]).toHaveAttribute('aria-current', 'step')
  })

  it('CircuitGuide explains the three steps and stays hidden after dismissing', () => {
    const { unmount } = render(<CircuitGuide />)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Entendido' }))
    expect(screen.queryByRole('complementary', { name: 'Cómo funciona' })).toBeNull()
    unmount()
    render(<CircuitGuide />)
    expect(screen.queryByRole('complementary', { name: 'Cómo funciona' })).toBeNull()
  })
})
