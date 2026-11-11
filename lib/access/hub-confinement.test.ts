import { describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/acl'
import { confinedAreaCapability, confinedPathAllowed, hubConfined } from './hub-confinement'

const user = (role: string, extra: Partial<SessionUser> = {}) =>
  ({ id: 'u', role, banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [], ...extra }) as SessionUser

describe('áreas del call center en el confinamiento', () => {
  it('admin_ge está confinado y puede entrar a /call-center', () => {
    const ge = user('admin_ge')
    expect(hubConfined(ge)).toBe(true)
    expect(confinedAreaCapability('/call-center')).toBe('callcenter.access')
    expect(confinedPathAllowed(ge, '/call-center')).toBe(true)
    expect(confinedPathAllowed(ge, '/call-center/')).toBe(true)
  })

  it('no abre rutas parecidas ni otras áreas del hub', () => {
    const ge = user('admin_ge')
    expect(confinedAreaCapability('/call-centers')).toBeNull()
    expect(confinedPathAllowed(ge, '/reportes')).toBe(false)
    expect(confinedPathAllowed(ge, '/explorar')).toBe(false)
  })

  it('otros roles confinados no entran a /call-center', () => {
    expect(confinedPathAllowed(user('operador_establecimiento', { cueAnexo: '1-2' }), '/call-center')).toBe(false)
    expect(confinedPathAllowed(user('director_nivel', { nivelJurIds: [1] }), '/call-center')).toBe(false)
  })

  it('un admin_ge baneado no entra', () => {
    expect(confinedPathAllowed(user('admin_ge', { banned: true }), '/call-center')).toBe(false)
  })
})
