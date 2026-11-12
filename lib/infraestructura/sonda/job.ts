// Job horario de la sonda de cadena de datos. Mismo esquema que
// sync-prefectura-alturas: lease, clave idempotente por hora UTC y publicación
// de contadores. Sólo el rol productor consulta Prefectura en vivo (CA4).
import { cargarReferencias } from '@/lib/infraestructura/datasets/repositorio'
import { adquirirLease, publicarResultado } from '../riesgo/job-run'
import { rolEntorno } from '../riesgo/providers/rol-entorno'
import { claveIdempotenteDeHora } from '../hidrometria/sync-prefectura-alturas'
import { ejecutarSonda, type ResultadoSonda } from './cadena'

const TIPO_JOB = 'sonda-cadena-datos'
const VERSION_JOB = 'sonda-cadena-datos-v1'
const DURACION_LEASE_MS = 5 * 60 * 1000
const LARGO_ERROR_MAX = 250
const ERROR_GENERICO = 'Fallo en la sonda de cadena de datos'

export type ResultadoSondaCadena =
  | { ejecutado: false; estado: 'omitido' }
  | { ejecutado: false; estado: 'fallido'; mensaje: string }
  | { ejecutado: true; estado: 'completo'; contadores: Record<string, number> }

function contadoresDe(resultado: ResultadoSonda): Record<string, number> {
  return {
    escuelasVerificadas: resultado.escuelasVerificadas,
    escuelasFallidas: resultado.escuelasFallidas.length,
    estacionesVerificadas: resultado.estacionesVerificadas,
    estacionesFallidas: resultado.estacionesFallidas.length,
    discrepancias: resultado.discrepancias.length,
    prefecturaConsultada: resultado.prefecturaConsultada ? 1 : 0,
  }
}

// Fixed-format lines built from configured CUEs and station ids only; no page text.
function resumenDeFallas(resultado: ResultadoSonda): string {
  const lineas = [
    ...resultado.escuelasFallidas.map((cue) => `Escuela testigo sin corrida vigente: ${cue}`),
    ...resultado.estacionesFallidas.map((id) => `Estación testigo sin lectura reciente: ${id}`),
    ...resultado.discrepancias.map((id) => `Discrepancia con Prefectura en estación: ${id}`),
  ]
  return lineas.join('; ').slice(0, LARGO_ERROR_MAX)
}

export async function correrSondaCadenaDatos(
  opts: { ahora?: Date; fetchImpl?: typeof fetch } = {},
): Promise<ResultadoSondaCadena> {
  await cargarReferencias()
  const ahora = opts.ahora ?? new Date()
  const lease = await adquirirLease({
    tipo: TIPO_JOB,
    claveIdempotente: claveIdempotenteDeHora(ahora),
    version: VERSION_JOB,
    duracionLeaseMs: DURACION_LEASE_MS,
    ahora,
  })
  if (!lease.adquirido) return { ejecutado: false, estado: 'omitido' }

  try {
    const resultado = await ejecutarSonda({
      ahora,
      consultarPrefectura: rolEntorno() === 'productor',
      fetchImpl: opts.fetchImpl,
    })
    const contadores = contadoresDe(resultado)
    const resumen = resumenDeFallas(resultado)
    if (resumen.length > 0) {
      await publicarResultado({
        jobRunId: lease.jobRunId,
        leaseOwner: lease.leaseOwner,
        estado: 'fallido',
        contadores,
        errorSaneado: resumen,
        ahora,
      })
      return { ejecutado: false, estado: 'fallido', mensaje: resumen }
    }
    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'completado',
      contadores,
      ahora,
    })
    return { ejecutado: true, estado: 'completo', contadores }
  } catch {
    await publicarResultado({
      jobRunId: lease.jobRunId,
      leaseOwner: lease.leaseOwner,
      estado: 'fallido',
      errorSaneado: ERROR_GENERICO,
      ahora,
    })
    return { ejecutado: false, estado: 'fallido', mensaje: ERROR_GENERICO }
  }
}
