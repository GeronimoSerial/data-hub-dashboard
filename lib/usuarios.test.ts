import { describe, expect, it } from 'vitest'
import type { SessionUser } from './acl'
import {
  LAST_ADMIN_ERROR,
  authApiError,
  emailHasTld,
  listUsuariosDenied,
  mutateUsuariosDenied,
  parseCreateUserBody,
  parsePatchUserBody,
  wouldRemoveLastAdmin,
} from './usuarios'

const admin: SessionUser = {
  id: 'a1',
  role: 'admin',
  banned: false,
  nivelIds: [],
}

const editor: SessionUser = {
  id: 'e1',
  role: 'editor',
  banned: false,
  nivelIds: [],
}

const consulta: SessionUser = {
  id: 'c1',
  role: 'consulta',
  banned: false,
  nivelIds: ['primario'],
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
      error: 'No tenés acceso a este recurso',
    })
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
      error: 'No tenés acceso a este recurso',
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
    nivelIds: ['primario'],
  }

  it('accepts a valid body', () => {
    expect(parseCreateUserBody(base)).toEqual(base)
  })

  it('rejects localhost emails and short passwords', () => {
    expect(parseCreateUserBody({ ...base, email: 'user@localhost' })).toBeNull()
    expect(parseCreateUserBody({ ...base, password: 'short' })).toBeNull()
  })

  it('rejects unknown roles', () => {
    expect(parseCreateUserBody({ ...base, role: 'superadmin' })).toBeNull()
  })
})

describe('parsePatchUserBody', () => {
  it('accepts partial fields including empty password as omit', () => {
    expect(
      parsePatchUserBody({
        role: 'editor',
        banned: true,
        password: '  ',
        nivelIds: ['inicial'],
      }),
    ).toEqual({
      role: 'editor',
      banned: true,
      nivelIds: ['inicial'],
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
