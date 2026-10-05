'use client'

import { BASEMAPS, type BasemapId } from '@/lib/map-types'
import { RadioGroup, RadioItem } from '@/components/ui/radio'

type Props = {
  value: BasemapId
  onChange: (id: BasemapId) => void
}

export function PanelCapas({ value, onChange }: Props) {
  return (
    <section className="map-sitact" aria-label="Capas">
      <section className="map-capas__grupo" role="group" aria-labelledby="map-capas-mapa-base-titulo">
        <h3 id="map-capas-mapa-base-titulo" className="map-sitact__titulo-seccion">Mapa base</h3>
        <RadioGroup value={value} onValueChange={(next) => onChange(next as BasemapId)}>
          {(Object.keys(BASEMAPS) as BasemapId[]).map((id) => (
            <RadioItem key={id} value={id} label={BASEMAPS[id].label} />
          ))}
        </RadioGroup>
      </section>
    </section>
  )
}
