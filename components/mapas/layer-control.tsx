'use client'

import { Checkbox } from '@fluentui/react-components'
import { COPY } from '@/lib/copy/didactica'
import { OVERLAY_LABELS, type OverlayKey } from '@/lib/map-types'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'

type Props = {
  overlays: Record<OverlayKey, boolean>
  onChange: (key: OverlayKey, value: boolean) => void
}

const ORDER: OverlayKey[] = [
  'zones',
  'sobreoferta',
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
        <div key={key}>
          <Checkbox
            label={OVERLAY_LABELS[key]}
            checked={overlays[key]}
            onChange={(_e, data) => onChange(key, Boolean(data.checked))}
          />
          {key === 'sobreoferta' && overlays.sobreoferta && (
            <div className={styles.layerTip}>{COPY.layers.sobreofertaTip}</div>
          )}
        </div>
      ))}
    </div>
  )
}
