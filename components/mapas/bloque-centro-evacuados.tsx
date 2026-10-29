'use client'

import { Route } from 'lucide-react'
import { etiquetaDistanciaCentro } from '@/lib/infraestructura/evacuacion/mapa'
import type { CentroEvacuadosRespuesta } from '@/lib/infraestructura/evacuacion/respuesta'

interface BloqueCentroEvacuadosProps {
  visible: boolean
  onAlternar: () => void
  respuesta: CentroEvacuadosRespuesta | null
  cargando?: boolean
  error?: boolean
}

const MOTIVO_SIN_DESTINO = {
  sin_calculo: 'Todavía no se calculó el centro de evacuados más cercano.',
  sin_destino_apto: 'No hay otro posible centro de evacuados para esta escuela.',
} as const

export function BloqueCentroEvacuados({ visible, onAlternar, respuesta, cargando = false, error = false }: BloqueCentroEvacuadosProps) {
  const distancia = respuesta?.disponible ? etiquetaDistanciaCentro(respuesta) : null
  return (
    <div className="map-bloque-acceso map-bloque-centro" aria-label="Centro de evacuados más cercano">
      <button type="button" className="map-bloque-centro__boton" aria-pressed={visible} onClick={onAlternar}>
        <Route aria-hidden="true" />
        {visible ? 'Ocultar camino al centro de evacuados' : 'Mostrar camino al centro de evacuados más cercano'}
      </button>
      {visible && cargando && <p className="map-bloque-acceso__estado">Buscando el centro de evacuados más cercano…</p>}
      {visible && !cargando && error && <p className="map-bloque-acceso__estado">No se pudo cargar el centro de evacuados más cercano.</p>}
      {visible && !cargando && !error && respuesta && !respuesta.disponible && (
        <p className="map-bloque-acceso__estado">{MOTIVO_SIN_DESTINO[respuesta.motivoSinDestino ?? 'sin_calculo']}</p>
      )}
      {visible && !cargando && !error && respuesta?.disponible && respuesta.destino && (
        <div className="map-bloque-acceso__fila">
          <span>{respuesta.destino.nombre}</span>
          {distancia && <span className="map-bloque-acceso__detalle">{distancia}</span>}
        </div>
      )}
    </div>
  )
}
