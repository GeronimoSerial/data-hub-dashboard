// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { SupervisorView } from './supervisor-view'

afterEach(() => {
  cleanup()
})

describe('SupervisorView', () => {
  it('points to the per-request decisions in the request list instead of a placeholder', () => {
    render(<SupervisorView page={{ items: [], nextCursor: null }} loading={false} error={null} onLoadMore={() => undefined} loadingMore={false} />)

    expect(screen.queryByText(/todavía no disponibles/i)).not.toBeInTheDocument()
    expect(screen.getByText(/solicitud por solicitud/i)).toHaveTextContent('Confirmar aprobación')
    expect(screen.getByText(/solicitud por solicitud/i)).toHaveTextContent('Solicitudes, más abajo')
  })

  it('offers no approval controls inside the assignment section', () => {
    render(<SupervisorView page={{ items: [], nextCursor: null }} loading={false} error={null} onLoadMore={() => undefined} loadingMore={false} />)

    expect(screen.queryByRole('button', { name: /aprobar|rechazar/i })).not.toBeInTheDocument()
  })
})
