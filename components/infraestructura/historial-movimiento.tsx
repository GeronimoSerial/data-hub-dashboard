import type { JSX } from 'react'
import { useIdioma, useTextos } from '@/lib/i18n/idioma-provider'
import type { RolMovimiento, TipoMovimiento } from '@/lib/infraestructura/trayectoria-tipos'
import type { Severidad } from '@/lib/infraestructura/validacion'
import {
  debeMostrarRigeDesde,
  formatearMomentoHistorial,
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
  titulo: string
  cambios: string[]
  severidad?: Severidad | null
}

/**
 * Un movimiento del historial (spec §15): cuándo se cargó, quién lo cargó,
 * desde cuándo rige si no coincide con la carga, y qué cambió.
 *
 * Presentacional puro: no pide datos ni tiene estado. El componente
 * contenedor (historial-parte.tsx) resuelve la carga y el orden.
 */
export function HistorialMovimiento({ movimiento }: { movimiento: MovimientoHistorial }): JSX.Element {
  const idioma = useIdioma()
  const t = useTextos().fichaHistorial
  // "Supervisor" se escribe igual en portugués: no va al diccionario (ver fichaHistorial).
  const rolTexto: Record<RolMovimiento, string> = { director: t.rol.director, supervisor: 'Supervisor' }
  const carga = formatearMomentoHistorial(movimiento.creadaEn, undefined, idioma)
  const rol = rolTexto[movimiento.rol] ?? movimiento.rol
  const mostrarVigencia = debeMostrarRigeDesde(movimiento.creadaEn, movimiento.rigeDesde)
  const cambios = movimiento.cambios.filter((cambio) => cambio !== movimiento.titulo)

  return (
    <li className="historial-movimiento">
      {/* La carga y el rol son el encabezado del movimiento, no un dato
          decorativo: identifican de un vistazo cuándo y quién. */}
      <p className="historial-movimiento__encabezado">
        {carga ? <span className="historial-movimiento__carga">{carga}</span> : null}
        <span className="historial-movimiento__rol">{rol}</span>
      </p>

      {mostrarVigencia ? (
        <p className="historial-movimiento__vigencia">{formatearRigeDesde(movimiento.rigeDesde, idioma)}</p>
      ) : null}

      <p className="historial-movimiento__titulo">{movimiento.titulo}</p>

      {cambios.length > 0 ? (
        <ul className="historial-movimiento__cambios">
          {cambios.map((cambio, indice) => (
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
