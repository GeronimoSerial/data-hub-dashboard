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

  let existente = await ctx.internalAdapter.findUserByEmail(input.email)
  if (!existente) {
    try {
      await ctx.internalAdapter.createUser(
        { email: input.email, name: nombre, role: rolHub, emailVerified: true },
        { method: 'admin' },
      )
    } catch (err) {
      // GE a veces dispara el mismo login dos veces en paralelo: si el otro
      // pedido ya creó el usuario, se sigue con ese.
      if (!esEmailDuplicado(err)) throw err
    }
    existente = await ctx.internalAdapter.findUserByEmail(input.email)
    if (!existente) throw new Error('[ge-sso] usuario no encontrado tras crearlo')
  }
  // `banned` lo agrega el plugin admin y no figura en el tipo del adapter.
  const bloqueado = (existente.user as { banned?: boolean | null }).banned
  if (bloqueado) return { ok: false, motivo: 'bloqueado' }
  const userId = existente.user.id
  // `ge_cue_anexo` no está declarado como additionalField de better-auth: el
  // adapter lo descarta, por eso se escribe con drizzle directo.
  await getDb()
    .update(user)
    .set({ name: nombre, role: rolHub, geCueAnexo })
    .where(eq(user.id, userId))
  await replaceUserNivelesJur(userId, nivelesJur)
  return { ok: true, userId }
}

/** Violación de unicidad de Postgres (23505), directa o envuelta por drizzle. */
function esEmailDuplicado(err: unknown): boolean {
  for (let actual: unknown = err; actual; actual = (actual as { cause?: unknown }).cause) {
    if ((actual as { code?: unknown }).code === '23505') return true
  }
  return false
}
