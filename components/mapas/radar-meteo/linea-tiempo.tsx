'use client'

import { Fragment } from 'react'
import type { CorridaRadarMeteo } from '@/lib/infraestructura/radar-meteo/use-corridas-radar-meteo'
import { fechaRadar } from './escalas'

export function LineaTiempoRadar({
  times,
  frame,
  playing,
  speed,
  paso,
  onFrameChange,
  onPlayingChange,
  onSpeedChange,
  onPasoChange,
  corridas = [],
  corridaSeleccionada = null,
  onCorridaChange,
}: {
  times: string[]
  frame: number
  playing: boolean
  speed: 1 | 2 | 4
  paso: 1 | 3
  onFrameChange: (frame: number | ((value: number) => number)) => void
  onPlayingChange: (playing: boolean | ((value: boolean) => boolean)) => void
  onSpeedChange: (speed: 1 | 2 | 4) => void
  onPasoChange: (paso: 1 | 3) => void
  corridas?: CorridaRadarMeteo[]
  corridaSeleccionada?: string | null
  onCorridaChange?: (fetchedAt: string | null) => void
}) {
  const current = times[frame]
  const label = current
    ? `${fechaRadar(current, { weekday: 'short', day: 'numeric', month: 'short' }).replaceAll(',', '')} · ${fechaRadar(current, { hour: '2-digit', minute: '2-digit', hour12: false })}`
    : ''

  return (
    <div className="radar-meteo-timeline" data-frame-index={frame} data-frame-time={current ?? ''}>
      <div className="radar-meteo-timeline-actions">
        <button type="button" aria-label="Retroceder un cuadro" onClick={() => onFrameChange((value) => Math.max(0, value - 1))}>‹</button>
        <button type="button" aria-label={playing ? 'Pausar' : 'Reproducir'} onClick={() => onPlayingChange((value) => !value)}>{playing ? 'Ⅱ' : '▶'}</button>
        <button type="button" aria-label="Avanzar un cuadro" onClick={() => onFrameChange((value) => Math.min(times.length - 1, value + 1))}>›</button>
        <strong>{label}</strong>
        <span className="radar-meteo-speeds">
          {([1, 2, 4] as const).map((value) => (
            <button key={value} type="button" aria-pressed={speed === value} onClick={() => onSpeedChange(value)}>{value}×</button>
          ))}
        </span>
        {corridas.length > 0 && onCorridaChange && (
          <select
            aria-label="Pronóstico publicado"
            value={corridaSeleccionada ?? ''}
            onChange={(event) => onCorridaChange(event.target.value || null)}
          >
            <option value="">Último pronóstico</option>
            {corridas.map((corrida) => (
              <option key={corrida.id} value={corrida.fetchedAt}>
                {fechaRadar(corrida.fetchedAt, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '')}
              </option>
            ))}
          </select>
        )}
        <label>
          Paso
          <select value={paso} onChange={(event) => onPasoChange(Number(event.target.value) as 1 | 3)}>
            <option value={3}>3 h</option>
            <option value={1}>1 h</option>
          </select>
        </label>
      </div>
      <input
        type="range"
        min={0}
        max={Math.max(0, times.length - 1)}
        value={Math.min(frame, Math.max(0, times.length - 1))}
        onChange={(event) => onFrameChange(Number(event.target.value))}
        aria-label="Cuadro del pronóstico"
        disabled={!times.length}
      />
      <div className="radar-meteo-days">
        {times.map((time, index) => {
          const date = fechaRadar(time, { day: 'numeric', month: 'short' })
          const previous = index ? fechaRadar(times[index - 1], { day: 'numeric', month: 'short' }) : null
          const left = `${times.length > 1 ? index * 100 / (times.length - 1) : 0}%`
          return (
            <Fragment key={time}>
              <i style={{ left }} />
              {date !== previous && (
                <span className="radar-meteo-day-tick" style={{ left }}>
                  {fechaRadar(time, { weekday: 'short', day: 'numeric' }).replaceAll(',', '')}
                </span>
              )}
              {index % 4 === 0 && (
                <small className="radar-meteo-hour-tick" style={{ left }}>
                  {fechaRadar(time, { hour: '2-digit', hour12: false })}
                </small>
              )}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
