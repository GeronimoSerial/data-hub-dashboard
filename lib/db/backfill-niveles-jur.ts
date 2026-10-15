import type { getDb } from './index'
import {
  mapearNivelesAJur,
  nivelesDesconocidos,
} from '@/lib/niveles-jur-mapeo'
import {
  recursoAudienciaNiveles,
  recursoAudienciaNivelesJur,
  user,
  userNiveles,
  userNivelesJur,
} from './schema'

export type ResultadoBackfillNivelesJur = {
  usuariosInsertados: number
  recursosInsertados: number
  // Ids legados sin equivalencia en el mapeo (se ignoran).
  idsDesconocidos: string[]
  // user_niveles cuyo usuario ya no existe: no se pueden enlazar por FK.
  usuariosHuerfanos: number
}

// Backfill idempotente de niveles legados → niveles jurisdiccionales. Usa
// ON CONFLICT DO NOTHING y cuenta sólo las filas realmente insertadas, así que
// una segunda corrida devuelve ceros. Requiere el catálogo ya sembrado
// (nivelesJurisdiccionales), por la FK.
export async function backfillNivelesJur(
  db: ReturnType<typeof getDb>,
): Promise<ResultadoBackfillNivelesJur> {
  const filasUsuario = await db
    .select({ userId: userNiveles.userId, nivelId: userNiveles.nivelId })
    .from(userNiveles)
  const filasRecurso = await db
    .select({
      recursoId: recursoAudienciaNiveles.recursoId,
      nivelId: recursoAudienciaNiveles.nivelId,
    })
    .from(recursoAudienciaNiveles)
  const usuarios = await db.select({ id: user.id }).from(user)
  const idsUsuario = new Set(usuarios.map((u) => u.id))

  const idsDesconocidos = nivelesDesconocidos([
    ...filasUsuario.map((f) => f.nivelId),
    ...filasRecurso.map((f) => f.nivelId),
  ])

  const porUsuario = new Map<string, string[]>()
  for (const f of filasUsuario) {
    const lista = porUsuario.get(f.userId) ?? []
    lista.push(f.nivelId)
    porUsuario.set(f.userId, lista)
  }
  const porRecurso = new Map<string, string[]>()
  for (const f of filasRecurso) {
    const lista = porRecurso.get(f.recursoId) ?? []
    lista.push(f.nivelId)
    porRecurso.set(f.recursoId, lista)
  }

  let usuariosHuerfanos = 0
  const valoresUsuario: { userId: string; nivelJurisdiccionalId: number }[] = []
  for (const [userId, nivelIds] of porUsuario) {
    if (!idsUsuario.has(userId)) {
      usuariosHuerfanos += nivelIds.length
      continue
    }
    for (const nivelJurisdiccionalId of mapearNivelesAJur(nivelIds)) {
      valoresUsuario.push({ userId, nivelJurisdiccionalId })
    }
  }

  const valoresRecurso: { recursoId: string; nivelJurisdiccionalId: number }[] =
    []
  for (const [recursoId, nivelIds] of porRecurso) {
    // Un recurso cuya audiencia era sólo 'transversal' queda sin filas: sin
    // audiencia = visible para todos, que es la semántica buscada.
    for (const nivelJurisdiccionalId of mapearNivelesAJur(nivelIds)) {
      valoresRecurso.push({ recursoId, nivelJurisdiccionalId })
    }
  }

  let usuariosInsertados = 0
  if (valoresUsuario.length > 0) {
    const insertados = await db
      .insert(userNivelesJur)
      .values(valoresUsuario)
      .onConflictDoNothing()
      .returning({ userId: userNivelesJur.userId })
    usuariosInsertados = insertados.length
  }

  let recursosInsertados = 0
  if (valoresRecurso.length > 0) {
    const insertados = await db
      .insert(recursoAudienciaNivelesJur)
      .values(valoresRecurso)
      .onConflictDoNothing()
      .returning({ recursoId: recursoAudienciaNivelesJur.recursoId })
    recursosInsertados = insertados.length
  }

  return {
    usuariosInsertados,
    recursosInsertados,
    idsDesconocidos,
    usuariosHuerfanos,
  }
}
