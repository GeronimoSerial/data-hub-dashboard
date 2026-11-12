'use client'

import { BASEMAPS, etiquetaBasemap, type BasemapId } from '@/lib/map-types'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'
import { RadioGroup, RadioItem } from '@/components/ui/radio'
import { useTextos } from '@/lib/i18n/idioma-provider'

type Props = {
  value: BasemapId
  onChange: (id: BasemapId) => void
}

export function BasemapControl({ value, onChange }: Props) {
  const t = useTextos()
  const styles = useOverlayStyles()

  return (
    <div className={styles.controlCard}>
      <h2 className={styles.controlHeading}>{t.controlesCapas.mapaBase}</h2>
      <RadioGroup value={value} onValueChange={(next) => onChange(next as BasemapId)}>
        {(Object.keys(BASEMAPS) as BasemapId[]).map((id) => (
          <RadioItem key={id} value={id} label={etiquetaBasemap(t, id)} />
        ))}
      </RadioGroup>
    </div>
  )
}