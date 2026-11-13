import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { migrarDb, getDb } from '@/lib/db'
import { auditoriaEvento, user } from '@/lib/db/schema'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { consultaAuditoriaSchema, consultarAuditoria } from './consulta'

usarDbTemporal('consulta-auditoria-actor-', { seed: false })
beforeAll(() => migrarDb())

const T0 = new Date('2026-11-13T12:00:00.000Z')
const T1 = new Date('2026-11-13T12:00:01.000Z')

function fila(datos: Partial<typeof auditoriaEvento.$inferInsert> & { actorId: string | null }) {
  return {
    id: randomUUID(),
    requestId: randomUUID(),
    ocurridoEn: T0,
    actorTipo: 'usuario',
    viaAcceso: 'sesion',
    accion: 'parte.guardar',
    metodo: 'POST',
    rutaPlantilla: '/api/prueba',
    resultado: 'exito',
    duracionMs: 1,
    ...datos,
  }
}

async function usuario(sobrescribir: Partial<typeof user.$inferInsert> = {}) {
  const id = `usuario-${randomUUID()}`
  const datos = {
    id,
    name: `Nombre ${id}`,
    email: `${id}@test.local`,
    emailVerified: true,
    role: 'admin',
    banned: false,
    ...sobrescribir,
  }
  await getDb().insert(user).values(datos)
  return datos
}

describe('consultarAuditoria con el nombre y correo del actor', () => {
  it('trae el nombre y el correo del usuario que coincide con actor_id', async () => {
    const persona = await usuario({ name: 'Ana Pérez' })
    const evento = fila({ actorId: persona.id })
    await getDb().insert(auditoriaEvento).values(evento)

    const { items } = await consultarAuditoria(consultaAuditoriaSchema.parse({ actorId: persona.id }))
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: evento.id, actorNombre: 'Ana Pérez', actorCorreo: persona.email })
  })

  it('deja nombre y correo en null cuando el actor no es un usuario (enlace, anónimo)', async () => {
    const enlace = `enlace-${randomUUID()}`
    const evento = fila({ actorId: enlace, actorTipo: 'enlace', viaAcceso: 'enlace' })
    await getDb().insert(auditoriaEvento).values(evento)

    const { items } = await consultarAuditoria(consultaAuditoriaSchema.parse({ actorId: enlace }))
    expect(items).toHaveLength(1)
    expect(items[0]!.actorId).toBe(enlace)
    expect(items[0]).toMatchObject({ actorNombre: null, actorCorreo: null })
  })

  it('no filtra ni expone otras columnas del usuario', async () => {
    const persona = await usuario({ image: 'https://ejemplo.test/a.png', banReason: 'secreto' })
    const evento = fila({ actorId: persona.id })
    await getDb().insert(auditoriaEvento).values(evento)

    const { items } = await consultarAuditoria(consultaAuditoriaSchema.parse({ actorId: persona.id }))
    const claves = Object.keys(items[0]!).sort()
    expect(claves).toEqual([
      'accion', 'actorId', 'actorNombre', 'actorCorreo', 'actorRol', 'actorTipo', 'cueAnexo', 'duracionMs', 'httpStatus',
      'id', 'metadatos', 'metodo', 'objetoId', 'objetoTipo', 'ocurridoEn', 'requestId', 'resultado', 'rutaPlantilla', 'viaAcceso',
    ].sort())
    expect(JSON.stringify(items[0])).not.toContain('secreto')
    expect(JSON.stringify(items[0])).not.toContain('ejemplo.test/a.png')
  })

  it('mantiene el orden y el cursor de la página con el join', async () => {
    const persona = await usuario({ name: 'Bruno' })
    const viejo = fila({ actorId: persona.id, ocurridoEn: T0 })
    const nuevo = fila({ actorId: persona.id, ocurridoEn: T1 })
    await getDb().insert(auditoriaEvento).values([viejo, nuevo])

    const primera = await consultarAuditoria(consultaAuditoriaSchema.parse({ actorId: persona.id, limite: 1 }))
    expect(primera.items.map(e => e.id)).toEqual([nuevo.id])
    expect(primera.nextCursor).not.toBeNull()
    const segunda = await consultarAuditoria(consultaAuditoriaSchema.parse({ actorId: persona.id, limite: 1, cursor: primera.nextCursor! }))
    expect(segunda.items.map(e => e.id)).toEqual([viejo.id])
    expect(segunda.items[0]).toMatchObject({ actorNombre: 'Bruno' })
  })
})
