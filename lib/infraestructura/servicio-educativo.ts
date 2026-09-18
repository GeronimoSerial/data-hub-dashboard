// Estado general del servicio educativo (spec §3.4, §10). Derivado, nunca
// persistido — ver EstadoServicioGeneral en trayectoria-tipos.ts y el
// CONTRACT.md ("Derived, never stored").
//
// Precedencia de alcance: una fila 'seccion' decide para esa sección puntual;
// si no hay una, decide la fila 'turno' del turno de esa sección; si tampoco
// hay, decide la fila 'establecimiento'; si no hay ninguna, la sección se
// asume con clases normales. Esto es lo que garantiza spec §10: "La
// suspensión de una sola sección no debe modificar como suspendidas a las
// demás" — cada sección se resuelve de forma independiente, y una fila más
// específica nunca contamina secciones fuera de su alcance.
import type {
  EstadoServicioGeneral,
  SeccionEstablecimiento,
  ServicioAlcance,
} from './trayectoria-tipos'

export function calcularEstadoServicioGeneral(
  alcanceVigente: ServicioAlcance[],
  secciones: SeccionEstablecimiento[],
): EstadoServicioGeneral {
  // Parte vacío (sin secciones en el corte vigente): no hay nada que
  // suspender, se informa como normal.
  if (secciones.length === 0) return 'normal'

  const porSeccion = new Map<number, ServicioAlcance>()
  const porTurno = new Map<string, ServicioAlcance>()
  let establecimiento: ServicioAlcance | undefined

  for (const fila of alcanceVigente) {
    if (fila.tipo === 'seccion' && fila.referenciaId !== null) {
      porSeccion.set(Number(fila.referenciaId), fila)
    } else if (fila.tipo === 'turno' && fila.referenciaId !== null) {
      porTurno.set(fila.referenciaId, fila)
    } else if (fila.tipo === 'establecimiento') {
      establecimiento = fila
    }
  }

  let normales = 0
  let suspendidas = 0

  for (const seccion of secciones) {
    const efectivo =
      porSeccion.get(seccion.geSectionId)?.estado ??
      porTurno.get(seccion.turno)?.estado ??
      establecimiento?.estado ??
      'normal'

    if (efectivo === 'suspendido') suspendidas++
    else normales++
  }

  if (suspendidas === 0) return 'normal'
  if (normales === 0) return 'suspendido'
  return 'parcial'
}
