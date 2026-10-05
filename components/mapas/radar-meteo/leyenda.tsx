'use client'

import { useState } from 'react'
import { formatearAntiguedad } from './escalas'
import type { VariableRadarUI } from './selector'

const titulos: Record<VariableRadarUI, string> = {
  lluvia: 'Lluvia (mm)',
  probabilidad: 'Probabilidad',
  viento: 'Viento',
  granizo: 'Granizo',
}

const unidades: Record<VariableRadarUI, string> = {
  lluvia: 'mm/h',
  probabilidad: '%',
  viento: 'km/h',
  granizo: 'categoría',
}

export function etiquetaUnidadLluvia(paso: 1 | 3) {
  return paso === 3 ? 'mm en 3 h' : 'mm/h'
}

const etiquetas: Record<VariableRadarUI, string[]> = {
  lluvia: ['0.1', '0.5', '1', '2', '5', '10', '20', '40', '80+'],
  probabilidad: ['10%', '30%', '55%', '80%', '100%'],
  viento: ['0', '20', '40', '80+'],
  granizo: ['1', '2', '3'],
}

export function LeyendaRadar({
  variable,
  minutos,
  desactualizado,
  paso,
}: {
  variable: VariableRadarUI
  minutos?: number | null
  desactualizado?: boolean
  paso: 1 | 3
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`radar-meteo-legend${expanded ? ' is-expanded' : ''}`}>
      <button
        type="button"
        className="radar-meteo-legend-toggle"
        aria-expanded={expanded}
        aria-label={`${expanded ? 'Contraer' : 'Expandir'} leyenda: ${titulos[variable]}`}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="radar-meteo-legend-title">
          <b>{titulos[variable]}</b>
          <small>{variable === 'lluvia' ? etiquetaUnidadLluvia(paso) : unidades[variable]}</small>
        </span>
        <span className={`radar-meteo-gradient radar-meteo-gradient--${variable}`} />
      </button>
      <div className="radar-meteo-legend-details">
        <div className="radar-meteo-legend-labels">
          {etiquetas[variable].map((label) => <span key={label}>{label}</span>)}
        </div>
        <span className={desactualizado ? 'is-stale' : undefined}>
          Actualizado {formatearAntiguedad(minutos)}
        </span>
      </div>
    </div>
  )
}
