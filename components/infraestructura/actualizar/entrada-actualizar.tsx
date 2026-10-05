'use client'

import { useState, type JSX } from 'react'
import { Button } from '@/components/ui/button'
import { EstadoActualSeveridad } from '@/components/infraestructura/estado-actual-severidad'
import { formatearMomentoHistorial } from '@/components/infraestructura/historial-formato'
import { ETIQUETA_ESTABLECIMIENTO, ETIQUETA_SERVICIO } from '@/components/infraestructura/estado-actual-textos'
import { LineaDeTiempo } from '@/components/infraestructura/linea-de-tiempo'
import type { MovimientoHistorial } from '@/components/infraestructura/historial-movimiento'
import { ordenarSituaciones, type SituacionRecorrido } from '@/lib/infraestructura/parte/recorrido-actualizacion'
import type { EstadoEstablecimiento, EstadoServicioGeneral } from '@/lib/infraestructura/trayectoria-tipos'

export interface EntradaActualizarProps {
  situaciones: SituacionRecorrido[]
  estadoEstablecimiento: EstadoEstablecimiento
  estadoServicio: EstadoServicioGeneral
  ultimaCarga: { creadaEn: string; titulo: string; cambios: string[] } | null
  historial: MovimientoHistorial[]
  onActualizar: () => void
}

// Layout A del spec rediseño §6.1: prioriza el estado activo y su acción.
export function EntradaActualizar({ situaciones, estadoEstablecimiento, estadoServicio, historial, onActualizar }: EntradaActualizarProps): JSX.Element {
  const [historialAbierto, setHistorialAbierto] = useState(false)
  const [principal, ...otras] = ordenarSituaciones(situaciones, estadoEstablecimiento)

  return (
    <div className="entrada-actualizar">
      {principal ? (
        <section aria-label="Situación principal" className="entrada-actualizar__principal">
          <p className="entrada-actualizar__etiqueta">Situación principal</p>
          <p className="entrada-actualizar__motivo">
            <strong>{principal.motivo}</strong> <EstadoActualSeveridad severidad={principal.severidad} prefijo={false} />
          </p>
          <p className="entrada-actualizar__detalle">
            {`${ETIQUETA_ESTABLECIMIENTO[estadoEstablecimiento]} · ${ETIQUETA_SERVICIO[estadoServicio]} · desde ${formatearMomentoHistorial(principal.rigeDesde)}`}
          </p>
        </section>
      ) : null}

      <div className="asistente__acciones">
        <Button type="button" onClick={onActualizar}>Actualizar el parte</Button>
      </div>

      <section aria-label="Historial" className="entrada-actualizar__historial">
        <button
          type="button"
          className="entrada-actualizar__historial-control"
          aria-expanded={historialAbierto}
          onClick={() => setHistorialAbierto((abierto) => !abierto)}
        >
          {historialAbierto ? 'Ocultar historial' : 'Ver historial'}
        </button>
        {historialAbierto ? <LineaDeTiempo movimientos={historial} limite={2} /> : null}
      </section>

      {otras.length > 0 ? (
        <section aria-label="También activas" className="entrada-actualizar__otras">
          <p className="entrada-actualizar__etiqueta">También activas</p>
          <ul>
            {otras.map((situacion) => (
              <li key={situacion.id}>
                <span>{situacion.motivo}</span> <EstadoActualSeveridad severidad={situacion.severidad} prefijo={false} />
                <span className="entrada-actualizar__detalle">{` · desde ${formatearMomentoHistorial(situacion.rigeDesde)}`}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
