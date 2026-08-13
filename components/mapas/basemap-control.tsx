'use client'

import { Radio, RadioGroup } from '@fluentui/react-components'
import { BASEMAPS, type BasemapId } from '@/lib/map-types'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'

type Props = {
  value: BasemapId
  onChange: (id: BasemapId) => void
}

export function BasemapControl({ value, onChange }: Props) {
  const styles = useOverlayStyles()

  return (
    <div className={styles.controlCard}>
      <h2 className={styles.controlHeading}>Mapa base</h2>
      <RadioGroup
        value={value}
        onChange={(_e, data) => onChange(data.value as BasemapId)}
      >
        {(Object.keys(BASEMAPS) as BasemapId[]).map((id) => (
          <Radio key={id} value={id} label={BASEMAPS[id].label} />
        ))}
      </RadioGroup>
    </div>
  )
}
