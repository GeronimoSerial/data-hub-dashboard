// Reserva atómica del presupuesto mensual de E8 (briefing narrativo asistido
// por IA). El costo real no se conoce hasta después de llamar al modelo, así
// que se reserva una estimación conservadora ANTES de llamar (CAS con
// .returning(), nunca select-then-compare) y se ajusta con el costo real al
// terminar. Esto es lo que impide que dos corridas casi simultáneas para
// cortes distintos lean el mismo acumulado, ambas pasen el chequeo y juntas
// superen el techo mensual — mismo defecto de clase que infraJobRun (ver
// lib/infraestructura/riesgo/job-run.ts), misma solución: CAS reintentado
// ante SQLITE_BUSY con conReintentoPorBloqueo.
import { eq, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { conReintentoPorBloqueo } from '@/lib/db/reintento'
import { infraBriefingPresupuestoMes } from '@/lib/db/schema'

export function inicioMesUtc(ahora: Date): string {
  return new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1)).toISOString()
}

export interface ReservarPresupuestoParams {
  montoReservaUsd: number
  presupuestoUsdMes: number
  ahora?: Date
}

export type ReservarPresupuestoResultado =
  | { reservado: true; mes: string }
  | { reservado: false; mes: string }

// Reserva 'montoReservaUsd' contra el acumulado del mes de 'ahora'. Sólo
// procede si, en el momento del UPDATE/INSERT (no en una lectura previa), el
// acumulado + la reserva no supera 'presupuestoUsdMes'.
export async function reservarPresupuestoMes(
  params: ReservarPresupuestoParams,
): Promise<ReservarPresupuestoResultado> {
  return conReintentoPorBloqueo(() => reservarPresupuestoMesIntento(params))
}

async function reservarPresupuestoMesIntento(
  params: ReservarPresupuestoParams,
): Promise<ReservarPresupuestoResultado> {
  const db = getDb()
  const ahora = params.ahora ?? new Date()
  const mes = inicioMesUtc(ahora)
  const ahoraIso = ahora.toISOString()

  // Caso mes nuevo: INSERT condicionado (onConflictDoNothing). Si otra
  // invocación concurrente ya creó la fila del mes, este INSERT no inserta
  // nada en vez de fallar.
  const [creada] = await db
    .insert(infraBriefingPresupuestoMes)
    .values({ mes, acumuladoUsd: params.montoReservaUsd, actualizadaEn: ahoraIso })
    .onConflictDoNothing({ target: infraBriefingPresupuestoMes.mes })
    .returning({ mes: infraBriefingPresupuestoMes.mes })

  if (creada) {
    if (params.montoReservaUsd > params.presupuestoUsdMes) {
      // La reserva sola ya excede el techo de un mes recién creado: revertir
      // (nadie más pudo sumar nada porque la fila no existía hasta este
      // INSERT) y reportar no reservado.
      await db.delete(infraBriefingPresupuestoMes).where(eq(infraBriefingPresupuestoMes.mes, mes))
      return { reservado: false, mes }
    }
    return { reservado: true, mes }
  }

  // Ya existía la fila del mes: UPDATE condicionado por el WHERE, nunca a
  // partir de un select previo. Si el WHERE no matchea (la suma excedería el
  // techo EN EL MOMENTO del update), '.returning()' viene vacío.
  const [actualizada] = await db
    .update(infraBriefingPresupuestoMes)
    .set({
      acumuladoUsd: sql`${infraBriefingPresupuestoMes.acumuladoUsd} + ${params.montoReservaUsd}`,
      actualizadaEn: ahoraIso,
    })
    .where(
      sql`${infraBriefingPresupuestoMes.mes} = ${mes} AND ${infraBriefingPresupuestoMes.acumuladoUsd} + ${params.montoReservaUsd} <= ${params.presupuestoUsdMes}`,
    )
    .returning({ mes: infraBriefingPresupuestoMes.mes })

  return actualizada ? { reservado: true, mes } : { reservado: false, mes }
}

export interface AjustarPresupuestoParams {
  mes: string
  deltaUsd: number
  ahora?: Date
}

// Corrige el acumulado con la diferencia entre lo reservado y el costo real
// ('deltaUsd' = costoReal - montoReservado, puede ser negativo). No necesita
// condición: la reserva ya pasó el CAS, esto sólo corrige el número.
export async function ajustarPresupuestoMes(params: AjustarPresupuestoParams): Promise<void> {
  return conReintentoPorBloqueo(() => ajustarPresupuestoMesIntento(params))
}

async function ajustarPresupuestoMesIntento(params: AjustarPresupuestoParams): Promise<void> {
  const db = getDb()
  const ahoraIso = (params.ahora ?? new Date()).toISOString()
  await db
    .update(infraBriefingPresupuestoMes)
    .set({
      acumuladoUsd: sql`${infraBriefingPresupuestoMes.acumuladoUsd} + ${params.deltaUsd}`,
      actualizadaEn: ahoraIso,
    })
    .where(eq(infraBriefingPresupuestoMes.mes, params.mes))
}
