import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'

// Base seedeada real (mismo patrón que lib/usuarios.test.ts): getDb() memoiza
// la conexión a nivel de módulo, así que aislamos con un DATA_DIR propio.
usarDbTemporal('backfill-niveles-jur', { seed: false })

beforeAll(async () => {
  const { ensureSeeded } = await import('./seed')
  await ensureSeeded()
})

async function prepararUsuario(id: string) {
  const { getDb } = await import('./index')
  const { user } = await import('./schema')
  await getDb().insert(user).values({
    id,
    name: id,
    email: `${id}@example.com`,
    emailVerified: false,
    role: 'consulta',
  } as typeof user.$inferInsert)
}

describe('backfillNivelesJur', () => {
  it('traduce niveles legados de usuarios y recursos y es idempotente', async () => {
    const { getDb } = await import('./index')
    const schema = await import('./schema')
    const { backfillNivelesJur } = await import('./backfill-niveles-jur')
    const db = getDb()

    await prepararUsuario('bf-user-a')
    await db.insert(schema.userNiveles).values([
      { userId: 'bf-user-a', nivelId: 'secundario' },
      { userId: 'bf-user-a', nivelId: 'primario' },
      { userId: 'bf-user-a', nivelId: 'inicial' },
      { userId: 'bf-user-fantasma', nivelId: 'superior' },
    ])

    // Un nivel legado sin equivalencia (las tablas legadas tienen FK a niveles,
    // así que el id desconocido debe existir como nivel legado).
    await db.insert(schema.niveles).values({ id: 'raro', nombre: 'Raro', orden: 99 })
    // r1 es un recurso de la base seedeada: reemplazamos su audiencia.
    await db
      .delete(schema.recursoAudienciaNiveles)
      .where(eq(schema.recursoAudienciaNiveles.recursoId, 'r1'))
    await db.insert(schema.recursoAudienciaNiveles).values([
      { recursoId: 'r1', nivelId: 'superior' },
      { recursoId: 'r1', nivelId: 'raro' },
    ])

    const primera = await backfillNivelesJur(db)
    expect(primera.idsDesconocidos).toEqual(['raro'])
    expect(primera.usuariosHuerfanos).toBe(1)
    // secundario→{1,5}, primario+inicial→{9}: 3 filas
    expect(primera.usuariosInsertados).toBe(3)
    expect(primera.recursosInsertados).toBe(1)

    const usuarioJur = await db
      .select({ id: schema.userNivelesJur.nivelJurisdiccionalId })
      .from(schema.userNivelesJur)
      .where(eq(schema.userNivelesJur.userId, 'bf-user-a'))
    expect(usuarioJur.map((f) => f.id).sort()).toEqual([1, 5, 9])

    const segunda = await backfillNivelesJur(db)
    expect(segunda.usuariosInsertados).toBe(0)
    expect(segunda.recursosInsertados).toBe(0)
  })

  it('un recurso con audiencia sólo transversal no genera filas (visible para todos)', async () => {
    const { getDb } = await import('./index')
    const schema = await import('./schema')
    const { backfillNivelesJur } = await import('./backfill-niveles-jur')
    const db = getDb()

    await db
      .delete(schema.recursoAudienciaNivelesJur)
      .where(eq(schema.recursoAudienciaNivelesJur.recursoId, 'r1'))
    await db
      .delete(schema.recursoAudienciaNiveles)
      .where(eq(schema.recursoAudienciaNiveles.recursoId, 'r1'))
    await db
      .insert(schema.recursoAudienciaNiveles)
      .values({ recursoId: 'r1', nivelId: 'transversal' })

    const resultado = await backfillNivelesJur(db)
    expect(resultado.recursosInsertados).toBe(0)

    const filas = await db
      .select()
      .from(schema.recursoAudienciaNivelesJur)
      .where(eq(schema.recursoAudienciaNivelesJur.recursoId, 'r1'))
    expect(filas).toEqual([])
  })
})
