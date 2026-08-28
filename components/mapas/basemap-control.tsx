'use client'

import { BASEMAPS, type BasemapId } from '@/lib/map-types'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'
import { RadioGroup, RadioItem } from '@/components/ui/radio'

type Props = {
  value: BasemapId
  onChange: (id: BasemapId) => void
}

export function BasemapControl({ value, onChange }: Props) {
  const styles = useOverlayStyles()

  return (
    <div className={styles.controlCard}>
      <h2 className={styles.controlHeading}>Mapa base</h2>
      <RadioGroup value={value} onValueChange={(next) => onChange(next as BasemapId)}>
        {(Object.keys(BASEMAPS) as BasemapId[]).map((id) => (
          <RadioItem key={id} value={id} label={BASEMAPS[id].label} />
        ))}
      </RadioGroup>
    </div>
  )
}