import type { JSX } from 'react'
import type { RolMovimiento, TipoMovimiento } from '@/lib/infraestructura/trayectoria-tipos'
import {
  debeMostrarRigeDesde,
  formatearCargaCorta,
  formatearRigeDesde,
} from './historial-formato'

/**
 * Un movimiento tal como lo devuelve GET /api/problematicas/parte/historial.
 * `cambios` ya viene redactado en español por el dominio (describirMovimiento,
 * lib/infraestructura/movimiento-descripcion.ts): esta capa lo muestra tal
 * cual y no lo reescribe.
 */
export interface MovimientoHistorial {
  id: string
  tipo: TipoMovimiento
  rol: RolMovimiento
  creadaEn: string
  rigeDesde: string
  cambios: string[]
}

const ROL_TEXTO: Record<RolMovimiento, string> = {
  director: 'Director',
  supervisor: 'Supervisor',
}

/**
 * Un movimiento del historial (spec §15): cuándo se cargó, quién lo cargó,
 * desde cuándo rige si no coincide con la carga, y qué cambió.
 *
 * Presentacional puro: no pide datos ni tiene estado. El componente
 * contenedor (historial-parte.tsx) resuelve la carga y el orden.
 */
export function HistorialMovimiento({ movimiento }: { movimiento: MovimientoHistorial }): JSX.Element {
  const carga = formatearCargaCorta(movimiento.creadaEn)
  const rol = ROL_TEXTO[movimiento.rol] ?? movimiento.rol
  const mostrarVigencia = debeMostrarRigeDesde(movimiento.creadaEn, movimiento.rigeDesde)

  return (
    <li className="historial-movimiento">
      {/* La carga y el rol son el encabezado del movimiento, no un dato
          decorativo: identifican de un vistazo cuándo y quién. */}
      <p className="historial-movimiento__encabezado">
        {carga ? <span className="historial-movimiento__carga">{carga}</span> : null}
        <span className="historial-movimiento__rol">{rol}</span>
      </p>

      {mostrarVigencia ? (
        <p className="historial-movimiento__vigencia">{formatearRigeDesde(movimiento.rigeDesde)}</p>
      ) : null}

      {movimiento.cambios.length > 0 ? (
        <ul className="historial-movimiento__cambios">
          {movimiento.cambios.map((cambio, indice) => (
            // Las líneas son texto ya redactado y pueden repetirse entre sí
            // dentro de un mismo movimiento (por ejemplo dos secciones con
            // el mismo cambio de servicio), así que la posición es la única
            // clave estable disponible; la lista nunca se reordena.
            <li key={`${movimiento.id}-${indice}`} className="historial-movimiento__cambio">
              {cambio}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  )
}
