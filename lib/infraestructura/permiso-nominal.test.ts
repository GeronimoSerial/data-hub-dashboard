import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/acl'

let dir: string
let prevDataDir: string | undefined

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'permiso-nominal-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

function user(overrides: Partial<SessionUser>): SessionUser {
  return { id: 'sin-uso', role: 'consulta', banned: false, nivelIds: [], ...overrides }
}

let contador = 0
function idUnico(prefijo: string) {
  contador += 1
  return `${prefijo}-${contador}`
}

describe('puedeVerNominal', () => {
  it('devuelve false sin usuario', async () => {
    const { puedeVerNominal } = await import('./permiso-nominal')
    expect(await puedeVerNominal(null, new Date())).toBe(false)
  })

  it('un admin sin grant NO tiene acceso: el rol nunca es suficiente', async () => {
    const { puedeVerNominal } = await import('./permiso-nominal')
    const id = idUnico('admin')
    expect(await puedeVerNominal(user({ id, role: 'admin' }), new Date())).toBe(false)
  })

  it('un editor sin grant tampoco tiene acceso', async () => {
    const { puedeVerNominal } = await import('./permiso-nominal')
    const id = idUnico('editor')
    expect(await puedeVerNominal(user({ id, role: 'editor' }), new Date())).toBe(false)
  })

  it('con un grant vigente, un usuario consulta tiene acceso', async () => {
    const { puedeVerNominal, otorgarPermisoNominal } = await import('./permiso-nominal')
    const id = idUnico('u')
    const ahora = new Date('2026-06-01T00:00:00Z')
    await otorgarPermisoNominal({
      userId: id,
      otorgadoPor: 'admin-x',
      venceEn: new Date('2026-12-31T00:00:00Z'),
    })

    expect(await puedeVerNominal(user({ id }), ahora)).toBe(true)
  })

  it('un grant vencido no da acceso', async () => {
    const { puedeVerNominal, otorgarPermisoNominal } = await import('./permiso-nominal')
    const id = idUnico('u')
    await otorgarPermisoNominal({
      userId: id,
      otorgadoPor: 'admin-x',
      venceEn: new Date('2026-01-01T00:00:00Z'),
    })

    expect(await puedeVerNominal(user({ id }), new Date('2026-06-01T00:00:00Z'))).toBe(false)
  })

  it('un grant revocado no da acceso aunque no haya vencido', async () => {
    const { puedeVerNominal, otorgarPermisoNominal, revocarPermisoNominal } = await import(
      './permiso-nominal'
    )
    const id = idUnico('u')
    const permiso = await otorgarPermisoNominal({
      userId: id,
      otorgadoPor: 'admin-x',
      venceEn: new Date('2026-12-31T00:00:00Z'),
    })
    await revocarPermisoNominal(permiso.id)

    expect(await puedeVerNominal(user({ id }), new Date('2026-06-01T00:00:00Z'))).toBe(false)
  })

  it('un admin puede otorgarse el permiso a sí mismo, y queda registrado en otorgado_por', async () => {
    const { puedeVerNominal, otorgarPermisoNominal, listarPermisosNominales } = await import(
      './permiso-nominal'
    )
    const id = idUnico('admin-self')
    await otorgarPermisoNominal({
      userId: id,
      otorgadoPor: id,
      venceEn: new Date('2026-12-31T00:00:00Z'),
    })

    expect(
      await puedeVerNominal(user({ id, role: 'admin' }), new Date('2026-06-01T00:00:00Z')),
    ).toBe(true)

    const permisos = await listarPermisosNominales()
    const propio = permisos.find((p) => p.userId === id)
    expect(propio).toMatchObject({ userId: id, otorgadoPor: id })
  })
})
