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

  // Desempate DETERMINISTA cuando dos filas vigentes compiten por el mismo
  // alcance (misma sección, mismo turno o el establecimiento entero): sin
  // este criterio, "última fila del array gana" dependía del orden en que
  // volvía la query, y la misma base de datos podía mostrarle al director
  // "normal" o "suspendido" para el mismo parte según el orden de retorno.
  // Gana la fila con creadaEn más reciente; si también empata, gana el id
  // mayor en orden lexicográfico. Es arbitrario pero estable — no lo
  // "simplifiques" quitando el desempate, eso reintroduce el no-determinismo.
  function ganaLaNueva(actual: ServicioAlcance, nueva: ServicioAlcance): boolean {
    if (nueva.creadaEn !== actual.creadaEn) return nueva.creadaEn > actual.creadaEn
    return nueva.id > actual.id
  }

  const porSeccion = new Map<number, ServicioAlcance>()
  const porTurno = new Map<string, ServicioAlcance>()
  let establecimiento: ServicioAlcance | undefined

  for (const fila of alcanceVigente) {
    if (fila.tipo === 'seccion' && fila.referenciaId !== null) {
      const clave = Number(fila.referenciaId)
      const actual = porSeccion.get(clave)
      if (!actual || ganaLaNueva(actual, fila)) porSeccion.set(clave, fila)
    } else if (fila.tipo === 'turno' && fila.referenciaId !== null) {
      const actual = porTurno.get(fila.referenciaId)
      if (!actual || ganaLaNueva(actual, fila)) porTurno.set(fila.referenciaId, fila)
    } else if (fila.tipo === 'establecimiento') {
      if (!establecimiento || ganaLaNueva(establecimiento, fila)) establecimiento = fila
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
