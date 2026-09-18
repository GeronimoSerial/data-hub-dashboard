'use client'

import { COPY } from '@/lib/copy/didactica'
import { OVERLAY_LABELS, type OverlayKey } from '@/lib/map-types'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'
import { Checkbox } from '@/components/ui/checkbox'

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
            onCheckedChange={(checked) => onChange(key, checked)}
          />
          {key === 'sobreoferta' && overlays.sobreoferta && (
            <div className={styles.layerTip}>{COPY.layers.sobreofertaTip}</div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Capas del mapa de infraestructura ───────────────────────────────────────
//
// Dos capas propias (establecimiento / alumnos, ver map-infraestructura-page),
// ajenas al OverlayKey de arriba (que es del mapa de evolución de matrícula).
// Componente propio en vez de generalizar LayerControl para no acoplar dos
// dominios de mapa distintos a un mismo tipo de clave.
export type CapaInfraestructura = 'establecimiento' | 'alumnos'

export const CAPAS_INFRAESTRUCTURA_LABELS: Record<CapaInfraestructura, string> = {
  establecimiento: 'Afecta al establecimiento',
  alumnos: 'Inaccesibilidad de alumnos',
}

const ORDEN_CAPAS_INFRAESTRUCTURA: CapaInfraestructura[] = ['establecimiento', 'alumnos']

export function InfraLayerControl({
  capas,
  onChange,
}: {
  capas: Record<CapaInfraestructura, boolean>
  onChange: (capa: CapaInfraestructura, value: boolean) => void
}) {
  const styles = useOverlayStyles()

  return (
    <div className={styles.controlCard}>
      <h2 className={styles.controlHeading}>Capas</h2>
      {ORDEN_CAPAS_INFRAESTRUCTURA.map((capa) => (
        <Checkbox
          key={capa}
          label={CAPAS_INFRAESTRUCTURA_LABELS[capa]}
          checked={capas[capa]}
          onCheckedChange={(checked) => onChange(capa, checked)}
        />
      ))}
    </div>
  )
}