// Retención de `hazard_forecast`: cada corrida del pronóstico (~495k filas por
// corrida, 4 corridas/día) crece sin límite. Los lectores sólo usan la última
// corrida por (provider, variable, geometryRef), así que basta con conservar
// una ventana de corridas recientes (14 días, igual que `ventanaDias` en
// scripts/lib/replicacion-riesgo-om.mjs).
//
// El borrado va en lotes acotados: la base comparte instancia y ya tuvo el
// disco lleno, así que nunca se hace un DELETE masivo de una sola sentencia.
import { sql, type SQL } from 'drizzle-orm'

const MS_POR_DIA = 24 * 60 * 60 * 1000
// Piso de seguridad: impide que una llamada mal parametrizada vacíe la tabla.
export const DIAS_RETENCION_MINIMOS = 7

export type EjecutorSql = {
  execute: (query: SQL) => Promise<unknown>
}

export type OpcionesPurgaPronostico = {
  ahora: Date
  dias?: number
  tamanoLote?: number
  maxLotes?: number
}

export type ResultadoPurgaPronostico = {
  borradas: number
  lotes: number
  corte: string
}

function esEnteroPositivo(valor: number): boolean {
  return Number.isInteger(valor) && valor > 0
}

// Borra las corridas con `corrida_en` anterior a `ahora - dias`. `corrida_en`
// es texto ISO UTC, así que la comparación lexicográfica coincide con la
// temporal. Cada lote borra como máximo `tamanoLote` filas; se corta cuando un
// lote viene incompleto (ya no quedan filas antiguas) o al llegar a `maxLotes`.
export async function purgarPronosticoAntiguo(
  executor: EjecutorSql,
  opciones: OpcionesPurgaPronostico,
): Promise<ResultadoPurgaPronostico> {
  const { ahora, dias = 14, tamanoLote = 100_000, maxLotes = 40 } = opciones

  if (!Number.isInteger(dias) || dias < DIAS_RETENCION_MINIMOS) {
    throw new Error(
      `purgarPronosticoAntiguo: dias debe ser un entero >= ${DIAS_RETENCION_MINIMOS} (recibido ${dias})`,
    )
  }
  if (!esEnteroPositivo(tamanoLote) || !esEnteroPositivo(maxLotes)) {
    throw new Error('purgarPronosticoAntiguo: tamanoLote y maxLotes deben ser enteros positivos')
  }

  const corte = new Date(ahora.getTime() - dias * MS_POR_DIA).toISOString()

  let borradas = 0
  let lotes = 0
  while (lotes < maxLotes) {
    const resultado = (await executor.execute(sql`
      DELETE FROM hazard_forecast
      WHERE ctid IN (
        SELECT ctid FROM hazard_forecast
        WHERE corrida_en < ${corte}
        LIMIT ${tamanoLote}
      )
      RETURNING 1
    `)) as { rows?: unknown[] }
    const borradasEnLote = resultado.rows?.length ?? 0
    lotes += 1
    borradas += borradasEnLote
    if (borradasEnLote < tamanoLote) break
  }

  return { borradas, lotes, corte }
}
