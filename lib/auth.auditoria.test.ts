import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { auth } from '@/lib/auth'
import { getDb, migrarDb } from '@/lib/db'
import { user } from '@/lib/db/schema'
import { cambioAuditado } from '@/lib/infraestructura/auditoria/servidor'
import { contextoAuditoria, type ContextoAuditoria } from '@/lib/infraestructura/auditoria/contexto'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'

usarDbTemporal('auth-auditoria', { seed: false })

function contexto(): ContextoAuditoria {
  return {
    id: randomUUID(), requestId: randomUUID(), ocurridoEn: new Date(), inicio: performance.now(),
    accion: 'usuario.crear', metodo: 'POST', rutaPlantilla: '/prueba', actorTipo: 'anonimo', actorId: null,
    actorRol: null, viaAcceso: 'prueba', persistido: false, fallo: false,
  }
}

async function crearUsuarioBetterAuth(email: string) {
  const ctx = await auth.$context
  return ctx.internalAdapter.createUser(
    { email, name: 'Usuario auditoria', role: 'consulta', emailVerified: true },
    { method: 'admin' },
  )
}

async function existeUsuario(email: string) {
  const filas = await getDb().select().from(user).where(eq(user.email, email))
  return filas.length > 0
}

beforeAll(async () => {
  await migrarDb()
  // Construye auth fuera de cualquier transacción: el adaptador captura la base
  // vigente al construirse, y el escenario bajo prueba es la escritura dentro de la transacción.
  await auth.$context
})

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('lib/auth - escrituras de better-auth dentro de la transacción auditada', () => {
  it('si el evento falla, el alta de usuario hecha por better-auth se revierte con él', async () => {
    const email = `revertido-${randomUUID()}@test.local`

    await expect(
      contextoAuditoria.run(contexto(), () =>
        conFalloAuditoria(() => cambioAuditado(() => crearUsuarioBetterAuth(email))),
      ),
    ).rejects.toThrow('auditoria_no_disponible')

    expect(await existeUsuario(email)).toBe(false)
  })

  it('fuera de una transacción auditada, el alta de usuario persiste normalmente', async () => {
    const email = `persistido-${randomUUID()}@test.local`

    await crearUsuarioBetterAuth(email)

    expect(await existeUsuario(email)).toBe(true)
  })
})
