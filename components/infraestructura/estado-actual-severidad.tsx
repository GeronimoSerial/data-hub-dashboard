import type { JSX } from 'react'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import type { Severidad } from '@/lib/infraestructura/trayectoria-tipos'

// Indicador de severidad de una afectación: el nombre escrito sobre una
// pastilla con el tono de la paleta oficial. El texto es la señal que no
// depende del color; el tono permite escanear la gravedad de reojo.
export const TINTA_POR_SEVERIDAD: Record<Severidad, string> = {
  Baja: '#7f1d1d',
  Media: '#450a0a',
  Alta: '#ffffff',
  Crítica: '#ffffff',
}

export interface EstadoActualSeveridadProps {
  severidad: Severidad
  /**
   * Antepone la palabra "Gravedad". Va en false cuando el contexto ya la
   * dice — por ejemplo dentro del grupo "¿Qué tan grave es?", donde
   * "Severidad Alta" repite la pregunta y alarga el nombre accesible de la
   * opción sin agregar nada.
   */
  prefijo?: boolean
  /**
   * Muestra el nombre sobre la pastilla de tono. Va en false en el selector de "¿Qué tan
   * grave es?" (afectacion-campos.tsx): ahí cada opción ya lleva al lado su
   * criterio en texto (SEVERIDAD_CRITERIOS), así que la marca es redundante
   * con la etiqueta. Sigue en true en el resto de las pantallas, donde es la
   * única señal no-basada-en-color de qué severidad se está mostrando.
   */
  marca?: boolean
  sugerida?: boolean
  actual?: boolean
}

export function EstadoActualSeveridad({
  severidad,
  prefijo = true,
  marca = true,
  sugerida = false,
  actual = false,
}: EstadoActualSeveridadProps): JSX.Element {
  const texto = prefijo ? `Gravedad ${severidad}` : severidad
  return (
    <span className="estado-actual-severidad">
      {marca ? (
        <span
          className="estado-actual-severidad__texto estado-actual-severidad__texto--tono"
          style={{ backgroundColor: colorSeveridad(severidad), color: TINTA_POR_SEVERIDAD[severidad] ?? 'inherit' }}
        >
          {texto}
        </span>
      ) : (
        <span className="estado-actual-severidad__texto">{texto}</span>
      )}
      {sugerida ? <span className="badge badge--neutral badge-sugerido" aria-hidden="true">Sugerido</span> : actual ? <span className="badge badge--neutral badge-sugerido" aria-hidden="true">Actual</span> : null}
    </span>
  )
}
