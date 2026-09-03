// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import ForbiddenPage from './page'

const router = vi.hoisted(() => ({ back: vi.fn(), replace: vi.fn() }))
const signOut = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('next/link', async () => {
  const { NextLink } = await import('@/lib/test-helpers/next-link')
  return { default: NextLink }
})
vi.mock('next/navigation', () => ({ useRouter: () => router }))
vi.mock('@/lib/auth-client', () => ({
  authClient: { signOut: () => signOut() },
}))

beforeEach(() => {
  router.back.mockClear()
  router.replace.mockClear()
  signOut.mockClear()
})

afterEach(() => cleanup())

describe('forbidden page', () => {
  it('offers safe exits but never re-navigates to the denied target', async () => {
    const element = await ForbiddenPage({
      searchParams: Promise.resolve({ next: '/recursos/abc' }),
    })
    render(element as ReactElement)

    expect(screen.getByRole('button', { name: 'Volver' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir al catálogo' })).toHaveAttribute(
      'href',
      '/explorar',
    )
    expect(screen.getByRole('button', { name: 'Cambiar de cuenta' })).toBeInTheDocument()

    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href')).not.toBe('/recursos/abc')
    }
  })

  it('Volver goes to the previous page instead of the denied resource', async () => {
    const element = await ForbiddenPage({
      searchParams: Promise.resolve({ next: '/recursos/abc' }),
    })
    render(element as ReactElement)
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
    expect(router.back).toHaveBeenCalledTimes(1)
  })

  it('Cambiar de cuenta signs out and routes to login with a validated callback', async () => {
    const element = await ForbiddenPage({
      searchParams: Promise.resolve({ next: '/recursos/abc' }),
    })
    render(element as ReactElement)
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar de cuenta' }))
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(
        '/login?callbackUrl=%2Frecursos%2Fabc',
      ),
    )
  })

  it('falls back to a plain /login callback when the destination is not internal', async () => {
    const element = await ForbiddenPage({
      searchParams: Promise.resolve({ next: '//evil.example' }),
    })
    render(element as ReactElement)
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar de cuenta' }))
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'))
  })

  it('announces when the account switch fails without navigating', async () => {
    signOut.mockRejectedValueOnce(new Error('offline'))
    const element = await ForbiddenPage({ searchParams: Promise.resolve({}) })
    render(element as ReactElement)
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar de cuenta' }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'No se pudo cambiar de cuenta',
      ),
    )
    expect(router.replace).not.toHaveBeenCalled()
  })
})