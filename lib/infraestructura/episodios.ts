// Dominio de "episodio" del batch E1 (protocolo ENOS): ciclo de vida de un
// episodio de afectación (creación, cierre atómico, lectura y listado). Ver
// lib/db/schema.ts (infraEpisodio) y docs/ejecucion-enos/E1 para el contrato
// completo.
//
// A diferencia de parte-consulta.ts (que acepta un `DbEjecutor` opcional para
// poder leer dentro de una transacción ajena), estas funciones usan getDb()
// directo: cada operación es una escritura atómica propia, así que no
// necesitan engancharse en una transacción externa.
import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { infraEpisodio } from '@/lib/db/schema'

// Fila tal cual vive en infra_episodio, inferida de la tabla para no duplicar
// los nombres de columnas a mano.
export type EpisodioRow = typeof infraEpisodio.$inferSelect

export interface CrearEpisodioInput {
  periodoId: string
  nombre: string
  descripcion?: string | null
}

// El resultado de crear es la fila recién insertada, compuesta con los mismos
// valores que se mandaron al INSERT (nunca releyendo de la base): el estado
// siempre es 'abierto' y cerradoEn siempre null en el momento de creación.
export interface CrearEpisodioResultado {
  id: string
  periodoId: string
  nombre: string
  descripcion: string | null
  estado: 'abierto'
  abiertoEn: string
  cerradoEn: null
  creadaEn: string
  actualizadaEn: string
}

export async function crearEpisodio(
  input: CrearEpisodioInput,
  ahora: Date = new Date(),
): Promise<CrearEpisodioResultado> {
  const db = getDb()
  const ahoraIso = ahora.toISOString()

  const fila: CrearEpisodioResultado = {
    id: randomUUID(),
    periodoId: input.periodoId,
    nombre: input.nombre,
    descripcion: input.descripcion ?? null,
    estado: 'abierto',
    abiertoEn: ahoraIso,
    cerradoEn: null,
    creadaEn: ahoraIso,
    actualizadaEn: ahoraIso,
  }

  await db.insert(infraEpisodio).values(fila)

  return fila
}

export type CerrarEpisodioResultado =
  | { ok: true }
  | { ok: false; motivo: 'no_existe' | 'ya_cerrado' }

// Transición atómica abierto -> cerrado: el UPDATE lleva la condición de
// estado en el WHERE y se decide por `.returning()`, nunca con un
// select-then-act separado (mismo patrón que adquirirLease/publicarResultado
// en riesgo/job-run.ts). Si el UPDATE no afectó ninguna fila, recién ahí se
// hace un SELECT para distinguir "no existe" de "ya estaba cerrado" — ese
// read es sólo para elegir el motivo, no para decidir la transición.
export async function cerrarEpisodio(
  input: { episodioId: string },
  ahora: Date = new Date(),
): Promise<CerrarEpisodioResultado> {
  const db = getDb()
  const ahoraIso = ahora.toISOString()

  const [cerrado] = await db
    .update(infraEpisodio)
    .set({ estado: 'cerrado', cerradoEn: ahoraIso, actualizadaEn: ahoraIso })
    .where(and(eq(infraEpisodio.id, input.episodioId), eq(infraEpisodio.estado, 'abierto')))
    .returning({ id: infraEpisodio.id })

  if (cerrado) return { ok: true }

  const [fila] = await db
    .select({ id: infraEpisodio.id })
    .from(infraEpisodio)
    .where(eq(infraEpisodio.id, input.episodioId))
    .limit(1)

  return fila ? { ok: false, motivo: 'ya_cerrado' } : { ok: false, motivo: 'no_existe' }
}

export async function obtenerEpisodio(episodioId: string): Promise<EpisodioRow | null> {
  const db = getDb()
  const [fila] = await db
    .select()
    .from(infraEpisodio)
    .where(eq(infraEpisodio.id, episodioId))
    .limit(1)
  return fila ?? null
}

// Lista episodios, opcionalmente filtrados por estado, siempre del más
// reciente al más viejo (abiertoEn descendente).
export async function listarEpisodios(
  input?: { estado?: 'abierto' | 'cerrado' },
): Promise<EpisodioRow[]> {
  const db = getDb()
  return db
    .select()
    .from(infraEpisodio)
    .where(input?.estado ? eq(infraEpisodio.estado, input.estado) : undefined)
    .orderBy(desc(infraEpisodio.abiertoEn))
}
