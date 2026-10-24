// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NominalPermisosAdmin } from './nominal-permisos-admin'

const grant = { id: 'grant-1', userId: 'user-1', otorgadoPor: 'admin-1', otorgadoEn: '2026-09-01T10:00:00.000Z', venceEn: '2027-09-01T10:00:00.000Z', revocadoEn: null }
const users = { usuarios: [{ id: 'user-1', name: 'Ana Pérez', email: 'ana@example.com' }] }
const response = (body: unknown, ok = true) => ({ ok, json: async () => body })

function mockFetch(permisos: unknown, ...mutations: unknown[]) {
  const queues = {
    '/api/infraestructura/nominal/permisos': [
      permisos && typeof permisos === 'object' && 'json' in permisos ? permisos : response(permisos),
      ...mutations,
    ],
    '/api/usuarios': [response(users)],
  }
  const fetchMock = vi.fn((url: string, _options?: RequestInit) => Promise.resolve(queues[url.split('?')[0] as keyof typeof queues]?.shift() ?? response({ error: 'Respuesta inesperada' }, false)))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('NominalPermisosAdmin', () => {
  it('muestra los permisos vigentes de la API', async () => {
    mockFetch({ permisos: [grant] })
    render(<NominalPermisosAdmin />)
    expect(await screen.findByRole('cell', { name: 'Ana Pérez (ana@example.com)' })).toBeInTheDocument()
    expect(screen.getByText('Vigente')).toBeInTheDocument()
  })

  it('muestra el estado vacío', async () => {
    mockFetch({ permisos: [] })
    render(<NominalPermisosAdmin />)
    expect(await screen.findByText('No hay permisos nominales otorgados.')).toBeInTheDocument()
  })

  it('otorga con el cuerpo requerido y vuelve a cargar la lista', async () => {
    const fetchMock = mockFetch({ permisos: [] }, response({ permiso: grant }), response({ permisos: [grant] }))
    render(<NominalPermisosAdmin />)
    await screen.findByText('No hay permisos nominales otorgados.')
    fireEvent.click(await screen.findByRole('combobox', { name: 'Usuario' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Ana Pérez (ana@example.com)' }))
    fireEvent.change(screen.getByLabelText('Vence el'), { target: { value: '2027-09-01T10:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Otorgar acceso' }))
    await screen.findAllByText('Ana Pérez (ana@example.com)')
    const grantCall = fetchMock.mock.calls.find(([url, options]) => url === '/api/infraestructura/nominal/permisos' && options?.method === 'POST')
    expect(grantCall?.[1]).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' } })
    expect(JSON.parse(grantCall?.[1]?.body as string)).toEqual({ userId: 'user-1', venceEn: new Date('2027-09-01T10:00').toISOString() })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('revoca el permiso por id después de confirmar', async () => {
    const fetchMock = mockFetch({ permisos: [grant] }, response({ ok: true }), response({ permisos: [] }))
    render(<NominalPermisosAdmin />)
    await screen.findAllByText('Ana Pérez (ana@example.com)')
    fireEvent.click(screen.getByRole('button', { name: 'Revocar acceso' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar' }))
    await screen.findByText('No hay permisos nominales otorgados.')
    expect(fetchMock.mock.calls.find(([, options]) => options?.method === 'DELETE')).toEqual(['/api/infraestructura/nominal/permisos?id=grant-1', { method: 'DELETE' }])
  })

  it('muestra errores devueltos por la API', async () => {
    mockFetch(response({ error: 'Acceso denegado' }, false))
    render(<NominalPermisosAdmin />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Acceso denegado'))
  })

  it('no envía una fecha inválida y muestra un mensaje en español', async () => {
    const fetchMock = mockFetch({ permisos: [] })
    render(<NominalPermisosAdmin />)
    await screen.findByText('No hay permisos nominales otorgados.')
    fireEvent.click(await screen.findByRole('combobox', { name: 'Usuario' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Ana Pérez (ana@example.com)' }))
    fireEvent.change(screen.getByLabelText('Vence el'), { target: { value: 'fecha inválida' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Otorgar acceso' }).closest('form')!)
    expect(await screen.findByRole('alert')).toHaveTextContent('Ingrese una fecha de vencimiento válida.')
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false)
  })
})
