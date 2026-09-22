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
// Fase 2 (parte-mapa): una escuela = un punto, ya no una capa por categoría
// (la categoría pasó a ser filtro y dato de ficha, ver
// map-infraestructura-page). F2.3 agrega 'evacuacion' y 'sinReportar' como
// capas toggleables aparte de 'escuelas', sin tocar esa forma: son
// símbolos/anillos superpuestos sobre los mismos puntos, no una
// recodificación de color ni de tamaño. Componente propio en vez de
// generalizar LayerControl para no acoplar dos dominios de mapa distintos a
// un mismo tipo de clave.
export type CapaInfraestructura = 'escuelas' | 'evacuacion' | 'sinReportar'

export const CAPAS_INFRAESTRUCTURA_LABELS: Record<CapaInfraestructura, string> = {
  escuelas: 'Escuelas con afectación vigente',
  // "Evacuación" agrupa dos símbolos distintos (evacuado y centro de
  // evacuados, ver map-infraestructura-page): un solo toggle porque ambos
  // responden a la misma pregunta operativa ("¿hay algo pasando con el
  // edificio en sí?"), la leyenda es la que distingue cuál es cuál.
  evacuacion: 'Evacuación (evacuado / centro de evacuados)',
  sinReportar: 'Sin reportar (más de 72 h sin actualización)',
}

const ORDEN_CAPAS_INFRAESTRUCTURA: CapaInfraestructura[] = [
  'escuelas',
  'evacuacion',
  'sinReportar',
]

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