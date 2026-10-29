// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginAdmin } from './login-admin'

const refresh = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
afterEach(() => { cleanup(); vi.unstubAllGlobals(); refresh.mockReset() })

it.each(['/cadm', '/links'] as const)('login navega y envía al basePath %s', async (basePath) => {
  const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
  vi.stubGlobal('fetch', fetchMock)
  const user = userEvent.setup()
  render(<LoginAdmin basePath={basePath} />)
  expect(screen.getByRole('link', { name: /Volver a la página/ })).toHaveAttribute('href', basePath)
  await user.type(screen.getByLabelText('Usuario'), 'ana')
  await user.type(screen.getByLabelText('Contraseña'), 'clave-prueba')
  await user.click(screen.getByRole('button', { name: 'Ingresar' }))
  expect(fetchMock).toHaveBeenCalledWith(`${basePath}/api/sesion`, expect.objectContaining({ method: 'POST' }))
  expect(refresh).toHaveBeenCalledOnce()
})
