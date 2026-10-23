import { beforeAll, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import type { SessionUser } from './acl'
import {
  LAST_ADMIN_ERROR,
  authApiError,
  emailHasTld,
  listHubUsers,
  listUsuariosDenied,
  mutateUsuariosDenied,
  parseCreateUserBody,
  parsePatchUserBody,
  persistUserAccessConfiguration,
  replaceUserRecursos,
  setAccesoRecursos,
  unknownRecursoIds,
  validateHubAccessSettings,
  wouldRemoveLastAdmin,
} from './usuarios'

const admin: SessionUser = {
  id: 'a1',
  role: 'admin',
  banned: false,
  nivelJurIds: [],
  accesoRecursos: 'todos',
  recursoIds: [],
}

const editor: SessionUser = {
  id: 'e1',
  role: 'editor',
  banned: false,
  nivelJurIds: [],
  accesoRecursos: 'todos',
  recursoIds: [],
}

const consulta: SessionUser = {
  id: 'c1',
  role: 'consulta',
  banned: false,
  nivelJurIds: [1],
  accesoRecursos: 'todos',
  recursoIds: [],
}

describe('listUsuariosDenied', () => {
  it('returns 401 when there is no session', () => {
    expect(listUsuariosDenied(null)).toEqual({
      status: 401,
      error: 'No autenticado',
    })
  })

  it('returns 403 for consulta', () => {
    expect(listUsuariosDenied(consulta)).toEqual({
      status: 403,
      error: 'No tiene acceso a este recurso',
    })
  })

  it('returns 403 for GE SSO roles', () => {
    for (const role of ['director_nivel', 'operador_establecimiento'] as const) {
      expect(listUsuariosDenied({ ...consulta, role })?.status).toBe(403)
    }
  })

  it('allows admin and editor', () => {
    expect(listUsuariosDenied(admin)).toBeNull()
    expect(listUsuariosDenied(editor)).toBeNull()
  })
})

describe('mutateUsuariosDenied', () => {
  it('returns 401 when there is no session', () => {
    expect(mutateUsuariosDenied(null)?.status).toBe(401)
  })

  it('returns 403 for editor and consulta', () => {
    expect(mutateUsuariosDenied(editor)).toEqual({
      status: 403,
      error: 'No tiene acceso a este recurso',
    })
    expect(mutateUsuariosDenied(consulta)?.status).toBe(403)
  })

  it('allows admin', () => {
    expect(mutateUsuariosDenied(admin)).toBeNull()
  })
})

describe('emailHasTld', () => {
  it('rejects user@localhost (Better Auth z.email requires a dotted domain)', () => {
    expect(emailHasTld('user@localhost')).toBe(false)
    expect(emailHasTld('admin@localhost')).toBe(false)
  })

  it('accepts dotted domains', () => {
    expect(emailHasTld('admin@example.com')).toBe(true)
    expect(emailHasTld('consulta@mec.gob.ar')).toBe(true)
  })
})

describe('parseCreateUserBody', () => {
  const base = {
    email: 'consulta@example.com',
    name: 'Ana',
    password: 'password1',
    role: 'consulta',
    nivelJurIds: [1],
  }

  it('accepts a valid body', () => {
    expect(parseCreateUserBody(base)).toEqual({
      ...base,
      accesoRecursos: 'todos',
      recursoIds: [],
      hubPolicy: {},
      hubDestination: null,
    })
  })

  it('rejects localhost emails and short passwords', () => {
    expect(parseCreateUserBody({ ...base, email: 'user@localhost' })).toBeNull()
    expect(parseCreateUserBody({ ...base, password: 'short' })).toBeNull()
  })

  it('rejects unknown roles', () => {
    expect(parseCreateUserBody({ ...base, role: 'superadmin' })).toBeNull()
  })

  it('accepts the director_nivel and operador_establecimiento roles', () => {
    expect(parseCreateUserBody({ ...base, role: 'director_nivel' })?.role).toBe('director_nivel')
    expect(parseCreateUserBody({ ...base, role: 'operador_establecimiento' })?.role).toBe('operador_establecimiento')
  })

  it('defaults accesoRecursos to todos when omitted', () => {
    expect(parseCreateUserBody(base)?.accesoRecursos).toBe('todos')
  })

  it('accepts accesoRecursos seleccionados with recursoIds', () => {
    expect(
      parseCreateUserBody({
        ...base,
        accesoRecursos: 'seleccionados',
        recursoIds: ['r1', 'r2'],
      }),
    ).toEqual({
      ...base,
      accesoRecursos: 'seleccionados',
      recursoIds: ['r1', 'r2'],
      hubPolicy: {},
      hubDestination: null,
    })
  })

  it('rejects an invalid accesoRecursos value', () => {
    expect(
      parseCreateUserBody({ ...base, accesoRecursos: 'todo' }),
    ).toBeNull()
  })

  it('validates persisted access settings without collapsing explicit empty policy', async () => {
    const hubAccess = { enabledSections: ['infrastructure'], landing: false, destination: '/mapas/infraestructura' }
    expect(parseCreateUserBody({ ...base, hubAccess })?.hubPolicy).toEqual({ enabledSections: ['infrastructure'], landing: false })
    expect(parseCreateUserBody({ ...base, hubAccess: { enabledSections: [], landing: false, destination: null } })?.hubPolicy).toEqual({ enabledSections: [], landing: false })
    expect(parseCreateUserBody({ ...base, hubAccess: { enabledSections: ['bogus'], landing: true, destination: '/' } })).toBeNull()
    expect(parseCreateUserBody({ ...base, hubAccess: { enabledSections: ['reports'], landing: false, destination: '/reportes' } })?.hubDestination).toBe('/reportes')
    expect(parseCreateUserBody({ ...base, hubAccess: { enabledSections: [], landing: false, destination: '/problematicas/parte/nuevo' } })?.hubDestination).toBe('/problematicas/parte/nuevo')
    expect(parseCreateUserBody({ ...base, hubAccess: { enabledSections: ['reports'], landing: false, destination: 'https://evil.test' } })).toBeNull()
    await expect(validateHubAccessSettings({ hubPolicy: { enabledSections: ['reports'], landing: false }, hubDestination: '/reportes' }, () => false)).resolves.toBe(false)
    await expect(validateHubAccessSettings({ hubPolicy: { enabledSections: ['reports'], landing: false }, hubDestination: '/reportes' }, () => true)).resolves.toBe(true)
  })
})

describe('parsePatchUserBody', () => {
  it('accepts partial fields including empty password as omit', () => {
    expect(
      parsePatchUserBody({
        role: 'editor',
        banned: true,
        password: '  ',
        nivelJurIds: [3],
      }),
    ).toEqual({
      role: 'editor',
      banned: true,
      nivelJurIds: [3],
    })
  })

  it('keeps a reset password of at least 8 characters', () => {
    expect(parsePatchUserBody({ password: 'newpass12' })).toEqual({
      password: 'newpass12',
    })
  })

  it('rejects unknown roles and short passwords', () => {
    expect(parsePatchUserBody({ role: 'root' })).toBeNull()
    expect(parsePatchUserBody({ password: '1234567' })).toBeNull()
  })

  it('accepts accesoRecursos and recursoIds', () => {
    expect(
      parsePatchUserBody({
        accesoRecursos: 'seleccionados',
        recursoIds: ['r1'],
      }),
    ).toEqual({ accesoRecursos: 'seleccionados', recursoIds: ['r1'] })
  })

  it('validates typed hub access patch fields', () => {
    expect(parsePatchUserBody({ hubAccess: { enabledSections: ['reports'], landing: false, destination: '/reportes' } })).toEqual({ hubPolicy: { enabledSections: ['reports'], landing: false }, hubDestination: '/reportes' })
    expect(parsePatchUserBody({ hubAccess: { enabledSections: ['explore'], landing: false, destination: '/reportes' } })).toBeNull()
  })

  it('requires the existing landing ACL when destination is omitted', async () => {
    const landingSettings = { hubPolicy: { enabledSections: [], landing: true }, hubDestination: null }
    await expect(validateHubAccessSettings(landingSettings, (path) => path === '/')).resolves.toBe(true)
    await expect(validateHubAccessSettings(landingSettings, () => false)).resolves.toBe(false)
    const banned = { ...consulta, banned: true }
    await expect(validateHubAccessSettings(landingSettings, (path) => path === '/' && !banned.banned)).resolves.toBe(false)
    await expect(validateHubAccessSettings({ ...landingSettings, hubPolicy: { enabledSections: [], landing: false } }, () => true)).resolves.toBe(false)
  })

  it('treats an unset legacy landing policy as enabled during partial ACL updates', async () => {
    const aclPaths: string[] = []
    await expect(validateHubAccessSettings({ hubPolicy: {}, hubDestination: null }, (path) => { aclPaths.push(path); return true })).resolves.toBe(true)
    expect(aclPaths).toEqual(['/'])
    await expect(validateHubAccessSettings({ hubPolicy: {}, hubDestination: null }, () => false)).resolves.toBe(false)
  })

  it('rejects an invalid accesoRecursos value', () => {
    expect(parsePatchUserBody({ accesoRecursos: 'algunos' })).toBeNull()
  })

  it('rejects a non-array recursoIds', () => {
    expect(parsePatchUserBody({ recursoIds: 'r1' })).toBeNull()
  })
})

describe('wouldRemoveLastAdmin', () => {
  it('blocks ban of the last unbanned admin', () => {
    expect(
      wouldRemoveLastAdmin({
        targetId: 'a1',
        unbannedAdminIds: ['a1'],
        nextBanned: true,
      }),
    ).toBe(true)
  })

  it('blocks role-downgrade of the last unbanned admin', () => {
    expect(
      wouldRemoveLastAdmin({
        targetId: 'a1',
        unbannedAdminIds: ['a1'],
        nextRole: 'editor',
      }),
    ).toBe(true)
    expect(LAST_ADMIN_ERROR).toBe('No se puede quitar el último administrador')
  })

  it('allows password or nivel changes on the last admin', () => {
    expect(
      wouldRemoveLastAdmin({
        targetId: 'a1',
        unbannedAdminIds: ['a1'],
      }),
    ).toBe(false)
  })

  it('allows ban or downgrade when another unbanned admin exists', () => {
    expect(
      wouldRemoveLastAdmin({
        targetId: 'a1',
        unbannedAdminIds: ['a1', 'a2'],
        nextBanned: true,
        nextRole: 'consulta',
      }),
    ).toBe(false)
  })
})

describe('authApiError', () => {
  it('reads status and message from Better Auth API errors', () => {
    expect(
      authApiError({ statusCode: 403, message: 'FORBIDDEN' }),
    ).toEqual({ status: 403, error: 'FORBIDDEN' })
  })
})

// Base seedeada real (mismo patrón que lib/db/seed.test.ts): getDb() memoiza
// la conexión a nivel de módulo, así que aislamos con un DATA_DIR propio.
describe('recursoIds contra la base', () => {
  usarDbTemporal('usuarios-recursos', { seed: false })

  beforeAll(async () => {
    const { ensureSeeded } = await import('./db/seed')
    await ensureSeeded()
  })

  it('unknownRecursoIds is empty for an empty list', async () => {
    expect(await unknownRecursoIds([])).toEqual([])
  })

  it('unknownRecursoIds is empty when all ids exist', async () => {
    expect(await unknownRecursoIds(['r1'])).toEqual([])
  })

  it('unknownRecursoIds reports ids that do not exist in recursos', async () => {
    expect(await unknownRecursoIds(['r1', 'no-existe'])).toEqual(['no-existe'])
  })

  it('replaceUserRecursos + listHubUsers round-trips accesoRecursos and recursoIds', async () => {
    const { getDb } = await import('./db')
    const { user } = await import('./db/schema')
    const { eq } = await import('drizzle-orm')
    const db = getDb()

    const userId = 'usuarios-test-user'
    await db.insert(user).values({
      id: userId,
      name: 'Test',
      email: 'usuarios-recursos-test@example.com',
      emailVerified: false,
      role: 'consulta',
    } as typeof user.$inferInsert)

    await setAccesoRecursos(userId, 'seleccionados')
    await replaceUserRecursos(userId, ['r1'])

    const usuarios = await listHubUsers()
    const found = usuarios.find((u) => u.id === userId)
    expect(found?.accesoRecursos).toBe('seleccionados')
    expect(found?.recursoIds).toEqual(['r1'])

    await replaceUserRecursos(userId, [])
    const afterClear = (await listHubUsers()).find((u) => u.id === userId)
    expect(afterClear?.recursoIds).toEqual([])

    await db.delete(user).where(eq(user.id, userId))
  })

  it('rolls back the full ACL/policy write if any replacement fails', async () => {
    const { getDb } = await import('./db')
    const { user } = await import('./db/schema')
    const { eq } = await import('drizzle-orm')
    const db = getDb()
    const userId = 'usuarios-atomic-test'
    await db.insert(user).values({
      id: userId, name: 'Atomic', email: 'usuarios-atomic-test@example.com', emailVerified: false, role: 'consulta', banned: true,
    } as typeof user.$inferInsert)
    const original = { hubPolicy: { enabledSections: ['maps'] as const, landing: false }, hubDestination: '/mapas' }
    await persistUserAccessConfiguration(userId, {
      accesoRecursos: 'seleccionados', recursoIds: ['r1'], hubAccess: original,
    })

    await expect(persistUserAccessConfiguration(userId, {
      accesoRecursos: 'todos', recursoIds: ['missing-resource'],
      hubAccess: { hubPolicy: { enabledSections: ['infrastructure'] }, hubDestination: '/mapas/infraestructura' },
      activateProvisionedUser: true,
    })).rejects.toThrow()

    const found = (await listHubUsers()).find((item) => item.id === userId)
    expect(found?.accesoRecursos).toBe('seleccionados')
    expect(found?.recursoIds).toEqual(['r1'])
    expect(found?.hubPolicy).toEqual(original.hubPolicy)
    expect(found?.hubDestination).toBe('/mapas')
    expect(found?.banned).toBe(true)
    await db.delete(user).where(eq(user.id, userId))
  })

  it('commits the complete restricted access configuration before enabling a provisioned user', async () => {
    const { getDb } = await import('./db')
    const { user } = await import('./db/schema')
    const { eq } = await import('drizzle-orm')
    const db = getDb()
    const userId = 'usuarios-provisioning-atomic-test'
    await db.insert(user).values({
      id: userId, name: 'Provisioned', email: 'usuarios-provisioning-test@example.com', emailVerified: false,
      role: 'consulta', banned: true, banReason: 'Provisioning', accesoRecursos: 'todos',
    } as typeof user.$inferInsert)

    await persistUserAccessConfiguration(userId, {
      nivelJurIds: [], accesoRecursos: 'seleccionados', recursoIds: [],
      hubAccess: { hubPolicy: { enabledSections: [], landing: false }, hubDestination: null },
      activateProvisionedUser: true,
    })

    const saved = (await listHubUsers()).find((item) => item.id === userId)
    expect(saved).toMatchObject({
      banned: false, accesoRecursos: 'seleccionados', recursoIds: [],
      hubPolicy: { enabledSections: [], landing: false }, hubDestination: null,
    })
    await db.delete(user).where(eq(user.id, userId))
  })
})
