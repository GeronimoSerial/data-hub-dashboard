'use client'

import { Checkbox } from '@fluentui/react-components'
import { OVERLAY_LABELS, type OverlayKey } from '@/lib/map-types'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'

type Props = {
  overlays: Record<OverlayKey, boolean>
  onChange: (key: OverlayKey, value: boolean) => void
}

const ORDER: OverlayKey[] = [
  'zones',
  'down',
  'up',
  'flat',
  'partial',
  'localities',
]

export function LayerControl({ overlays, onChange }: Props) {
  const styles = useOverlayStyles()

  return (
    <div className={styles.controlCard}>
      <h2 className={styles.controlHeading}>Capas</h2>
      {ORDER.map((key) => (
        <Checkbox
          key={key}
          label={OVERLAY_LABELS[key]}
          checked={overlays[key]}
          onChange={(_e, data) => onChange(key, Boolean(data.checked))}
        />
      ))}
    </div>
  )
}
