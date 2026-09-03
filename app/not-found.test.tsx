// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import NotFound from './not-found'

vi.mock('next/link', async () => {
  const { NextLink } = await import('@/lib/test-helpers/next-link')
  return { default: NextLink }
})

afterEach(() => cleanup())

describe('not found', () => {
  it('provides navigation to Explore and Home with consistent copy', () => {
    render(<NotFound />)
    expect(screen.getByRole('heading', { name: 'No se encontró la página' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir a Explorar' })).toHaveAttribute('href', '/explorar')
    expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/')
  })
})