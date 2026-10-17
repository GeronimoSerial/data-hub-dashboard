'use client'

import { X } from 'lucide-react'
import { letraViento } from './escalas'
import type { RespuestaRadarMeteo } from '@/lib/infraestructura/radar-meteo/use-radar-meteo'

function Sparkline({ data }: { data: number[] }) {
  const points = data
    .map((value, index) => `${index * 100 / Math.max(1, data.length - 1)},${36 - Math.max(0, Math.min(100, value)) * 0.32}`)
    .join(' ')

  return (
    <svg viewBox="0 0 100 40" role="img" aria-label="Probabilidad de precipitación durante siete días">
      <polyline points={points} fill="none" stroke="#55c8ef" strokeWidth="2" />
    </svg>
  )
}

export function PopupRadar({
  data,
  frame,
  index,
  paso,
  onClose,
}: {
  data: RespuestaRadarMeteo
  frame: number
  index: number
  paso: 1 | 3
  onClose: () => void
}) {
  const cell = data.grid?.celdas[index]
  if (!cell) return null

  const precipitation = data.valores.precipitation?.[frame]?.[index]
  const amount = precipitation === null || precipitation === undefined
    ? '—'
    : precipitation.toFixed(1)
  const probability = data.valores.precipitation_probability?.[frame]?.[index]
  const direction = data.valores.wind_direction_10m?.[frame]?.[index] ?? null
  const probabilitySeries = data.valores.precipitation_probability?.map((values) => values[index] ?? 0) ?? []

  return (
    <div className="radar-meteo-popup" role="dialog" aria-label="Pronóstico en el punto seleccionado">
      <button type="button" className="map-cerrar" aria-label="Cerrar" onClick={onClose}><X aria-hidden="true" /></button>
      <strong>{cell.lat.toFixed(2)}, {cell.lon.toFixed(2)}</strong>
      <dl className="radar-meteo-popup-filas">
        <dt>Lluvia (prob)</dt>
        <dd>{probability ?? '—'} %</dd>
        <dt>Lluvia (mm)</dt>
        <dd>{amount} {paso === 3 ? 'mm en 3 h' : 'mm/h'}</dd>
        <dt>Viento</dt>
        <dd>
          {letraViento(direction)} {data.valores.wind_speed_10m?.[frame]?.[index] ?? '—'} km/h
          {' '}({direction === null ? '—' : Math.round(direction)}°) · ráfaga {data.valores.wind_gusts_10m?.[frame]?.[index] ?? '—'} km/h
        </dd>
        <dt>Granizo</dt>
        <dd>{data.valores.granizo?.[frame]?.[index] ?? '—'}</dd>
      </dl>
      <Sparkline data={probabilitySeries} />
    </div>
  )
}
