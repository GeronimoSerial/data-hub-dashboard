// Gestión de infra_job_run: lease renovable con expiración para que un job de
// ejecución finita evite corridas superpuestas, publique su resultado una
// sola vez (idempotencia) y pueda recuperarse si el proceso anterior murió
// con el lease vencido. Ver lib/db/schema.ts (tabla infraJobRun) y
// docs/ejecucion-enos/E0/report.md para el contrato completo.
import { randomUUID } from 'node:crypto'
import { and, eq, lte, or } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { infraJobRun } from '@/lib/db/schema'
import type { EstadoJob } from './tipos'

type AdquirirLeaseParams = {
  tipo: string
  claveIdempotente: string
  version: string
  duracionLeaseMs: number
  ahora?: Date
}

type AdquirirLeaseResultado =
  | { adquirido: true; jobRunId: string; leaseOwner: string }
  | { adquirido: false; motivo: 'en_progreso_vigente' | 'ya_completado' }

// Adquisición atómica: cada paso que puede competir con otra invocación
// concurrente usa un UPDATE/INSERT condicionado con `.returning()` y decide
// según si devolvió una fila, nunca con un select-then-act separado. Un
// review independiente (docs/ejecucion-enos/E0/report.md, hallazgo H3.1)
// encontró que la versión anterior (select, luego decidir, luego update sin
// condición) dejaba una ventana donde dos invocaciones concurrentes podían
// recuperar el mismo lease vencido y ambas terminar publicando resultado.
export async function adquirirLease(
  params: AdquirirLeaseParams,
): Promise<AdquirirLeaseResultado> {
  const db = getDb()
  const ahora = params.ahora ?? new Date()
  const ahoraIso = ahora.toISOString()
  const leaseExpiraEn = new Date(ahora.getTime() + params.duracionLeaseMs).toISOString()

  // Intento de creación atómico: si otra invocación concurrente ya insertó
  // la misma (tipo, claveIdempotente), el índice único hace que este INSERT
  // no inserte nada (onConflictDoNothing) en vez de lanzar.
  const leaseOwner = randomUUID()
  const [creada] = await db
    .insert(infraJobRun)
    .values({
      id: randomUUID(),
      tipo: params.tipo,
      claveIdempotente: params.claveIdempotente,
      intento: 1,
      iniciadoEn: ahoraIso,
      finalizadoEn: null,
      estado: 'en_progreso' satisfies EstadoJob,
      contadores: null,
      errorSaneado: null,
      version: params.version,
      leaseOwner,
      leaseExpiraEn,
      creadaEn: ahoraIso,
      actualizadaEn: ahoraIso,
    })
    .onConflictDoNothing({
      target: [infraJobRun.tipo, infraJobRun.claveIdempotente],
    })
    .returning({ id: infraJobRun.id })

  if (creada) {
    return { adquirido: true, jobRunId: creada.id, leaseOwner }
  }

  // Ya existía la fila: leer su estado actual para decidir, pero cualquier
  // transición de estado (recuperar lease vencido) se hace con un UPDATE
  // condicionado, nunca a partir de este read.
  const [fila] = await db
    .select()
    .from(infraJobRun)
    .where(
      and(eq(infraJobRun.tipo, params.tipo), eq(infraJobRun.claveIdempotente, params.claveIdempotente)),
    )
  if (!fila) {
    // No debería pasar (el insert falló por conflicto, la fila existe), pero
    // si ocurre por una carrera rarísima, tratarlo como lease no adquirible
    // en vez de asumir estado.
    return { adquirido: false, motivo: 'en_progreso_vigente' }
  }

  if (fila.estado === 'completado') {
    return { adquirido: false, motivo: 'ya_completado' }
  }

  // Recuperación atómica: sólo transiciona si, EN EL MOMENTO DEL UPDATE, el
  // estado sigue siendo 'fallido' o el lease sigue vencido. Si otra
  // invocación ya lo recuperó entre el select de arriba y este update, la
  // condición del WHERE no matchea y `.returning()` viene vacío.
  const leaseOwnerRecuperado = randomUUID()
  const [recuperada] = await db
    .update(infraJobRun)
    .set({
      intento: fila.intento + 1,
      estado: 'en_progreso' satisfies EstadoJob,
      iniciadoEn: ahoraIso,
      finalizadoEn: null,
      errorSaneado: null,
      leaseOwner: leaseOwnerRecuperado,
      leaseExpiraEn,
      actualizadaEn: ahoraIso,
    })
    .where(
      and(
        eq(infraJobRun.id, fila.id),
        or(eq(infraJobRun.estado, 'fallido'), lte(infraJobRun.leaseExpiraEn, ahoraIso)),
      ),
    )
    .returning({ id: infraJobRun.id })

  if (recuperada) {
    return { adquirido: true, jobRunId: recuperada.id, leaseOwner: leaseOwnerRecuperado }
  }

  // El UPDATE no matcheó: o el lease seguía vigente (no cumplía la condición
  // de vencido) o alguien más lo recuperó primero. Cualquiera de los dos
  // casos es 'en_progreso_vigente' desde la perspectiva de esta invocación.
  return { adquirido: false, motivo: 'en_progreso_vigente' }
}

