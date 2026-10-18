// Rol del entorno frente a Open-Meteo. Staging y dev comparten la IP de salida
// con producción y Open-Meteo cuenta el cupo gratuito por IP: sólo producción
// (productor) consulta la API; los consumidores replican desde hub_prod
// (scripts/replicar-riesgo-om.mjs, docs/riesgo-om-replicacion.md).
//
// Módulo puro (sin imports): lo cargan scripts/jobs.mjs antes de migrar y
// jobs-esperados.ts al evaluar la salud de los jobs.

export type RolEntorno = 'productor' | 'consumidor'

export const VARIABLE_ROL = 'RIESGO_DATOS_ROL'

const BASES_CONSUMIDORAS = new Set(['hub_staging', 'hub_dev'])

// Productores cuyos datos se replican desde producción. Todos consultan
// Open-Meteo salvo verificar-radar-meteo, que deriva de los runs replicados y
// también se replica (correrlo en el consumidor pisaría la copia).
export const JOBS_OPEN_METEO: readonly string[] = [
  'sync-pronostico-caudal',
  'sync-ensemble',
  'sync-seasonal',
  'climatologia-precipitacion',
  'climatologia-caudal',
  'sync-radar-meteo',
  'sync-radar-ensemble',
  'verificar-radar-meteo',
]

type Entorno = Record<string, string | undefined>

function baseDeDatos(url: string | undefined): string | null {
  if (!url) return null
  try {
    return decodeURIComponent(new URL(url).pathname).replace(/^\//, '')
  } catch {
    return null
  }
}

/**
 * Explícito gana; un valor inválido es consumidor (nunca gasta cupo por un
 * error de tipeo). Sin valor, hub_staging/hub_dev ⇒ consumidor y cualquier otra
 * base ⇒ productor, para que producción no requiera configuración nueva.
 */
export function rolEntorno(env: Entorno = process.env): RolEntorno {
  const explicito = env[VARIABLE_ROL]
  if (explicito !== undefined) {
    const valor = explicito.trim().toLowerCase()
    return valor === 'productor' ? 'productor' : 'consumidor'
  }
  const base = baseDeDatos(env.DATABASE_URL)
  return base !== null && BASES_CONSUMIDORAS.has(base) ? 'consumidor' : 'productor'
}

export class RolConsumidorError extends Error {
  constructor() {
    super(`Entorno consumidor (${VARIABLE_ROL}): Open-Meteo se replica desde producción, no se consulta`)
    this.name = 'RolConsumidorError'
  }
}

/** Punto de enganche para cualquier cliente Open-Meteo: lanza en rol consumidor. */
export function asegurarProductorOpenMeteo(env: Entorno = process.env): void {
  if (rolEntorno(env) === 'consumidor') throw new RolConsumidorError()
}
