import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))
vi.mock('@/lib/db/recurso-access', () => ({
  loadRecursoAccessByRuta: vi.fn().mockResolvedValue({
    id: 'infra-map',
    access: { id: 'infra-map', estado: 'publicado' as const, audienciaNivelJurIds: [], audienciaUserIds: [] },
  }),
}))

import { getSessionUser } from '@/lib/session'
import { loadRecursoAccessByRuta } from '@/lib/db/recurso-access'
import { puedeLeerMapaInfraestructura, verificarAccesoLectura, verificarAccesoSeccion } from './acceso-lectura'

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
      access: { id: 'infra-map', estado: 'publicado' as const, audienciaNivelJurIds: [], audienciaUserIds: [] },
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

describe('verificarAccesoLectura by capability (infra.map.read)', () => {
  const recursoSinAudiencia = {
    id: 'infra-map',
    access: { id: 'infra-map', estado: 'publicado' as const, audienciaNivelJurIds: [], audienciaUserIds: [] },
  }
  const recursoParaSoloNivel2 = {
    id: 'infra-map',
    access: { id: 'infra-map', estado: 'publicado' as const, audienciaNivelJurIds: [2], audienciaUserIds: [] },
  }
  const directorNivel = {
    id: 'director',
    role: 'director_nivel' as const,
    banned: false,
    nivelJurIds: [3],
    accesoRecursos: 'todos' as const,
    recursoIds: [],
    hubPolicy: { enabledSections: [], landing: false },
  }

  it('grants director_nivel with niveles when the recurso has no audience', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(directorNivel)
    vi.mocked(loadRecursoAccessByRuta).mockResolvedValue(recursoSinAudiencia)
    expect(await verificarAccesoLectura()).toEqual({ ok: true, user: directorNivel })
  })

  it('grants director_nivel with niveles even when the recurso audience excludes their nivel', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(directorNivel)
    vi.mocked(loadRecursoAccessByRuta).mockResolvedValue(recursoParaSoloNivel2)
    expect(await verificarAccesoLectura()).toEqual({ ok: true, user: directorNivel })
  })

  it('denies director_nivel without niveles', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ ...directorNivel, nivelJurIds: [] })
    vi.mocked(loadRecursoAccessByRuta).mockResolvedValue(recursoSinAudiencia)
    expect(await verificarAccesoLectura()).toEqual({ ok: false, status: 403 })
  })

  it('denies operador_establecimiento', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({
      ...directorNivel,
      id: 'operador',
      role: 'operador_establecimiento' as const,
    })
    vi.mocked(loadRecursoAccessByRuta).mockResolvedValue(recursoSinAudiencia)
    expect(await verificarAccesoLectura()).toEqual({ ok: false, status: 403 })
  })

  it('keeps consulta with the infrastructure section and an open recurso', async () => {
    const consulta = { ...user, hubPolicy: { enabledSections: ['infrastructure' as const], landing: false } }
    vi.mocked(getSessionUser).mockResolvedValue(consulta)
    vi.mocked(loadRecursoAccessByRuta).mockResolvedValue(recursoSinAudiencia)
    expect(await verificarAccesoLectura()).toEqual({ ok: true, user: consulta })
  })

  it('keeps consulta denied when the recurso audience excludes them', async () => {
    const consulta = { ...user, hubPolicy: { enabledSections: ['infrastructure' as const], landing: false } }
    vi.mocked(getSessionUser).mockResolvedValue(consulta)
    vi.mocked(loadRecursoAccessByRuta).mockResolvedValue(recursoParaSoloNivel2)
    expect(await verificarAccesoLectura()).toEqual({ ok: false, status: 403 })
  })

  it('keeps anonymous reads at 401', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    vi.mocked(loadRecursoAccessByRuta).mockResolvedValue(recursoParaSoloNivel2)
    expect(await verificarAccesoLectura()).toEqual({ ok: false, status: 401 })
  })

  it('keeps admin access even when the recurso audience excludes everyone', async () => {
    const admin = { ...user, id: 'admin', role: 'admin' as const }
    vi.mocked(getSessionUser).mockResolvedValue(admin)
    vi.mocked(loadRecursoAccessByRuta).mockResolvedValue(recursoParaSoloNivel2)
    expect(await verificarAccesoLectura()).toEqual({ ok: true, user: admin })
  })
})

describe('puedeLeerMapaInfraestructura', () => {
  const access = {
    id: 'infra-map',
    estado: 'publicado' as const,
    audienciaNivelJurIds: [2],
    audienciaUserIds: [],
  }

  it('gives the same decision as verificarAccesoLectura for each role', async () => {
    const director = { ...user, id: 'd', role: 'director_nivel' as const, nivelJurIds: [3] }
    expect(puedeLeerMapaInfraestructura(director, null)).toBe(true)
    expect(puedeLeerMapaInfraestructura({ ...director, nivelJurIds: [] }, access)).toBe(false)
    expect(puedeLeerMapaInfraestructura(null, access)).toBe(false)
  })

  it('keeps consulta open on a no-audience recurso unless seleccionados excludes it (S8)', () => {
    const consulta = { ...user, hubPolicy: { enabledSections: ['infrastructure' as const], landing: false } }
    const sinAudiencia = { ...access, audienciaNivelJurIds: [], audienciaUserIds: [] }
    expect(puedeLeerMapaInfraestructura(consulta, sinAudiencia)).toBe(true)
    expect(puedeLeerMapaInfraestructura({ ...consulta, accesoRecursos: 'seleccionados' }, sinAudiencia)).toBe(false)
  })

  it('requires the recurso for consulta', () => {
    const consulta = { ...user, hubPolicy: { enabledSections: ['infrastructure' as const], landing: false } }
    expect(puedeLeerMapaInfraestructura(consulta, null)).toBe(false)
    expect(puedeLeerMapaInfraestructura(consulta, access)).toBe(false)
  })
})
