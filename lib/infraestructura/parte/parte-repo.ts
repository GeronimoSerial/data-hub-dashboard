// Acceso a datos del alta/actualización del parte (infra_parte, afectaciones,
// alcance de servicio, movimiento, borrador). Cada función recibe el ejecutor
// de drizzle: la conexión normal para lecturas previas a la transacción, o el
// `tx` de db.transaction() dentro de ella. Sin reglas de negocio: eso vive en
// el caso de uso (actualizar-parte.ts).
import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { getDb } from '@/lib/db'
import {
  infraAfectacion,
  infraAfectacionAlumno,
  infraAfectacionSeccion,
  infraBorrador,
  infraBorradorCierre,
  infraMovimiento,
  infraParte,
  infraServicioAlcance,
} from '@/lib/db/schema'

// `tx` de db.transaction() es subclase del handle de la base, así que una sola
// firma sirve para ambos.
export type Ejecutor = ReturnType<typeof getDb>

export type FilaMovimiento = typeof infraMovimiento.$inferSelect
export type FilaParte = typeof infraParte.$inferSelect
export type FilaBorrador = typeof infraBorrador.$inferSelect

export type ClaveServicio = { tipo: 'establecimiento' | 'turno' | 'seccion'; referenciaId: string | null }

export async function buscarMovimientoPorIdempotencyKey(
  e: Ejecutor,
  idempotencyKey: string,
): Promise<FilaMovimiento | undefined> {
  const [fila] = await e
    .select()
    .from(infraMovimiento)
    .where(eq(infraMovimiento.idempotencyKey, idempotencyKey))
    .limit(1)
  return fila
}

export async function buscarParteDeCueEnPeriodo(
  e: Ejecutor,
  cueAnexo: string,
  periodoId: string,
): Promise<FilaParte | undefined> {
  const [fila] = await e
    .select()
    .from(infraParte)
    .where(and(eq(infraParte.cueAnexo, cueAnexo), eq(infraParte.periodoId, periodoId)))
    .limit(1)
  return fila
}

export async function leerParte(e: Ejecutor, parteId: string): Promise<FilaParte | undefined> {
  const [fila] = await e.select().from(infraParte).where(eq(infraParte.id, parteId)).limit(1)
  return fila
}

// Alta del parte con carrera en (cue_anexo, periodo_id): si otra request ya lo
// creó mientras ésta esperaba el lock de escritura, el insert no hace nada y se
// devuelve el id del que quedó. Devuelve el id del parte vigente.
export async function insertarParteSiNoExiste(
  e: Ejecutor,
  nuevo: {
    id: string
    periodoId: string
    cueAnexo: string
    rigeDesde: string
    corteId: number
    ahora: string
  },
): Promise<string> {
  await e
    .insert(infraParte)
    .values({
      id: nuevo.id,
      periodoId: nuevo.periodoId,
      cueAnexo: nuevo.cueAnexo,
      estadoEstablecimiento: 'habitual',
      asistenciaPedagogica: null,
      estadoEstablecimientoRigeDesde: nuevo.rigeDesde,
      corteId: nuevo.corteId,
      creadaEn: nuevo.ahora,
      actualizadaEn: nuevo.ahora,
    })
    .onConflictDoNothing()
  const [fila] = await e
    .select({ id: infraParte.id })
    .from(infraParte)
    .where(and(eq(infraParte.cueAnexo, nuevo.cueAnexo), eq(infraParte.periodoId, nuevo.periodoId)))
    .limit(1)
  if (!fila) throw new Error('No se pudo crear ni leer el parte')
  return fila.id
}

export async function actualizarParte(
  e: Ejecutor,
  parteId: string,
  cambios: {
    actualizadaEn: string
    estadoEstablecimiento?: string
    estadoEstablecimientoRigeDesde?: string
    asistenciaPedagogica?: string | null
  },
): Promise<void> {
  await e.update(infraParte).set(cambios).where(eq(infraParte.id, parteId))
}

export async function alcancesServicioVigentes(e: Ejecutor, parteId: string): Promise<string[]> {
  const filas = await e
    .select({ tipo: infraServicioAlcance.tipo })
    .from(infraServicioAlcance)
    .where(and(eq(infraServicioAlcance.parteId, parteId), isNull(infraServicioAlcance.retiradaEn)))
  return filas.map((fila) => fila.tipo)
}

export async function hayAfectacionVigentePorSecciones(e: Ejecutor, parteId: string): Promise<boolean> {
  const [fila] = await e
    .select({ id: infraAfectacionSeccion.geSectionId })
    .from(infraAfectacionSeccion)
    .innerJoin(infraAfectacion, eq(infraAfectacion.id, infraAfectacionSeccion.afectacionId))
    .where(and(eq(infraAfectacion.parteId, parteId), isNull(infraAfectacion.retiradaEn)))
    .limit(1)
  return fila !== undefined
}

export async function afectacionesPorIds(e: Ejecutor, parteId: string, ids: string[]) {
  return e
    .select()
    .from(infraAfectacion)
    .where(and(eq(infraAfectacion.parteId, parteId), inArray(infraAfectacion.id, ids)))
}

export async function geSectionIdsDeAfectacion(e: Ejecutor, afectacionId: string): Promise<number[]> {
  const filas = await e
    .select({ geSectionId: infraAfectacionSeccion.geSectionId })
    .from(infraAfectacionSeccion)
    .where(eq(infraAfectacionSeccion.afectacionId, afectacionId))
  return filas.map((fila) => fila.geSectionId)
}

