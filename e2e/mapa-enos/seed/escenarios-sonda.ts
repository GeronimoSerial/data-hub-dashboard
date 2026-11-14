import { spawn } from 'node:child_process'
import { and, desc, eq, notInArray } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { infraJobRun } from '@/lib/db/schema'
import type { Restaurar } from './escenarios-falla'
import { ESPERADOS_RIESGO } from './esperados'
import { ESPERADOS_HIDRO } from './hidro'

// Escenarios de la sonda de la cadena de datos (ENOS B7). La sonda corre el job real como proceso aparte,
// igual que el cron de Coolify: `node scripts/jobs.mjs sonda-cadena-datos`, desde la copia de trabajo que
// usa la app (el cwd de Playwright). Los testigos salen del seed: escuelas con corrida de riesgo vigente a
// 72 h y estaciones con lectura reciente.

const TIPO_SONDA = 'sonda-cadena-datos'

export const ESCUELAS_TESTIGO_SANAS = ESPERADOS_RIESGO.escuelas.slice(0, 3).map((escuela) => escuela.cueAnexo)
export const ESTACIONES_TESTIGO_SANAS = ESPERADOS_HIDRO.estaciones
  .filter((estacion) => !estacion.lecturaVencida)
  .slice(0, 2)
  .map((estacion) => estacion.estacionId)

/**
 * Corre el job de la sonda con la base e2e, rol consumidor (no consulta Prefectura) y los testigos en `env`.
 * Devuelve el código de salida del proceso: 0 si la cadena está sana, 1 si la sonda la marca fallida.
 */
export function correrSonda(env: Record<string, string> = {}): Promise<number> {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('correrSonda: falta DATABASE_URL en el proceso de prueba')
  const entorno = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    RIESGO_DATOS_ROL: 'consumidor',
    ENOS_JOBS_ENABLED: 'true',
    ...env,
  }
  return new Promise((resolve, reject) => {
    const hijo = spawn(process.execPath, ['scripts/jobs.mjs', TIPO_SONDA], {
      cwd: process.cwd(),
      env: entorno,
      stdio: 'inherit',
    })
    hijo.once('error', reject)
    hijo.once('exit', (codigo) => resolve(codigo ?? 1))
  })
}

/**
 * Registra las corridas previas de la sonda; la restauración borra solo las que creó el escenario, así la
 * clave idempotente por hora queda libre para la próxima prueba.
 */
export async function registrarCorridasSonda(): Promise<Restaurar> {
  const db = getDb()
  const previas = (
    await db.select({ id: infraJobRun.id }).from(infraJobRun).where(eq(infraJobRun.tipo, TIPO_SONDA))
  ).map((fila) => fila.id)
  return async () => {
    await db
      .delete(infraJobRun)
      .where(and(eq(infraJobRun.tipo, TIPO_SONDA), notInArray(infraJobRun.id, previas)))
  }
}

/** Última corrida de la sonda en la base (la que lee el panel de estado de los datos). */
export async function ultimaCorridaSonda() {
  const [fila] = await getDb()
    .select({
      estado: infraJobRun.estado,
      finalizadoEn: infraJobRun.finalizadoEn,
      contadores: infraJobRun.contadores,
      errorSaneado: infraJobRun.errorSaneado,
    })
    .from(infraJobRun)
    .where(eq(infraJobRun.tipo, TIPO_SONDA))
    .orderBy(desc(infraJobRun.creadaEn))
    .limit(1)
  return fila ?? null
}