type RenovarLeaseParams = {
  jobRunId: string
  leaseOwner: string
  duracionLeaseMs: number
  ahora?: Date
}

export async function renovarLease(params: RenovarLeaseParams): Promise<boolean> {
  const db = getDb()
  const ahora = params.ahora ?? new Date()
  const leaseExpiraEn = new Date(ahora.getTime() + params.duracionLeaseMs).toISOString()

  const [renovada] = await db
    .update(infraJobRun)
    .set({ leaseExpiraEn, actualizadaEn: ahora.toISOString() })
    .where(
      and(
        eq(infraJobRun.id, params.jobRunId),
        eq(infraJobRun.estado, 'en_progreso'),
        eq(infraJobRun.leaseOwner, params.leaseOwner),
      ),
    )
    .returning({ id: infraJobRun.id })

  return Boolean(renovada)
}

type PublicarResultadoParams = {
  jobRunId: string
  leaseOwner: string
  estado: 'completado' | 'fallido'
  contadores?: Record<string, number>
  errorSaneado?: string
  ahora?: Date
}

export async function publicarResultado(params: PublicarResultadoParams): Promise<boolean> {
  const db = getDb()
  const ahora = params.ahora ?? new Date()

  // CAS: el UPDATE sólo aplica si, en el momento de ejecutarse, el estado
  // TODAVÍA no es 'completado'. Esto cierra la ventana que el review
  // independiente marcó como H3.1: dos llamadas casi simultáneas ya no
  // pueden pasar ambas un check-then-act separado — sólo una de las dos
  // consigue que el WHERE matchee, la otra ve `.returning()` vacío y no
  // pisa nada.
  // Fencing: además del estado, el UPDATE exige que el leaseOwner coincida.
  // Si otro proceso recuperó el lease (mismo id, nuevo leaseOwner), el WHERE
  // no matchea y devolvemos false en vez de pisar el trabajo ajeno.
  // Idempotencia: si el UPDATE no matchea (no existe, ya no está
  // 'en_progreso', o el leaseOwner no es el nuestro), simplemente no hace
  // nada; un resultado ya publicado nunca se sobreescribe.
  const [publicada] = await db
    .update(infraJobRun)
    .set({
      estado: params.estado satisfies EstadoJob,
      finalizadoEn: ahora.toISOString(),
      contadores: params.contadores,
      errorSaneado: params.errorSaneado ?? null,
      leaseOwner: null,
      leaseExpiraEn: null,
      actualizadaEn: ahora.toISOString(),
    })
    .where(
      and(
        eq(infraJobRun.id, params.jobRunId),
        eq(infraJobRun.estado, 'en_progreso'),
        eq(infraJobRun.leaseOwner, params.leaseOwner),
      ),
    )
    .returning({ id: infraJobRun.id })

  return Boolean(publicada)
}
