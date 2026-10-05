import type { JSX } from 'react'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import type { Severidad } from '@/lib/infraestructura/trayectoria-tipos'

// Indicador de severidad de una afectación. El contrato de UX es explícito:
// la severidad NO puede depender sólo del color. Acá van las tres cosas a la
// vez — el nombre escrito, una forma distinta por nivel y recién después el
// color de la paleta oficial. Quien no distinga los colores lee el texto;
// quien escanea la lista de reojo reconoce la forma.
const FORMA_POR_SEVERIDAD: Record<Severidad, string> = {
  Baja: 'circulo',
  Media: 'cuadrado',
  Alta: 'triangulo',
  Crítica: 'rombo',
}

export interface EstadoActualSeveridadProps {
  severidad: Severidad
  /**
   * Antepone la palabra "Severidad". Va en false cuando el contexto ya la
   * dice — por ejemplo dentro del grupo "¿Qué tan grave es?", donde
   * "Severidad Alta" repite la pregunta y alarga el nombre accesible de la
   * opción sin agregar nada.
   */
  prefijo?: boolean
  /**
   * Muestra la marca de forma+color. Va en false en el selector de "¿Qué tan
   * grave es?" (afectacion-campos.tsx): ahí cada opción ya lleva al lado su
   * criterio en texto (SEVERIDAD_CRITERIOS), así que la marca es redundante
   * con la etiqueta. Sigue en true en el resto de las pantallas, donde es la
   * única señal no-basada-en-color de qué severidad se está mostrando.
   */
  marca?: boolean
  sugerida?: boolean
}

export function EstadoActualSeveridad({
  severidad,
  prefijo = true,
  marca = true,
  sugerida = false,
}: EstadoActualSeveridadProps): JSX.Element {
  const forma = FORMA_POR_SEVERIDAD[severidad] ?? 'circulo'
  return (
    <span className="estado-actual-severidad">
      {marca && (
        <span
          className={`estado-actual-severidad__marca estado-actual-severidad__marca--${forma}`}
          style={{ backgroundColor: colorSeveridad(severidad) }}
          aria-hidden
        />
      )}
      <span className="estado-actual-severidad__texto">
        {prefijo ? `Severidad ${severidad}` : severidad}
      </span>
      {sugerida ? <span className="badge-sugerido" aria-hidden="true">Sugerido</span> : null}
    </span>
  )
}
