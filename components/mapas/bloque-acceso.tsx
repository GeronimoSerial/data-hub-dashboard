'use client'

import { Check, Route, School, TriangleAlert } from 'lucide-react'
import { lineasAcceso, type EtiquetaRiesgoAcceso } from '@/lib/infraestructura/mapa/acceso'
import type { ExposicionRutaRespuesta } from '@/lib/infraestructura/exposicion-ruta'
import type { GeometriaAccesoRespuesta } from '@/lib/infraestructura/territorio-mapa'
import { ETIQUETAS_INUNDACION, type ClaseInundacion } from '@/lib/mapas/accesos-capas'

interface BloqueAccesoProps {
  geometria: GeometriaAccesoRespuesta | null
  exposicion: ExposicionRutaRespuesta | null
  /** Clase de río de la escuela: el mismo dato que pinta el punto en Planificación. */
  claseEscuela?: ClaseInundacion
  juntoLaguna?: boolean
  cargando?: boolean
  error?: boolean
}

function claseCss(etiqueta: string): string {
  return ['Alto', 'Medio', 'Bajo'].includes(etiqueta)
    ? `map-bloque-acceso__riesgo--${etiqueta.toLowerCase()}`
    : ''
}

export function BloqueAcceso({
  geometria,
  exposicion,
  claseEscuela = 'sin_dato',
  juntoLaguna = false,
  cargando = false,
  error = false,
}: BloqueAccesoProps) {
  if (cargando) return <p className="map-bloque-acceso__estado">Calculando el acceso…</p>
  if (error) return <p className="map-bloque-acceso__estado">No se pudo calcular el acceso.</p>

  const lineas = lineasAcceso(geometria, exposicion)
  const etiquetaEscuela = ETIQUETAS_INUNDACION[claseEscuela]
  const etiquetaCamino: EtiquetaRiesgoAcceso = lineas === null ? 'Sin ruta' : (lineas.riesgo ?? 'Sin dato')

  return (
    <div className="map-bloque-acceso" aria-label="Acceso">
      {lineas === null ? (
        <p className="map-bloque-acceso__estado">Sin acceso calculado</p>
      ) : (
        <>
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
        </>
      )}
      <div className="map-bloque-acceso__inundacion" data-testid="bloque-acceso-inundacion">
        <div className="map-bloque-acceso__fila" data-testid="bloque-acceso-escuela">
          <School aria-hidden="true" />
          <span className={claseCss(etiquetaEscuela)}>Escuela: {etiquetaEscuela}</span>
          {juntoLaguna && <span className="badge badge--neutral" data-testid="bloque-acceso-laguna">Junto a laguna</span>}
        </div>
        <div className="map-bloque-acceso__fila" data-testid="bloque-acceso-riesgo">
          <Route aria-hidden="true" />
          <span className={claseCss(etiquetaCamino)}>Camino: {etiquetaCamino}</span>
        </div>
      </div>
    </div>
  )
}
