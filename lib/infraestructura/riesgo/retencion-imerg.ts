// Retención de `hazard_observation` para IMERG: se conservan como máximo 90 días
// de observaciones satelitales (decisión del dueño, 13/11/2026). Sólo se toca
// el proveedor `nasa-imerg`; otros proveedores y la climatología no se purgan.
//
// Mismo molde que `retencion-pronostico.ts`: borrado en lotes acotados, nunca una
// sentencia masiva (la base comparte instancia y el pool corta a los 30 s).
// Cada lote filtra por (provider, variable, observado_en) para recorrer sólo el
// rango viejo con `hazard_observation_provider_variable_observado_idx`.
import { sql } from 'drizzle-orm'
import { DIAS_RETENCION_MINIMOS, type EjecutorSql } from './retencion-pronostico'

export const RETENCION_IMERG_DIAS = 90

const PROVIDER_IMERG = 'nasa-imerg'
const MS_POR_DIA = 24 * 60 * 60 * 1000

export type OpcionesPurgaImerg = {
  ahora: Date
  dias?: number
  tamanoLote?: number
  maxLotes?: number
}

export type ResultadoPurgaImerg = {
  borradas: number
  lotes: number
  corte: string
}

function esEnteroPositivo(valor: number): boolean {
  return Number.isInteger(valor) && valor > 0
}

// Variables del proveedor sin recorrer la tabla: salto de valor en valor sobre el índice.
async function variablesDeImerg(executor: EjecutorSql): Promise<string[]> {
  const resultado = (await executor.execute(sql`
    WITH RECURSIVE v AS (
      SELECT min(variable) AS variable FROM hazard_observation WHERE provider = ${PROVIDER_IMERG}
      UNION ALL
      SELECT (SELECT min(variable) FROM hazard_observation
              WHERE provider = ${PROVIDER_IMERG} AND variable > v.variable)
      FROM v WHERE v.variable IS NOT NULL
    )
    SELECT variable FROM v WHERE variable IS NOT NULL
  `)) as { rows?: { variable: string }[] }
  return (resultado.rows ?? []).map((fila) => fila.variable)
}

// Borra las observaciones con `observado_en` ESTRICTAMENTE anterior a `ahora - dias`:
// una fila justo en el límite de 90 días se conserva. `observado_en` es texto ISO UTC,
// así que la comparación lexicográfica coincide con la temporal.
export async function purgarImergAntiguo(
  executor: EjecutorSql,
  opciones: OpcionesPurgaImerg,
): Promise<ResultadoPurgaImerg> {
  const { ahora, dias = RETENCION_IMERG_DIAS, tamanoLote = 20_000, maxLotes = 100 } = opciones

  if (!Number.isInteger(dias) || dias < DIAS_RETENCION_MINIMOS) {
    throw new Error(
      `purgarImergAntiguo: dias debe ser un entero >= ${DIAS_RETENCION_MINIMOS} (recibido ${dias})`,
    )
  }
  if (!esEnteroPositivo(tamanoLote) || !esEnteroPositivo(maxLotes)) {
    throw new Error('purgarImergAntiguo: tamanoLote y maxLotes deben ser enteros positivos')
  }

  const corte = new Date(ahora.getTime() - dias * MS_POR_DIA).toISOString()

  let borradas = 0
  let lotes = 0
  for (const variable of await variablesDeImerg(executor)) {
    while (lotes < maxLotes) {
      const resultado = (await executor.execute(sql`
        DELETE FROM hazard_observation
        WHERE ctid IN (
          SELECT ctid FROM hazard_observation
          WHERE provider = ${PROVIDER_IMERG} AND variable = ${variable} AND observado_en < ${corte}
          LIMIT ${tamanoLote}
        )
        RETURNING 1
      `)) as { rows?: unknown[] }
      const borradasEnLote = resultado.rows?.length ?? 0
      lotes += 1
      borradas += borradasEnLote
      if (borradasEnLote < tamanoLote) break
    }
  }

  return { borradas, lotes, corte }
}
