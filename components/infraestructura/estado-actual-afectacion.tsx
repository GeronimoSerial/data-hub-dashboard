import type { JSX } from 'react'
import { EstadoActualSeveridad } from './estado-actual-severidad'
import { resumirAlcance, type AfectacionVigente } from './estado-actual-textos'

// Nombres de los alumnos alcanzados, ya descifrados por la ruta. Cuando la
// ruta no pudo resolver una identidad devuelve el id como nombre y el
// apellido vacío; en ese caso se muestra lo único que hay en vez de fabricar
// un "Apellido, ".
function nombreVisible(alumno: { nombre: string; apellido: string }): string {
  return alumno.apellido ? `${alumno.apellido}, ${alumno.nombre}` : alumno.nombre
}

/**
 * Una afectación vigente dentro de la situación en seguimiento (spec §6.5):
 * motivo, severidad propia y alcance resumido. Los nombres de los alumnos
 * quedan detrás de una divulgación progresiva — el director los puede
 * consultar (spec §18.12) sin que la lista tape el resto de la pantalla.
 */
export function EstadoActualAfectacion({ afectacion }: { afectacion: AfectacionVigente }): JSX.Element {
  const alumnos = afectacion.secciones.flatMap((seccion) => seccion.alumnos)

  return (
    <li className="estado-actual-afectacion">
      <div className="estado-actual-afectacion__encabezado">
        <span className="estado-actual-afectacion__motivo">{afectacion.motivo}</span>
        <EstadoActualSeveridad severidad={afectacion.severidad} />
      </div>

      <p className="estado-actual-afectacion__alcance">{resumirAlcance(afectacion.totales)}</p>

      {afectacion.descripcion && (
        <p className="estado-actual-afectacion__descripcion">{afectacion.descripcion}</p>
      )}

      {alumnos.length > 0 && (
        <details className="estado-actual-afectacion__alumnos">
          <summary className="estado-actual-afectacion__alumnos-resumen">
            Ver alumnos alcanzados
          </summary>
          <ul className="estado-actual-afectacion__alumnos-lista">
            {alumnos.map((alumno) => (
              <li key={alumno.gePersonId}>{nombreVisible(alumno)}</li>
            ))}
          </ul>
        </details>
      )}
    </li>
  )
}
