import type { Regla } from './consistencia-parte'

// Contradicción con la situación activa de la escuela (T6). Módulo puro: lo
// usan el asistente (cuando conoce el estado actual) y la ruta del servidor,
// dentro de la transacción, con el estado leído de la base.
//
// Regla: pasar el edificio de evacuado o centro de evacuados a habitual exige
// que cada afectación activa quede resuelta en el mismo envío (solucionada o
// retirada) o confirmada como "sigue activa", y que el servicio vuelva a
// normal en el mismo envío. Una afectación confirmada como activa no bloquea,
// pero deja una advertencia en línea.

export type EstadoEdificioActivo = 'habitual' | 'parcial' | 'evacuado' | 'centro_evacuados' | 'sin_clases'
export type ServicioActivo = 'normal' | 'parcial' | 'suspendido'

export interface EntradaCambioAHabitual {
  estadoActual: EstadoEdificioActivo | null
  nuevoEstado: EstadoEdificioActivo | null
  // Estado general del servicio según la base (o el asistente, si lo conoce).
  servicioActual: ServicioActivo
  // Lo que el envío declara para el servicio; null si el envío no lo toca.
  servicioEnvio: 'normal' | 'suspendido' | null
  afectacionesActivas: { id: string }[]
  // Afectaciones que este envío resuelve (solucionadas o retiradas).
  solucionadas: string[]
  // Afectaciones que el envío confirma como activas.
  sigueActiva: string[]
}

export interface ResultadoCambioAHabitual {
  bloqueos: Regla[]
  advertencias: Regla[]
}

const SIN_RESULTADO: ResultadoCambioAHabitual = { bloqueos: [], advertencias: [] }

const ESTADOS_CON_EVACUACION: readonly EstadoEdificioActivo[] = ['evacuado', 'centro_evacuados']

export function evaluarCambioAHabitual(entrada: EntradaCambioAHabitual): ResultadoCambioAHabitual {
  const aplica =
    entrada.nuevoEstado === 'habitual' &&
    entrada.estadoActual !== null &&
    ESTADOS_CON_EVACUACION.includes(entrada.estadoActual)
  if (!aplica) return SIN_RESULTADO

  const resueltas = new Set([...entrada.solucionadas, ...entrada.sigueActiva])
  const pendientes = entrada.afectacionesActivas.filter((a) => !resueltas.has(a.id))
  const servicioSuspendido = entrada.servicioActual !== 'normal' && entrada.servicioEnvio !== 'normal'

  const bloqueos: Regla[] = []
  if (pendientes.length > 0) {
    bloqueos.push({
      codigo: 'habitual-con-afectaciones-activas',
      campo: 'edificio',
      mensaje: 'Antes de figurar como habitual, indique qué pasa con cada afectación activa: solucionada o sigue activa.',
    })
  }
  if (servicioSuspendido) {
    bloqueos.push({
      codigo: 'habitual-con-servicio-suspendido',
      campo: 'clases',
      mensaje: 'El servicio sigue suspendido. Para figurar como habitual, indique que las clases vuelven a dictarse.',
    })
  }

  const activas = new Set(entrada.afectacionesActivas.map((a) => a.id))
  const advertencias: Regla[] = entrada.sigueActiva.some((id) => activas.has(id))
    ? [{
        codigo: 'habitual-con-afectacion-activa',
        campo: 'edificio',
        mensaje: 'Se mantiene una afectación activa con el edificio figurando como habitual. Verifique la situación.',
      }]
    : []

  return { bloqueos, advertencias }
}
