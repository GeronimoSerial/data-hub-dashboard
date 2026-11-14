import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { infraRiskRun } from '@/lib/db/schema'
import { type Restaurar, prepararCorteFresco, prepararEstadoSano } from './escenarios-falla'

// Escenarios de los indicadores del Centro de Situación (I6, I7, I9). Igual que escenarios-falla.ts:
// cada escenario se aplica dentro de la prueba y devuelve su restauración con los valores previos.

/**
 * Cobertura del run vigente: `conEvidencia` de `procesadas` escuelas con evidencia. El corte copia
 * `infra_risk_run.cobertura` y el KPI de riesgo alto muestra "Cobertura N%" a partir de ese dato.
 */
export async function prepararCoberturaVigente(procesadas: number, conEvidencia: number): Promise<Restaurar> {
  const db = getDb()
  const [vigente] = await db
    .select({ id: infraRiskRun.id, cobertura: infraRiskRun.cobertura })
    .from(infraRiskRun)
    .where(eq(infraRiskRun.estado, 'vigente'))
    .limit(1)
  if (!vigente) throw new Error('prepararCoberturaVigente: no hay corrida de riesgo vigente en la base e2e')

  await db
    .update(infraRiskRun)
    .set({ cobertura: { procesadas, conEvidencia, sinEvidencia: procesadas - conEvidencia } })
    .where(eq(infraRiskRun.id, vigente.id))
  const restaurarCorte = await prepararCorteFresco()

  return async () => {
    await restaurarCorte()
    await db.update(infraRiskRun).set({ cobertura: vigente.cobertura }).where(eq(infraRiskRun.id, vigente.id))
  }
}

/**
 * Una fuente de salud degradada dentro de su TTL (actualizarSaludFuente con 0 filas recibidas, la
 * misma ruta que usa el job), con el estado sano del resto y un corte nuevo encima.
 */
export async function prepararFuenteDegradada(provider: string): Promise<Restaurar> {
  const restaurarEstado = await prepararEstadoSano({ fuentesSinFilas: [provider] })
  const restaurarCorte = await prepararCorteFresco()

  return async () => {
    await restaurarCorte()
    await restaurarEstado()
  }
}

/**
 * Sin corrida de riesgo vigente: la corrida pasa a `vencido` (fuera de vigente, el índice parcial queda
 * libre) y se genera un corte nuevo. La restauración devuelve la corrida a `vigente`.
 */
export async function prepararSinRunVigente(): Promise<Restaurar> {
  const db = getDb()
  const [vigente] = await db
    .select({ id: infraRiskRun.id })
    .from(infraRiskRun)
    .where(eq(infraRiskRun.estado, 'vigente'))
    .limit(1)
  if (!vigente) throw new Error('prepararSinRunVigente: no hay corrida de riesgo vigente en la base e2e')

  await db.update(infraRiskRun).set({ estado: 'vencido' }).where(eq(infraRiskRun.id, vigente.id))
  const restaurarCorte = await prepararCorteFresco()

  return async () => {
    await restaurarCorte()
    await db.update(infraRiskRun).set({ estado: 'vigente' }).where(eq(infraRiskRun.id, vigente.id))
  }
}
