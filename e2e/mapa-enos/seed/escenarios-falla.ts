import { eq, notInArray } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { infraRiskRun, infraSituacionCorte } from '@/lib/db/schema'
import { generarCorte } from '@/lib/infraestructura/riesgo/situacion/corte'

// Escenarios de falla del Centro de Situación (plan 9.4). Cada escenario se aplica dentro de la
// prueba y devuelve su restauración, que deja la base con los valores exactos previos.
// Usa las funciones y el esquema de la app: el corte lo arma generarCorte, la misma función del job.

export type Restaurar = () => Promise<void>

const DIA_MS = 24 * 60 * 60 * 1000

/**
 * Corte nuevo sobre la corrida vigente, sin tocar la corrida. El seed no genera cortes, así que sin
 * esto el encabezado dice "Todavía no se generó ningún corte" y el control sano no prueba nada.
 */
export async function prepararCorteFresco(): Promise<Restaurar> {
  const db = getDb()
  const previos = (await db.select({ id: infraSituacionCorte.id }).from(infraSituacionCorte)).map((fila) => fila.id)
  await generarCorte({ ahora: new Date(), jobRunId: null })
  return async () => {
    // Borra solo los cortes creados por el escenario; los previos quedan intactos.
    await db.delete(infraSituacionCorte).where(notInArray(infraSituacionCorte.id, previos))
  }
}

/**
 * La corrida de riesgo vigente se publicó hace `dias` días y el corte se genera encima de ella, así
 * el corte es nuevo y el dato que muestra es viejo (I1). Restaura la fecha de publicación original.
 */
export async function prepararRunDesactualizada(dias: number): Promise<Restaurar> {
  const db = getDb()
  const [vigente] = await db
    .select({ id: infraRiskRun.id, publicadoEn: infraRiskRun.publicadoEn })
    .from(infraRiskRun)
    .where(eq(infraRiskRun.estado, 'vigente'))
    .limit(1)
  if (!vigente) throw new Error('prepararRunDesactualizada: no hay corrida de riesgo vigente en la base e2e')

  await db
    .update(infraRiskRun)
    .set({ publicadoEn: new Date(Date.now() - dias * DIA_MS).toISOString() })
    .where(eq(infraRiskRun.id, vigente.id))
  const restaurarCorte = await prepararCorteFresco()

  return async () => {
    await restaurarCorte()
    await db.update(infraRiskRun).set({ publicadoEn: vigente.publicadoEn }).where(eq(infraRiskRun.id, vigente.id))
  }
}
