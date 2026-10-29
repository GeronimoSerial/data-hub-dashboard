import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getSessionUser } from '@/lib/session'
import Page from './page'

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (destino: string) => {
    throw new Error(`REDIRECT:${destino}`)
  },
}))

beforeEach(() => vi.mocked(getSessionUser).mockReset())

function usuario(role: string, banned = false) {
  return { id: 'u1', role, banned, nivelJurIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }
}

describe('/links/admin', () => {
  it('manda al login, volviendo a esta página, cuando no hay sesión', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    await expect(Page()).rejects.toThrow('REDIRECT:/login?callbackUrl=/links/admin')
  })

  it.each(['consulta', 'operador_establecimiento'])('manda a /forbidden para el rol %s', async (role) => {
    vi.mocked(getSessionUser).mockResolvedValue(usuario(role) as never)
    await expect(Page()).rejects.toThrow('REDIRECT:/forbidden')
  })

  it('manda a /forbidden a un editor suspendido', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(usuario('editor', true) as never)
    await expect(Page()).rejects.toThrow('REDIRECT:/forbidden')
  })

  it.each(['admin', 'editor'])('muestra el formulario al rol %s', async (role) => {
    vi.mocked(getSessionUser).mockResolvedValue(usuario(role) as never)
    expect(await Page()).toBeTruthy()
  })
})
