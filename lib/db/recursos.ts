import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { conReintentoPorBloqueo } from '@/lib/db/reintento'
import {
  recursoAudienciaNiveles,
  recursoAudienciaUsuarios,
  recursoTags,
  recursos,
} from '@/lib/db/schema'
import type { Recurso } from '@/lib/model'

type HubDb = ReturnType<typeof getDb>

function columns(r: Recurso) {
  return {
    id: r.id,
    titulo: r.titulo,
    descripcion: r.descripcion,
    formato: r.formato,
    nivelId: r.nivelId,
    tipoId: r.tipoId,
    categoriaId: r.categoriaId,
    area: r.area,
    actualizado: r.actualizado,
    estado: r.estado,
    ruta: r.ruta?.trim() || null,
    storageKey: r.storageKey?.trim() || null,
    mime: r.mime || null,
    nombreOriginal: r.nombreOriginal || null,
    size: r.size ?? null,
  }
}

async function replaceJoins(tx: HubDb, r: Recurso) {
  await tx.delete(recursoTags).where(eq(recursoTags.recursoId, r.id))
  await tx
    .delete(recursoAudienciaNiveles)
    .where(eq(recursoAudienciaNiveles.recursoId, r.id))
  await tx
    .delete(recursoAudienciaUsuarios)
    .where(eq(recursoAudienciaUsuarios.recursoId, r.id))

  const tagIds = r.tagIds ?? []
  if (tagIds.length > 0) {
    await tx.insert(recursoTags).values(
      tagIds.map((tagId) => ({ recursoId: r.id, tagId })),
    )
  }
  const nivelIds = r.audienciaNivelIds ?? []
  if (nivelIds.length > 0) {
    await tx.insert(recursoAudienciaNiveles).values(
      nivelIds.map((nivelId) => ({ recursoId: r.id, nivelId })),
    )
  }
  const userIds = r.audienciaUserIds ?? []
  if (userIds.length > 0) {
    await tx.insert(recursoAudienciaUsuarios).values(
      userIds.map((userId) => ({ recursoId: r.id, userId })),
    )
  }
}

// Todas las transacciones de este archivo se reintentan ante SQLITE_BUSY
// (lib/db/reintento.ts): son delete+insert/update completos dentro de una
// única db.transaction, que se revierte entera si falla a mitad de camino,
// así que repetirla desde cero produce el mismo resultado final.
export async function insertRecurso(r: Recurso) {
  const db = getDb()
  await conReintentoPorBloqueo(() =>
    db.transaction(async (tx) => {
      await tx.insert(recursos).values(columns(r))
      await replaceJoins(tx as unknown as HubDb, r)
    }),
  )
}

export async function updateRecurso(r: Recurso) {
  const db = getDb()
  const [existing] = await db
    .select({ id: recursos.id })
    .from(recursos)
    .where(eq(recursos.id, r.id))
  if (!existing) return false
  await conReintentoPorBloqueo(() =>
    db.transaction(async (tx) => {
      await tx.update(recursos).set(columns(r)).where(eq(recursos.id, r.id))
      await replaceJoins(tx as unknown as HubDb, r)
    }),
  )
  return true
}

export async function deleteRecurso(id: string) {
  const db = getDb()
  const [existing] = await db
    .select({ id: recursos.id })
    .from(recursos)
    .where(eq(recursos.id, id))
  if (!existing) return false
  await conReintentoPorBloqueo(() =>
    db.transaction(async (tx) => {
      await tx.delete(recursoTags).where(eq(recursoTags.recursoId, id))
      await tx
        .delete(recursoAudienciaNiveles)
        .where(eq(recursoAudienciaNiveles.recursoId, id))
      await tx
        .delete(recursoAudienciaUsuarios)
        .where(eq(recursoAudienciaUsuarios.recursoId, id))
      await tx.delete(recursos).where(eq(recursos.id, id))
    }),
  )
  return true
}
