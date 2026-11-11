import { describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/acl'
import { callCenterGuard, callCenterPageGate } from './acceso'

const user = (role: string, banned = false) =>
  ({ id: 'u', role, banned, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] }) as unknown as SessionUser

describe('callCenterGuard / callCenterPageGate', () => {
  it.each(['admin', 'editor', 'admin_ge'])('permite a %s', (role) => {
    expect(callCenterGuard(user(role))).toBeNull()
    expect(callCenterPageGate(user(role))).toBe('ok')
  })

  it.each(['consulta', 'director_nivel', 'operador_establecimiento'])('rechaza a %s', (role) => {
    expect(callCenterGuard(user(role))?.status).toBe(403)
    expect(callCenterPageGate(user(role))).toBe('forbidden')
  })

  it('rechaza a un baneado aunque tenga el rol', () => {
    expect(callCenterGuard(user('admin_ge', true))?.status).toBe(403)
    expect(callCenterPageGate(user('admin', true))).toBe('forbidden')
  })

  it('pide login sin sesión', () => {
    expect(callCenterGuard(null)?.status).toBe(401)
    expect(callCenterPageGate(null)).toBe('login')
  })
})
