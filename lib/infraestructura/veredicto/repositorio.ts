// Persistencia del veredicto diario de IA sobre infra_veredicto_dia.
// Cada cambio de entradas crea una versión nueva: la anterior queda con
// `reemplazado_por` apuntando a la sucesora y nunca se borra. La vigente es la
// fila con `reemplazado_por` nulo para (fecha, ambito).
import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, gte, isNull, lte } from 'drizzle-orm'
import type { getDb } from '@/lib/db'
import { infraVeredictoDia } from '@/lib/db/schema'

export type Db = ReturnType<typeof getDb>
export type FilaVeredicto = typeof infraVeredictoDia.$inferSelect
export type EntradaVeredicto = Omit<
  typeof infraVeredictoDia.$inferInsert,
  'id' | 'reemplazadoPor' | 'cerrado'
>

export type ResultadoGuardado = {
  estado: 'sin_cambios' | 'insertado'
  fila: FilaVeredicto
}

// Guarda una versión del veredicto dentro de una transacción. Si la vigente ya
// tiene las mismas entradas (inputsHash), no escribe nada. Si no, marca la
// vigente como reemplazada ANTES de insertar la nueva.
export async function guardarVeredicto(
  db: Db,
  entrada: EntradaVeredicto,
): Promise<ResultadoGuardado> {
  return db.transaction(async (tx) => {
    const [vigente] = await tx
      .select()
      .from(infraVeredictoDia)
      .where(
        and(
          eq(infraVeredictoDia.fecha, entrada.fecha),
          eq(infraVeredictoDia.ambito, entrada.ambito),
          isNull(infraVeredictoDia.reemplazadoPor),
        ),
      )
      .limit(1)

    if (vigente && vigente.inputsHash === entrada.inputsHash) {
      return { estado: 'sin_cambios', fila: vigente }
    }

    const id = randomUUID()
    if (vigente) {
      await tx
        .update(infraVeredictoDia)
        .set({ reemplazadoPor: id })
        .where(eq(infraVeredictoDia.id, vigente.id))
    }

    const [fila] = await tx
      .insert(infraVeredictoDia)
      .values({ ...entrada, id })
      .returning()
    if (!fila) throw new Error(`Veredicto ${id} no se insertó`)
    return { estado: 'insertado', fila }
  })
}

// Versiones vigentes entre dos fechas (ambas inclusive), por fecha y ámbito.
export async function listarVigentes(
  db: Db,
  opciones: { desde: string; hasta: string; ambito?: string },
): Promise<FilaVeredicto[]> {
  const condiciones = [
    gte(infraVeredictoDia.fecha, opciones.desde),
    lte(infraVeredictoDia.fecha, opciones.hasta),
    isNull(infraVeredictoDia.reemplazadoPor),
  ]
  if (opciones.ambito !== undefined) {
    condiciones.push(eq(infraVeredictoDia.ambito, opciones.ambito))
  }
  return db
    .select()
    .from(infraVeredictoDia)
    .where(and(...condiciones))
    .orderBy(asc(infraVeredictoDia.fecha), asc(infraVeredictoDia.ambito))
}

// Todas las versiones de un (fecha, ambito), la más reciente primero.
export async function historialVeredicto(
  db: Db,
  opciones: { fecha: string; ambito: string },
): Promise<FilaVeredicto[]> {
  return db
    .select()
    .from(infraVeredictoDia)
    .where(
      and(
        eq(infraVeredictoDia.fecha, opciones.fecha),
        eq(infraVeredictoDia.ambito, opciones.ambito),
      ),
    )
    .orderBy(desc(infraVeredictoDia.generadoEn))
}

// Marca como cerradas las versiones vigentes de una fecha.
export async function marcarCerrado(db: Db, fecha: string): Promise<void> {
  await db
    .update(infraVeredictoDia)
    .set({ cerrado: true })
    .where(
      and(eq(infraVeredictoDia.fecha, fecha), isNull(infraVeredictoDia.reemplazadoPor)),
    )
}
