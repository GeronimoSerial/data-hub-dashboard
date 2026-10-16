import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { getDb } from '@/lib/db'
import { nivelesJurisdiccionales, user } from '@/lib/db/schema'
import { replaceUserNivelesJur } from '@/lib/usuarios'
import { ROL_HUB_POR_GE, type UsuarioGeInput } from './roles'

export async function nivelJurisdiccionalExiste(id: number): Promise<boolean> {
  const [fila] = await getDb()
    .select({ id: nivelesJurisdiccionales.id })
    .from(nivelesJurisdiccionales)
    .where(eq(nivelesJurisdiccionales.id, id))
    .limit(1)
  return fila !== undefined
}

export type ResultadoProvision =
  | { ok: true; userId: string }
  | { ok: false; motivo: 'bloqueado' }

/**
 * Crea o actualiza el usuario de la app a partir de los datos que manda GE.
 *
 * GE es la fuente de verdad del rol y del alcance en cada login: el rol, el CUE
 * y los niveles jurisdiccionales se sobrescriben en cada ingreso, nunca se
 * conservan del login anterior ni se editan a mano desde la app.
 */
export async function provisionarUsuarioGe(input: UsuarioGeInput): Promise<ResultadoProvision> {
  const ctx = await auth.$context
  const nombre = input.nombre
  const rolHub = ROL_HUB_POR_GE[input.rol]
  const geCueAnexo = input.rol === 'operador_establecimiento' ? (input.cue ?? null) : null
  const nivelesJur =
    input.rol === 'director_nivel' && input.nivelJurisdiccionalId != null
      ? [input.nivelJurisdiccionalId]
      : []

  const existente = await ctx.internalAdapter.findUserByEmail(input.email)
  let userId: string
  if (existente) {
    // `banned` lo agrega el plugin admin y no figura en el tipo del adapter.
    const bloqueado = (existente.user as { banned?: boolean | null }).banned
    if (bloqueado) return { ok: false, motivo: 'bloqueado' }
    userId = existente.user.id
  } else {
    const creado = await ctx.internalAdapter.createUser(
      { email: input.email, name: nombre, role: rolHub, emailVerified: true },
      { method: 'admin' },
    )
    userId = creado.id
  }
  // `ge_cue_anexo` no está declarado como additionalField de better-auth: el
  // adapter lo descarta, por eso se escribe con drizzle directo.
  await getDb()
    .update(user)
    .set({ name: nombre, role: rolHub, geCueAnexo })
    .where(eq(user.id, userId))
  await replaceUserNivelesJur(userId, nivelesJur)
  return { ok: true, userId }
}
