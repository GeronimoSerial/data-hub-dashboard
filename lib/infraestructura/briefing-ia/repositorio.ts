// Persistencia de briefings narrativos (E8) sobre infra_briefing.
// La idempotencia la garantiza el índice único infra_briefing_corte_uidx:
// un corte nunca genera dos briefings, y un reintento del job devuelve el
// briefing que ya estaba en vez de pisarlo.
import { and, desc, eq, gte, lt } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { conReintentoPorBloqueo } from '@/lib/db/reintento'
import { infraBriefing } from '@/lib/db/schema'

export interface BriefingPersistido {
  id: string
  corteId: string
  modelo: string
  versionPrompt: string
  parametros: Record<string, unknown> | null
  salidaIa: Record<string, unknown> | null
  textoFinal: string
  fuente: 'ia' | 'plantilla'
  motivoFallback: string | null
  tokensEntrada: number | null
  tokensSalida: number | null
  costoUsd: number | null
  latenciaMs: number | null
  validacion: Record<string, unknown> | null
  auditoriaFallback: Record<string, unknown> | null
  creadaEn: string
}

export interface DatosNuevoBriefing {
  id: string
  corteId: string
  modelo: string
  versionPrompt: string
  parametros: Record<string, unknown>
  salidaIa: Record<string, unknown> | null
  textoFinal: string
  fuente: 'ia' | 'plantilla'
  motivoFallback: string | null
  tokensEntrada: number | null
  tokensSalida: number | null
  costoUsd: number | null
  latenciaMs: number | null
  validacion: Record<string, unknown> | null
  auditoriaFallback: Record<string, unknown> | null
  creadaEn: string
}

type FilaBriefing = typeof infraBriefing.$inferSelect

// La columna `fuente` es text sin CHECK en el DDL: se restringe al unión de
// dominio al salir, normalizando cualquier valor inesperado a 'ia'.
function mapearFila(fila: FilaBriefing): BriefingPersistido {
  return {
    id: fila.id,
    corteId: fila.corteId,
    modelo: fila.modelo,
    versionPrompt: fila.versionPrompt,
    parametros: fila.parametros ?? null,
    salidaIa: fila.salidaIa ?? null,
    textoFinal: fila.textoFinal,
    fuente: fila.fuente === 'plantilla' ? 'plantilla' : 'ia',
    motivoFallback: fila.motivoFallback ?? null,
    tokensEntrada: fila.tokensEntrada ?? null,
    tokensSalida: fila.tokensSalida ?? null,
    costoUsd: fila.costoUsd ?? null,
    latenciaMs: fila.latenciaMs ?? null,
    validacion: fila.validacion ?? null,
    auditoriaFallback: fila.auditoriaFallback ?? null,
    creadaEn: fila.creadaEn,
  }
}

// Inserta el briefing y devuelve el registro final: el recién insertado o, si
// ya existía uno para ese corte, el preexistente (sin pisarlo).
export async function insertarBriefingSiNoExiste(
  datos: DatosNuevoBriefing,
): Promise<BriefingPersistido> {
  // El reintento ante SQLITE_BUSY re-ejecuta el bloque completo; tanto el
  // INSERT con onConflictDoNothing como el SELECT de respaldo son
  // idempotentes, así que repetir el intento no duplica ni pisa nada.
  return conReintentoPorBloqueo(() => insertarBriefingSiNoExisteIntento(datos))
}

async function insertarBriefingSiNoExisteIntento(
  datos: DatosNuevoBriefing,
): Promise<BriefingPersistido> {
  const db = getDb()

  const insertadas = await db
    .insert(infraBriefing)
    .values({
      id: datos.id,
      corteId: datos.corteId,
      modelo: datos.modelo,
      versionPrompt: datos.versionPrompt,
      parametros: datos.parametros,
      salidaIa: datos.salidaIa,
      textoFinal: datos.textoFinal,
      fuente: datos.fuente,
      motivoFallback: datos.motivoFallback,
      tokensEntrada: datos.tokensEntrada,
      tokensSalida: datos.tokensSalida,
      costoUsd: datos.costoUsd,
      latenciaMs: datos.latenciaMs,
      validacion: datos.validacion,
      auditoriaFallback: datos.auditoriaFallback,
      creadaEn: datos.creadaEn,
    })
    .onConflictDoNothing({ target: infraBriefing.corteId })
    .returning()

  if (insertadas[0]) return mapearFila(insertadas[0])

  // Conflicto en el insert: ya había un briefing para ese corte. Devolvemos
  // el existente, no el que se intentó insertar.
  const [existente] = await db
    .select()
    .from(infraBriefing)
    .where(eq(infraBriefing.corteId, datos.corteId))
    .limit(1)

  if (!existente) {
    throw new Error(`Briefing del corte ${datos.corteId} no se insertó ni existía previamente`)
  }
  return mapearFila(existente)
}

export async function obtenerBriefingPorId(id: string): Promise<BriefingPersistido | null> {
  const db = getDb()
  const [fila] = await db
    .select()
    .from(infraBriefing)
    .where(eq(infraBriefing.id, id))
    .limit(1)
  return fila ? mapearFila(fila) : null
}

export async function obtenerUltimoBriefing(): Promise<BriefingPersistido | null> {
  const db = getDb()
  const [fila] = await db
    .select()
    .from(infraBriefing)
    .orderBy(desc(infraBriefing.creadaEn))
    .limit(1)
  return fila ? mapearFila(fila) : null
}

function inicioMesUtc(ahora: Date): string {
  return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1)).toISOString()
}

function inicioMesSiguienteUtc(ahora: Date): string {
  return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() + 1, 1)).toISOString()
}

// Suma el costo de todos los briefings creados en el mes UTC de `ahora`, para
// el techo de presupuesto mensual. Los `costoUsd` nulos no aportan.
export async function sumarCostoUsdMesVigente(ahora: Date = new Date()): Promise<number> {
  const db = getDb()
  const filas = await db
    .select({ costoUsd: infraBriefing.costoUsd })
    .from(infraBriefing)
    .where(
      and(
        gte(infraBriefing.creadaEn, inicioMesUtc(ahora)),
        lt(infraBriefing.creadaEn, inicioMesSiguienteUtc(ahora)),
      ),
    )

  return filas.reduce(
    (total, fila) => (fila.costoUsd === null ? total : total + fila.costoUsd),
    0,
  )
}
