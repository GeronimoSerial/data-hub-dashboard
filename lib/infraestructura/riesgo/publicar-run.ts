// Publicador explícito del puntero operativo de riesgo (U1 de
// "Motor v0.4/PLAN_IMPLEMENTACION.md"): la transición a 'vigente' es una
// operación propia y transaccional, no consecuencia de que un job termine.
//
// Valida en servidor, dentro de la misma transacción que publica, que el run
// exista, siga 'preparando', sea `modo = 'operativo'` y su `modeloVersion` sea
// una versión operativa: motor-v0.4 (promovido en T11) o motor-v0.3 (rollback
// de un ciclo con RIESGO_REGLAS_MOTOR=v0.3; se retira tras verificar la
// promoción, docs/motor-v0.4/promocion.md). Un candidato o un run de otra
// versión se rechazan sin tocar nada. La restricción
// infra_risk_run_candidato_no_vigente (migración 0024) es la segunda barrera.
import { and, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { conReintentoPorBloqueo } from '@/lib/db/reintento'
import { infraRiskRun } from '@/lib/db/schema'
import { MOTOR_VERSION, MOTOR_VERSION_V03 } from './motor/config'

export const VERSIONES_OPERATIVAS: readonly string[] = [MOTOR_VERSION, MOTOR_VERSION_V03]

export type ResultadoPublicacionRun =
  | { publicado: true }
  | {
      publicado: false
      motivo: 'run_inexistente' | 'modo_candidato' | 'version_no_operativa' | 'estado_no_publicable'
    }

type RechazoPublicacion = Extract<ResultadoPublicacionRun, { publicado: false }>

export async function publicarRunOperativo(params: {
  runId: string
  cobertura: Record<string, number>
}): Promise<ResultadoPublicacionRun> {
  const db = getDb()
  // Reintento seguro ante bloqueo: la transacción se revierte entera si falla
  // a mitad de camino, y repetirla desde cero re-valida contra el estado real
  // y produce el mismo estado final (vencer el vigente anterior + publicar
  // este run), sin duplicar ni saltear ninguna actualización.
  return conReintentoPorBloqueo(() =>
    db.transaction(async (tx): Promise<ResultadoPublicacionRun> => {
      const [run] = await tx
        .select({ modo: infraRiskRun.modo, modeloVersion: infraRiskRun.modeloVersion, estado: infraRiskRun.estado })
        .from(infraRiskRun)
        .where(eq(infraRiskRun.id, params.runId))
        .for('update')
      const rechazo = motivoDeRechazo(run)
      if (rechazo) return rechazo

      // Sólo estas 2 actualizaciones: los inserts masivos ya se hicieron fuera
      // de la transacción, con el run 'preparando' e invisible para lectores.
      await tx.update(infraRiskRun).set({ estado: 'vencido' }).where(eq(infraRiskRun.estado, 'vigente'))
      const [publicado] = await tx
        .update(infraRiskRun)
        .set({ estado: 'vigente', publicadoEn: new Date().toISOString(), cobertura: params.cobertura })
        .where(
          and(eq(infraRiskRun.id, params.runId), eq(infraRiskRun.modo, 'operativo'), eq(infraRiskRun.estado, 'preparando')),
        )
        .returning({ id: infraRiskRun.id })
      // Inalcanzable con la fila bloqueada arriba; si ocurriera, lanzar
      // revierte también el vencimiento del vigente anterior.
      if (!publicado) throw new Error('publicar-run: el run cambió durante la publicación')
      return { publicado: true }
    }),
  )
}

function motivoDeRechazo(
  run: { modo: string; modeloVersion: string; estado: string } | undefined,
): RechazoPublicacion | null {
  if (!run) return { publicado: false, motivo: 'run_inexistente' }
  if (run.modo !== 'operativo') return { publicado: false, motivo: 'modo_candidato' }
  if (!VERSIONES_OPERATIVAS.includes(run.modeloVersion)) return { publicado: false, motivo: 'version_no_operativa' }
  if (run.estado !== 'preparando') return { publicado: false, motivo: 'estado_no_publicable' }
  return null
}
