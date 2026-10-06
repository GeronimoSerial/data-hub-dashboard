'use client'

export type VariableRadarUI = 'lluvia' | 'probabilidad' | 'viento' | 'granizo'

const etiquetas: Record<VariableRadarUI, string> = {
  lluvia: 'Lluvia (mm)',
  probabilidad: 'Probabilidad',
  viento: 'Viento',
  granizo: 'Granizo (estimado)',
}

export function SelectorRadar({
  value,
  onChange,
  children,
}: {
  value: VariableRadarUI
  onChange: (value: VariableRadarUI) => void
  children?: React.ReactNode
}) {
  const variables = Object.keys(etiquetas) as VariableRadarUI[]

  return (
    <div className="radar-meteo-controls" aria-label="Controles del radar de pronóstico">
      <div className="radar-meteo-segments" role="group" aria-label="Variable meteorológica">
        {variables.map((variable) => (
          <button
            key={variable}
            type="button"
            aria-pressed={value === variable}
            onClick={() => onChange(variable)}
          >
            {etiquetas[variable]}
          </button>
        ))}
      </div>
      <select
        className="radar-meteo-mobile-variable"
        aria-label="Variable meteorológica"
        value={value}
        onChange={(event) => onChange(event.target.value as VariableRadarUI)}
      >
        {variables.map((variable) => (
          <option key={variable} value={variable}>{etiquetas[variable]}</option>
        ))}
      </select>
      {children}
    </div>
  )
}
