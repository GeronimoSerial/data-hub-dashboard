import { describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/acl'
import { confinedAreaCapability, confinedHome, confinedPathAllowed, hubConfined } from './hub-confinement'

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

describe('recepción escolar de remitos en el confinamiento', () => {
  const school = () => user('operador_establecimiento', { cueAnexo: '1-2' })
  const receiptPaths = [
    '/cuadernillos/recepcion',
    '/api/cuadernillos/recepciones',
    '/api/cuadernillos/remito-lineas/12/recibir',
  ]

  it.each(receiptPaths)('el operador con CUE entra a %s', (path) => {
    expect(confinedPathAllowed(school(), path)).toBe(true)
  })

  it.each([
    '/cuadernillos',
    '/cuadernillos/',
    '/cuadernillos/recepcion/otra',
    '/cuadernillos/recepciones',
    '/api/cuadernillos/remitos',
    '/api/cuadernillos/control',
    '/api/cuadernillos/stock',
    '/api/cuadernillos/requests',
    '/api/cuadernillos/recepciones/x',
    '/api/cuadernillos/remitos/12/recibir',
    '/api/cuadernillos/remito-lineas/12/otra',
    '/api/cuadernillos/remito-lineas/1/2/recibir',
  ])('el operador sigue sin acceso a %s', (path) => {
    expect(confinedPathAllowed(school(), path)).toBe(false)
  })

  it('operador sin CUE, o baneado, no entra', () => {
    for (const path of receiptPaths) {
      expect(confinedPathAllowed(user('operador_establecimiento'), path)).toBe(false)
      expect(confinedPathAllowed(user('operador_establecimiento', { cueAnexo: '1-2', banned: true }), path)).toBe(false)
    }
  })

  it('un CUE en blanco no cuenta como CUE', () => {
    for (const path of receiptPaths) {
      expect(confinedPathAllowed(user('operador_establecimiento', { cueAnexo: ' ' }), path)).toBe(false)
    }
  })

  it('director_nivel y admin_ge siguen sin acceso', () => {
    for (const path of receiptPaths) {
      expect(confinedPathAllowed(user('director_nivel', { nivelJurIds: [1] }), path)).toBe(false)
      expect(confinedPathAllowed(user('admin_ge'), path)).toBe(false)
    }
  })

  it('las áreas existentes del operador y el home no cambian', () => {
    expect(confinedPathAllowed(school(), '/problematicas/parte/nuevo')).toBe(true)
    expect(confinedPathAllowed(school(), '/mapas/infraestructura')).toBe(false)
    expect(confinedHome(school())).toBe('/problematicas/parte/nuevo')
  })
})
