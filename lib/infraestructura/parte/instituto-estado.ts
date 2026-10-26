// Estado general del servicio para institutos superiores. El alcance es por
// carrera (tipo 'carrera', referenciaId = id de carrera). Sin turnos ni
// secciones: el establecimiento entero sigue valiendo como fila de respaldo.
// Mismo desempate determinista que calcularEstadoServicioGeneral: gana la fila
// con creadaEn más reciente y, si empata, el id mayor.
import type { EstadoServicioGeneral, SeccionEstablecimiento, ServicioAlcance } from '@/lib/infraestructura/trayectoria-tipos'
import { calcularEstadoServicioGeneral } from '@/lib/infraestructura/servicio-educativo'

function ganaLaNueva(actual: ServicioAlcance, nueva: ServicioAlcance): boolean {
  if (nueva.creadaEn !== actual.creadaEn) return nueva.creadaEn > actual.creadaEn
  return nueva.id > actual.id
}

// 'parcial' si algunas carreras están suspendidas, 'suspendido' si lo están todas.
function estadoPorCarreras(alcanceVigente: ServicioAlcance[], carreras: number[]): EstadoServicioGeneral {
  const porCarrera = new Map<number, ServicioAlcance>()
  let establecimiento: ServicioAlcance | undefined
  for (const fila of alcanceVigente) {
    if (fila.tipo === 'carrera' && fila.referenciaId !== null) {
      const clave = Number(fila.referenciaId)
      const actual = porCarrera.get(clave)
      if (!actual || ganaLaNueva(actual, fila)) porCarrera.set(clave, fila)
    } else if (fila.tipo === 'establecimiento') {
      if (!establecimiento || ganaLaNueva(establecimiento, fila)) establecimiento = fila
    }
  }
  let normales = 0
  let suspendidas = 0
  for (const carrera of carreras) {
    const efectivo = porCarrera.get(carrera)?.estado ?? establecimiento?.estado ?? 'normal'
    if (efectivo === 'suspendido') suspendidas++
    else normales++
  }
  if (suspendidas === 0) return 'normal'
  if (normales === 0) return 'suspendido'
  return 'parcial'
}

// `carreras` son las unidades del instituto en el corte vigente. Sin carreras
// (GE) se usa el cálculo GE; las filas 'carrera' sólo las interpreta este módulo.
export function estadoGeneralDelCue(
  alcanceVigente: ServicioAlcance[],
  secciones: SeccionEstablecimiento[],
  carreras: number[],
): EstadoServicioGeneral {
  if (carreras.length > 0) return estadoPorCarreras(alcanceVigente, carreras)
  return calcularEstadoServicioGeneral(alcanceVigente, secciones)
}
