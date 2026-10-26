import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/lib/db/recurso-access', () => ({
  loadRecursoAccessByRuta: vi.fn().mockResolvedValue({
    id: 'infra-map',
    access: { id: 'infra-map', estado: 'publicado', audienciaNivelJurIds: [], audienciaUserIds: [] },
  }),
}))

import { getSessionUser } from '@/lib/session'
import { loadRecursoAccessByRuta } from '@/lib/db/recurso-access'
import { verificarAccesoLectura, verificarAccesoSeccion } from './acceso-lectura'

const user = {
  id: 'reader', role: 'consulta' as const, banned: false, nivelJurIds: [],
  accesoRecursos: 'todos' as const, recursoIds: [],
}

afterEach(() => vi.resetAllMocks())

describe('verificarAccesoLectura section enforcement', () => {
  it('keeps anonymous map reads at 401', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    expect(await verificarAccesoLectura({ section: 'infrastructure' })).toEqual({ ok: false, status: 401 })
  })

  it('returns 403 for an authenticated user denied the infrastructure section', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ ...user, hubPolicy: { enabledSections: ['maps'], landing: false } })
    expect(await verificarAccesoLectura()).toEqual({ ok: false, status: 403 })
  })

  it('denies map readers without infrastructure section even when the resource ACL allows them', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ ...user, hubPolicy: { enabledSections: [], landing: false } })
    vi.mocked(loadRecursoAccessByRuta).mockResolvedValue({
      id: 'infra-map',
      access: { id: 'infra-map', estado: 'publicado', audienciaNivelJurIds: [], audienciaUserIds: [] },
    })
    expect(await verificarAccesoLectura()).toEqual({ ok: false, status: 403 })
  })

  it('allows situation-only staff section membership without consulting infrastructure resource ACL', async () => {
    const situationUser = { ...user, role: 'editor' as const, hubPolicy: { enabledSections: ['situation' as const], landing: false } }
    vi.mocked(getSessionUser).mockResolvedValue(situationUser)
    expect(await verificarAccesoSeccion('situation')).toEqual({ ok: true, user: situationUser })
    expect(loadRecursoAccessByRuta).not.toHaveBeenCalled()
  })

  it('denies infrastructure-only users from the situation section', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ ...user, hubPolicy: { enabledSections: ['infrastructure'], landing: false } })
    expect(await verificarAccesoSeccion('situation')).toEqual({ ok: false, status: 403 })
  })

  it('keeps the existing resource ACL as an intersection', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ ...user, hubPolicy: { enabledSections: ['infrastructure'], landing: false }, accesoRecursos: 'seleccionados' })
    expect(await verificarAccesoLectura({ section: 'infrastructure' })).toEqual({ ok: false, status: 403 })
  })
})
