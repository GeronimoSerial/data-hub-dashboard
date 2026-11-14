'use client'

import { Route } from 'lucide-react'
import { etiquetaDistanciaCentro } from '@/lib/infraestructura/evacuacion/mapa'
import type { CentroEvacuadosRespuesta } from '@/lib/infraestructura/evacuacion/respuesta'
import { useTextos } from '@/lib/i18n/idioma-provider'

interface BloqueCentroEvacuadosProps {
  visible: boolean
  onAlternar: () => void
  respuesta: CentroEvacuadosRespuesta | null
  cargando?: boolean
  error?: boolean
}

export function BloqueCentroEvacuados({ visible, onAlternar, respuesta, cargando = false, error = false }: BloqueCentroEvacuadosProps) {
  const dic = useTextos()
  const t = dic.fichaCuerpo.centroEvacuados
  const distancia = respuesta?.disponible ? etiquetaDistanciaCentro(respuesta, dic) : null
  return (
    <div className="map-bloque-acceso map-bloque-centro" aria-label={t.etiqueta}>
      <button type="button" className="map-bloque-centro__boton" aria-pressed={visible} onClick={onAlternar}>
        <Route aria-hidden="true" />
        {visible ? t.ocultar : t.ver}
      </button>
      {visible && cargando && <p className="map-bloque-acceso__estado">{t.buscando}</p>}
      {visible && !cargando && error && <p className="map-bloque-acceso__estado">{t.error}</p>}
      {visible && !cargando && !error && respuesta && !respuesta.disponible && (
        <p className="map-bloque-acceso__estado">{t.motivo[respuesta.motivoSinDestino ?? 'sin_calculo']}</p>
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
