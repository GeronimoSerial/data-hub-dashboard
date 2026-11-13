import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getSessionUser: vi.fn() }))
vi.mock('@/lib/session', () => ({ getSessionUser: mocks.getSessionUser }))
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`) } }))
vi.mock('@/components/infraestructura/auditoria-visor', () => ({ AuditoriaVisor: () => null }))

import AuditoriaAdmin from './page'

describe('/admin/auditoria acceso', () => {
  beforeEach(() => {
    mocks.getSessionUser.mockReset()
  })

  it('redirige a login con callback cuando no hay sesión', async () => {
    mocks.getSessionUser.mockResolvedValue(null)
    await expect(AuditoriaAdmin()).rejects.toThrow('REDIRECT:/login?callbackUrl=/admin/auditoria')
  })

  it.each(['editor', 'consulta'])('el rol staff %s no es admin y queda fuera', async (role) => {
    mocks.getSessionUser.mockResolvedValue({ id: 'u1', role, banned: false, idioma: null })
    await expect(AuditoriaAdmin()).rejects.toThrow('REDIRECT:/forbidden')
  })

  it('no deja entrar a un admin bloqueado', async () => {
    mocks.getSessionUser.mockResolvedValue({ id: 'u1', role: 'admin', banned: true, idioma: null })
    await expect(AuditoriaAdmin()).rejects.toThrow('REDIRECT:/forbidden')
  })

  it('renderiza el visor dentro del idioma efectivo para el admin', async () => {
    mocks.getSessionUser.mockResolvedValue({ id: 'u1', role: 'admin', banned: false, idioma: null })
    const elemento = await AuditoriaAdmin()
    expect(elemento.props.idioma).toBe('es')
  })
})
