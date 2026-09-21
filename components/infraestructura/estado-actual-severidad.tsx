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
}

export function EstadoActualSeveridad({
  severidad,
  prefijo = true,
}: EstadoActualSeveridadProps): JSX.Element {
  const forma = FORMA_POR_SEVERIDAD[severidad] ?? 'circulo'
  return (
    <span className="estado-actual-severidad">
      <span
        className={`estado-actual-severidad__marca estado-actual-severidad__marca--${forma}`}
        style={{ backgroundColor: colorSeveridad(severidad) }}
        aria-hidden
      />
      <span className="estado-actual-severidad__texto">
        {prefijo ? `Severidad ${severidad}` : severidad}
      </span>
    </span>
  )
}
