'use client'

import { regionPublicaActual } from '@/lib/infraestructura/region/publica'
import { calcularMarcasEje } from './ejes-tiempo'
import { fechaRadar } from './escalas'
import { useTextos } from '@/lib/i18n/idioma-provider'

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
}) {
  const t = useTextos()
  const l = t.radarResto.linea
  const current = times[frame]
  const marcas = calcularMarcasEje(times, regionPublicaActual().zonaHoraria)
  const label = current
    ? `${fechaRadar(current, { weekday: 'short', day: 'numeric', month: 'short' }).replaceAll(',', '')} · ${fechaRadar(current, { hour: '2-digit', minute: '2-digit', hour12: false })}`
    : ''

  return (
    <div className="radar-meteo-timeline" data-frame-index={frame} data-frame-time={current ?? ''}>
      <div className="radar-meteo-timeline-actions">
        <button type="button" aria-label={l.retroceder} onClick={() => onFrameChange((value) => Math.max(0, value - 1))}>‹</button>
        <button type="button" aria-label={playing ? 'Pausar' : l.reproducir} onClick={() => onPlayingChange((value) => !value)}>{playing ? 'Ⅱ' : '▶'}</button>
        <button type="button" aria-label={l.avanzar} onClick={() => onFrameChange((value) => Math.min(times.length - 1, value + 1))}>›</button>
        <strong>{label}</strong>
        <span className="radar-meteo-speeds">
          {([1, 2, 4] as const).map((value) => (
            <button key={value} type="button" aria-pressed={speed === value} onClick={() => onSpeedChange(value)}>{value}×</button>
          ))}
        </span>
        <label>
          {l.paso}
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
        aria-label={l.cuadro}
        disabled={!times.length}
      />
      <div className="radar-meteo-days">
        {times.map((time, index) => (
          <i key={time} style={{ left: `${times.length > 1 ? index * 100 / (times.length - 1) : 0}%` }} />
        ))}
        {marcas.map((marca, index) => (
          <span
            key={marca.time}
            className={`radar-meteo-axis-tick radar-meteo-axis-tick--${marca.tipo}`}
            data-align={index === 0 && marca.left < 5 ? 'start' : index === marcas.length - 1 && marca.left > 95 ? 'end' : undefined}
            style={{ left: `${marca.left}%` }}
          >
            {marca.label}
          </span>
        ))}
      </div>
    </div>
  )
}
