'use client'

import type { JSX } from 'react'
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
  ultimaCarga: { creadaEn: string; cambios: string[] } | null
  historial: MovimientoHistorial[]
  onActualizar: () => void
}

// Layout A del spec rediseño §6.1: resume la carga anterior y el estado activo.
export function EntradaActualizar({ situaciones, estadoEstablecimiento, estadoServicio, ultimaCarga, historial, onActualizar }: EntradaActualizarProps): JSX.Element {
  const [principal, ...otras] = ordenarSituaciones(situaciones, estadoEstablecimiento)

  return (
    <div className="entrada-actualizar">
      {ultimaCarga ? (
        <p className="entrada-actualizar__ultima">
          Su última carga: <strong>{formatearMomentoHistorial(ultimaCarga.creadaEn)}</strong>
          {ultimaCarga.cambios[0] ? ` · ${ultimaCarga.cambios[0]}` : null}
        </p>
      ) : null}

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

      <section aria-label="Historial">
        <p className="entrada-actualizar__etiqueta">Historial</p>
        <LineaDeTiempo movimientos={historial} limite={2} />
      </section>

      <div className="asistente__acciones">
        <Button type="button" onClick={onActualizar}>Actualizar el parte</Button>
      </div>
    </div>
  )
}
