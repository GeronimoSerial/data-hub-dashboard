'use client'

import { useState } from 'react'
import { formatearAntiguedad } from './escalas'
import type { VariableRadarUI } from './selector'
import { useIdioma, useTextos } from '@/lib/i18n/idioma-provider'

const unidades: Record<Exclude<VariableRadarUI, 'granizo'>, string> = {
  lluvia: 'mm/h',
  probabilidad: '%',
  viento: 'km/h',
}

export function etiquetaUnidadLluvia(paso: 1 | 3, mm3h = 'mm en 3 h') {
  return paso === 3 ? mm3h : 'mm/h'
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
  const t = useTextos()
  const idioma = useIdioma()
  const l = t.radar.leyenda
  const titulo = l.titulos[variable]
  const unidad = variable === 'granizo' ? l.unidadGranizo : unidades[variable]


  return (
    <div className={`radar-meteo-legend${expanded ? ' is-expanded' : ''}`}>
      <button
        type="button"
        className="radar-meteo-legend-toggle"
        aria-expanded={expanded}
        aria-label={l.leyendaAria(expanded ? l.contraer : l.expandir, titulo)}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="radar-meteo-legend-title">
          {/* Frescura en el tooltip; un pronóstico vencido se ve atenuado, sin texto de aviso. */}
          <b
            className={desactualizado ? 'is-stale' : undefined}
            title={minutos != null ? t.radarResto.pronostico.actualizado(formatearAntiguedad(minutos, idioma)) : undefined}
          >
            {titulo}
          </b>
          <small>{variable === 'lluvia' ? etiquetaUnidadLluvia(paso, l.mm3h) : unidad}</small>
        </span>
        <span className={`radar-meteo-gradient radar-meteo-gradient--${variable}`} />
      </button>
      <div className="radar-meteo-legend-details">
        <div className="radar-meteo-legend-labels">
          {etiquetas[variable].map((label) => <span key={label}>{label}</span>)}
        </div>
      </div>
    </div>
  )
}