export async function causasPorId(e: Ejecutor, ids: string[]) {
  return e
    .select({
      id: infraAfectacion.id,
      motivo: infraAfectacion.motivo,
      retiradaEn: infraAfectacion.retiradaEn,
      cueAnexo: infraParte.cueAnexo,
    })
    .from(infraAfectacion)
    .innerJoin(infraParte, eq(infraParte.id, infraAfectacion.parteId))
    .where(inArray(infraAfectacion.id, ids))
}

export async function buscarCierreBorrador(e: Ejecutor, draftId: string) {
  const [fila] = await e.select().from(infraBorradorCierre).where(eq(infraBorradorCierre.draftId, draftId)).limit(1)
  return fila
}

export async function buscarBorrador(e: Ejecutor, draftId: string): Promise<FilaBorrador | undefined> {
  const [fila] = await e.select().from(infraBorrador).where(eq(infraBorrador.id, draftId)).limit(1)
  return fila
}

export async function insertarAfectacion(e: Ejecutor, fila: typeof infraAfectacion.$inferInsert): Promise<void> {
  await e.insert(infraAfectacion).values(fila)
}

export async function insertarSeccionesDeAfectacion(e: Ejecutor, afectacionId: string, geSectionIds: number[]) {
  await e
    .insert(infraAfectacionSeccion)
    .values(geSectionIds.map((geSectionId) => ({ afectacionId, geSectionId })))
}

export async function insertarAlumnosDeAfectacion(e: Ejecutor, afectacionId: string, gePersonIds: number[]) {
  await e
    .insert(infraAfectacionAlumno)
    .values(gePersonIds.map((gePersonId) => ({ afectacionId, gePersonId })))
}

export async function actualizarCamposAfectacion(
  e: Ejecutor,
  afectacionId: string,
  cambios: {
    severidad?: string
    descripcion?: string | null
    justificacionCritica?: string | null
    justificacionCriticaDetalle?: string | null
  },
): Promise<void> {
  await e.update(infraAfectacion).set(cambios).where(eq(infraAfectacion.id, afectacionId))
}

// Reemplaza el alcance por secciones: borra el vigente y, si quedan secciones,
// inserta las nuevas.
export async function reemplazarSeccionesDeAfectacion(e: Ejecutor, afectacionId: string, geSectionIds: number[]) {
  await e.delete(infraAfectacionSeccion).where(eq(infraAfectacionSeccion.afectacionId, afectacionId))
  if (geSectionIds.length > 0) await insertarSeccionesDeAfectacion(e, afectacionId, geSectionIds)
}

export async function reemplazarAlumnosDeAfectacion(e: Ejecutor, afectacionId: string, gePersonIds: number[]) {
  await e.delete(infraAfectacionAlumno).where(eq(infraAfectacionAlumno.afectacionId, afectacionId))
  if (gePersonIds.length > 0) await insertarAlumnosDeAfectacion(e, afectacionId, gePersonIds)
}

export async function retirarAfectaciones(e: Ejecutor, ids: string[], rigeDesde: string): Promise<void> {
  await e
    .update(infraAfectacion)
    .set({ retiradaEn: rigeDesde, cierre: 'retirada' })
    .where(inArray(infraAfectacion.id, ids))
}

export async function solucionarAfectacion(e: Ejecutor, afectacionId: string, fecha: string): Promise<void> {
  await e
    .update(infraAfectacion)
    .set({ retiradaEn: fecha, cierre: 'solucionada' })
    .where(eq(infraAfectacion.id, afectacionId))
}

// Reemplaza la fila vigente de una clave de servicio (spec §10: suspender una
// sección no toca a las demás): baja blanda de la vigente y alta de la nueva.
export async function reemplazarAlcanceServicio(
  e: Ejecutor,
  parteId: string,
  clave: ClaveServicio,
  estado: string,
  rigeDesde: string,
  ahora: string,
): Promise<void> {
  const condicionReferencia =
    clave.referenciaId === null
      ? isNull(infraServicioAlcance.referenciaId)
      : eq(infraServicioAlcance.referenciaId, clave.referenciaId)
  await e
    .update(infraServicioAlcance)
    .set({ retiradaEn: rigeDesde })
    .where(
      and(
        eq(infraServicioAlcance.parteId, parteId),
        eq(infraServicioAlcance.tipo, clave.tipo),
        condicionReferencia,
        isNull(infraServicioAlcance.retiradaEn),
      ),
    )
  await e.insert(infraServicioAlcance).values({
    id: crypto.randomUUID(),
    parteId,
    tipo: clave.tipo,
    referenciaId: clave.referenciaId,
    estado,
    rigeDesde,
    creadaEn: ahora,
    retiradaEn: null,
  })
}

export async function insertarMovimiento(e: Ejecutor, fila: typeof infraMovimiento.$inferInsert): Promise<void> {
  await e.insert(infraMovimiento).values(fila)
}

// Marca el borrador como enviado sólo si sigue abierto y en la revisión leída
// (optimistic lock). Devuelve la fila actualizada, o undefined si no aplicó.
export async function marcarBorradorEnviado(
  e: Ejecutor,
  draftId: string,
  revisionLeida: number,
  datos: { movimientoId: string; revision: number; ahora: string },
): Promise<{ revision: number } | undefined> {
  const [fila] = await e
    .update(infraBorrador)
    .set({
      estado: 'submitted',
      movimientoId: datos.movimientoId,
      revision: datos.revision,
      actividadEn: datos.ahora,
      sincronizadoEn: datos.ahora,
    })
    .where(
      and(
        eq(infraBorrador.id, draftId),
        eq(infraBorrador.revision, revisionLeida),
        eq(infraBorrador.estado, 'open'),
      ),
    )
    .returning({ revision: infraBorrador.revision })
  return fila
}

export async function insertarBorradorCierre(e: Ejecutor, fila: typeof infraBorradorCierre.$inferInsert): Promise<void> {
  await e.insert(infraBorradorCierre).values(fila)
}
