// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CuadernillosDevNotice } from './dev-notice'

describe('CuadernillosDevNotice', () => {
  it('opens on entry with the development notice and closes on acknowledge', async () => {
    render(<CuadernillosDevNotice />)
    expect(await screen.findByRole('dialog', { name: 'Sección en desarrollo' })).toBeInTheDocument()
    expect(screen.getByText('Esta sección se encuentra en desarrollo y todavía no está lista para su uso.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Entendido' }))
    expect(screen.queryByRole('dialog', { name: 'Sección en desarrollo' })).not.toBeInTheDocument()
  })
})
