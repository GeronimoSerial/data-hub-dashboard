'use client'

import { useState } from 'react'

export type AlertaRadar = {
  id: string
  nivelSat: string | null
  severidad: string
  evento: string
  headline: string | null
  description: string | null
  instruction: string | null
  onset: string
  expires: string
  departamentos: Array<string | { id: string; nombre: string }>
}

export function departamentosAlertaLabel(departamentos: AlertaRadar['departamentos']) {
  return departamentos.map((depto) => typeof depto === 'string' ? depto : depto.nombre).join(', ')
}

function claseNivel(nivel: string | null) {
  if (!nivel) return ''
  const normalizado = nivel.toLocaleLowerCase('es')
  if (['yellow', 'amarillo', 'amarilla'].includes(normalizado)) return ' nivel-yellow'
  if (['orange', 'naranja'].includes(normalizado)) return ' nivel-orange'
  if (['red', 'rojo', 'roja'].includes(normalizado)) return ' nivel-red'
  return ''
}

function horaArgentina(value: string) {
  return new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

export function AlertasStrip({ alertas, actualizado, onSelect }: {
  alertas: AlertaRadar[]
  actualizado: string | null
  onSelect?: (alerta: AlertaRadar | null) => void
}) {
  const [abierta, setAbierta] = useState<string | null>(null)
  if (!alertas.length) {
    return (
      <div className="radar-alertas radar-alertas-empty">
        Sin alertas oficiales vigentes para Corrientes · SMN
        <small>Actualizado {actualizado ? horaArgentina(actualizado) : '—'}</small>
      </div>
    )
  }
  return <section className="radar-alertas" aria-label="Alertas oficiales del SMN">
    {alertas.map((alerta) => <article key={alerta.id} className="radar-alerta-item">
      <button type="button" className={`radar-alerta-chip${claseNivel(alerta.nivelSat)}`} aria-expanded={abierta === alerta.id} onClick={() => {
        const next = abierta === alerta.id ? null : alerta.id
        setAbierta(next)
        onSelect?.(next ? alerta : null)
      }}>
        <span className="radar-alerta-icon" aria-hidden="true">!</span>
        <span>
          <strong>{alerta.evento}</strong> · {alerta.severidad}
          <small>
            {departamentosAlertaLabel(alerta.departamentos) || 'Corrientes'} ·
            {' '}{horaArgentina(alerta.onset)}–{horaArgentina(alerta.expires)}
          </small>
        </span>
      </button>
      {abierta === alerta.id && (
        <div className="radar-alerta-detail" role="region" aria-label={`Detalle: ${alerta.evento}`}>
          <button
            type="button"
            className="radar-alerta-close"
            aria-label="Cerrar detalle de alerta"
            onClick={() => { setAbierta(null); onSelect?.(null) }}
          >×</button>
          <strong>{alerta.headline ?? alerta.evento}</strong>
          {alerta.description && <p>{alerta.description}</p>}
          {alerta.instruction && <p><b>Recomendación oficial:</b> {alerta.instruction}</p>}
        </div>
      )}
    </article>)}
  </section>
}
