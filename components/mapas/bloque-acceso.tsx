'use client'

import { Check, Route, ShieldAlert, TriangleAlert } from 'lucide-react'
import { lineasAcceso } from '@/lib/infraestructura/mapa/acceso'
import type { ExposicionRutaRespuesta } from '@/lib/infraestructura/exposicion-ruta'
import type { GeometriaAccesoRespuesta } from '@/lib/infraestructura/territorio-mapa'

interface BloqueAccesoProps {
  geometria: GeometriaAccesoRespuesta | null
  exposicion: ExposicionRutaRespuesta | null
  cargando?: boolean
  error?: boolean
}

export function BloqueAcceso({ geometria, exposicion, cargando = false, error = false }: BloqueAccesoProps) {
  if (cargando) return <p className="map-bloque-acceso__estado">Calculando el acceso…</p>
  if (error) return <p className="map-bloque-acceso__estado">No se pudo calcular el acceso.</p>

  const lineas = lineasAcceso(geometria, exposicion)
  if (lineas === null) return <p className="map-bloque-acceso__estado">Sin acceso calculado</p>

  return (
    <div className="map-bloque-acceso" aria-label="Acceso">
      {lineas.via && (
        <div className="map-bloque-acceso__fila" data-testid="bloque-acceso-via">
          <Route aria-hidden="true" />
          <span>{lineas.via}</span>
        </div>
      )}
      <div className="map-bloque-acceso__fila" data-testid="bloque-acceso-cruces">
        {lineas.crucesConRiesgo
          ? <TriangleAlert aria-hidden="true" data-testid="bloque-acceso-cruces-icono" data-icono="alerta" />
          : <Check aria-hidden="true" data-testid="bloque-acceso-cruces-icono" data-icono="ok" />}
        <span>
          {lineas.cruces}
          {lineas.crucesDetalle && <span className="map-bloque-acceso__detalle">{lineas.crucesDetalle}</span>}
        </span>
      </div>
      {lineas.riesgo && (
        <div className={`map-bloque-acceso__fila map-bloque-acceso__riesgo--${lineas.riesgo.toLowerCase()}`} data-testid="bloque-acceso-riesgo">
          <ShieldAlert aria-hidden="true" />
          <span>Riesgo de corte por inundación: {lineas.riesgo}</span>
        </div>
      )}
    </div>
  )
}
