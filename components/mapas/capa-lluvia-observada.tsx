'use client'

import { useEffect, useState } from 'react'
import { Layer, Source } from 'react-map-gl/maplibre'

export type HorasLluvia = 24 | 72

export type MetaLluviaObservada = { hasta: string | null; horas: HorasLluvia }

type FeatureLluvia = {
  type: 'Feature'
  geometry: { type: 'Polygon'; coordinates: number[][][] }
  properties: { geometryRef: string; acumuladoMm: number; parcial: boolean }
}

export const CLASES_LLUVIA: ReadonlyArray<{ desde: number; color: string; etiqueta: string }> = [
  { desde: 10, color: '#bfdbfe', etiqueta: '10–25 mm' },
  { desde: 25, color: '#60a5fa', etiqueta: '25–50 mm' },
  { desde: 50, color: '#2563eb', etiqueta: '50–100 mm' },
  { desde: 100, color: '#1e3a8a', etiqueta: '100–200 mm' },
  { desde: 200, color: '#581c87', etiqueta: '200 mm o más' },
]

const COLOR_SIN_LLUVIA = 'rgba(0,0,0,0)'

const COLOR_LLUVIA_PAINT: unknown[] = [
  'step',
  ['get', 'acumuladoMm'],
  COLOR_SIN_LLUVIA,
  ...CLASES_LLUVIA.flatMap((clase) => [clase.desde, clase.color]),
]

export function CapaLluviaObservada({
  visible,
  horas,
  onMeta,
}: {
  visible: boolean
  horas: HorasLluvia
  onMeta?: (meta: MetaLluviaObservada) => void
}) {
  const [features, setFeatures] = useState<FeatureLluvia[] | null>(null)

  useEffect(() => {
    if (!visible) return
    const controller = new AbortController()
    fetch(`/api/infraestructura/peligro/observado-grilla?horas=${horas}`, { signal: controller.signal })
      .then((respuesta) => (respuesta.ok ? respuesta.json() : Promise.reject(new Error('observado-grilla'))))
      .then((cuerpo: { hasta?: unknown; geojson?: { features?: unknown } }) => {
        if (!Array.isArray(cuerpo?.geojson?.features)) return
        setFeatures(cuerpo.geojson.features as FeatureLluvia[])
        onMeta?.({ hasta: typeof cuerpo.hasta === 'string' ? cuerpo.hasta : null, horas })
      })
      .catch(() => {})
    return () => controller.abort()
  }, [visible, horas, onMeta])

  if (!visible || features === null) return null

  const datos = { type: 'FeatureCollection' as const, features }

  return (
    <Source id="lluvia-observada-src" type="geojson" data={datos}>
      <Layer
        id="lluvia-observada-relleno"
        type="fill"
        paint={{
          'fill-color': COLOR_LLUVIA_PAINT as never,
          'fill-opacity': ['case', ['boolean', ['get', 'parcial'], false], 0.35, 0.6],
        }}
      />
      <Layer
        id="lluvia-observada-parcial"
        type="line"
        filter={['==', ['get', 'parcial'], true]}
        paint={{ 'line-color': '#6b7280', 'line-width': 1, 'line-dasharray': [2, 2] }}
      />
    </Source>
  )
}
