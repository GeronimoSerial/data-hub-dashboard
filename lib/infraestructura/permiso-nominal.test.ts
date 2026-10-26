import { describe, expect, it } from 'vitest'
import type { SessionUser } from '@/lib/acl'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'

usarDbTemporal('permiso-nominal')

function user(overrides: Partial<SessionUser>): SessionUser {
  return {
    id: 'sin-uso',
    role: 'consulta',
    banned: false,
    nivelJurIds: [],
    accesoRecursos: 'todos',
    recursoIds: [],
    ...overrides,
  }
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

  it('un admin sin grant tiene acceso: el rol alcanza por sí solo', async () => {
    const { puedeVerNominal } = await import('./permiso-nominal')
    const id = idUnico('admin')
    expect(await puedeVerNominal(user({ id, role: 'admin' }), new Date())).toBe(true)
  })

  it('un admin baneado no tiene acceso pese al rol', async () => {
    const { puedeVerNominal } = await import('./permiso-nominal')
    const id = idUnico('admin-baneado')
    expect(
      await puedeVerNominal(user({ id, role: 'admin', banned: true }), new Date()),
    ).toBe(false)
  })

  it('un operador de establecimiento nunca ve nominal, ni con grant vigente', async () => {
    const { puedeVerNominal, otorgarPermisoNominal } = await import('./permiso-nominal')
    const id = idUnico('operador')
    await otorgarPermisoNominal({
      userId: id,
      otorgadoPor: 'admin-x',
      venceEn: new Date(Date.now() + 60_000),
    })
    expect(
      await puedeVerNominal(user({ id, role: 'operador_establecimiento', nivelJurIds: [1] }), new Date()),
    ).toBe(false)
  })

  it('un director de nivel sin grant no ve nominal: el alcance por dirección no reemplaza al grant', async () => {
    const { puedeVerNominal } = await import('./permiso-nominal')
    const id = idUnico('director')
    expect(
      await puedeVerNominal(user({ id, role: 'director_nivel', nivelJurIds: [1] }), new Date()),
    ).toBe(false)
  })

  it('un admin_ge sin grant no ve nominal, igual que un director', async () => {
    const { puedeVerNominal } = await import('./permiso-nominal')
    const id = idUnico('admin-ge')
    expect(await puedeVerNominal(user({ id, role: 'admin_ge' }), new Date())).toBe(false)
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

  // El auto-otorgamiento sigue existiendo y sigue registrando otorgado_por,
  // aunque para un admin ya no sea el camino por el que obtiene acceso: el
  // grant es lo que habilita a los demás roles, y su trazabilidad no cambia.
  it('un admin puede otorgar el permiso a sí mismo, y queda registrado en otorgado_por', async () => {
    const { otorgarPermisoNominal, listarPermisosNominales } = await import('./permiso-nominal')
    const id = idUnico('admin-self')
    await otorgarPermisoNominal({
      userId: id,
      otorgadoPor: id,
      venceEn: new Date('2026-12-31T00:00:00Z'),
    })

    const permisos = await listarPermisosNominales()
    const propio = permisos.find((p) => p.userId === id)
    expect(propio).toMatchObject({ userId: id, otorgadoPor: id })
  })
})
