import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { getDb } from '@/lib/db/index'
import { account, user, userNivelesJur } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { CUENTAS_QA, type CuentaQa } from '../cuentas-qa'

// Crea las cuentas QA con el mismo mecanismo que e2e/hub-access/seed.mjs
// (createCredentialUser): usuario por el adaptador interno de Better Auth,
// contrasena hasheada en la tabla account y ajustes de acceso en user.
export async function sembrarCuentas(): Promise<void> {
  await ensureSeeded()
  const db = getDb()
  const context = await auth.$context

  for (const cuentaQa of CUENTAS_QA) {
    await crearCuenta(db, context, cuentaQa)
  }
}

async function crearCuenta(
  db: ReturnType<typeof getDb>,
  context: Awaited<typeof auth.$context>,
  cuentaQa: CuentaQa,
): Promise<void> {
  const creado = await context.internalAdapter.createUser({
    id: `qa-${cuentaQa.clave}`,
    email: cuentaQa.email,
    name: cuentaQa.nombre,
    role: cuentaQa.rol,
    emailVerified: true,
  }, { method: 'admin' })

  await db.insert(account).values({
    id: crypto.randomUUID(),
    issuer: 'local:credential',
    userId: creado.id,
    providerId: 'credential',
    accountId: creado.id,
    password: await context.password.hash(cuentaQa.password),
  })

  await db.update(user).set({
    hubSecciones: cuentaQa.hubSecciones ? [...cuentaQa.hubSecciones] : null,
    hubLanding: cuentaQa.hubLanding,
    hubDestino: cuentaQa.hubDestino,
    geCueAnexo: cuentaQa.geCueAnexo,
  }).where(eq(user.id, creado.id))

  for (const nivelJurisdiccionalId of cuentaQa.nivelesJurIds) {
    await db.insert(userNivelesJur).values({ userId: creado.id, nivelJurisdiccionalId })
  }
}
