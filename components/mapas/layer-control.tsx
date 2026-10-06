'use client'

import { COPY } from '@/lib/copy/didactica'
import { OVERLAY_LABELS, type OverlayKey } from '@/lib/map-types'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'
import { Checkbox } from '@/components/ui/checkbox'
import { TEXTOS_ACCESOS } from '@/lib/mapas/accesos-capas'
import { MOSTRAR_AGUA_ESTIMADA } from '@/lib/mapas/flags'

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

// ── Capas del modo Radar ────────────────────────────────────────────────────
//
// Dominio DISTINTO del de arriba: peligro meteorológico estimado y riesgo
// pronosticado, no estado de servicio observado. Por eso es un union type y un
// componente independiente para que los controles territoriales mantengan su
// propio dominio. Los dos controles conviven en el mismo
// `controlsStack` y el radar sólo se monta si el flag está prendido.
export type CapaRadar = 'peligro' | 'riesgo' | 'riesgo-acceso'

export const CAPAS_RADAR_LABELS: Record<CapaRadar, string> = {
  peligro: 'Peligro por clima estimado (por departamento)',
  riesgo: 'Riesgo pronosticado por escuela',
  // Dimensión SEPARADA del riesgo compuesto: el acceso no es una severidad ni
  // un estado del edificio, por eso es una capa propia y no una codificación
  // de color de una capa existente.
  'riesgo-acceso': 'Riesgo pronosticado de llegar a la escuela',
}

const ORDEN_CAPAS_RADAR: CapaRadar[] = ['peligro', 'riesgo', 'riesgo-acceso']

export function RadarLayerControl({
  capas,
  onChange,
}: {
  capas: Record<CapaRadar, boolean>
  onChange: (capa: CapaRadar, value: boolean) => void
}) {
  const styles = useOverlayStyles()

  return (
    <div
      className={styles.controlCard}
      role="group"
      aria-labelledby="radar-layer-control-heading"
    >
      <h2 className={styles.controlHeading} id="radar-layer-control-heading">
        Capas del radar (pronóstico)
      </h2>
      {ORDEN_CAPAS_RADAR.map((capa) => (
        <Checkbox
          key={capa}
          label={CAPAS_RADAR_LABELS[capa]}
          checked={capas[capa]}
          onCheckedChange={(checked) => onChange(capa, checked)}
        />
      ))}
    </div>
  )
}

// ── Capas territoriales del mapa de accesos ─────────────────────────────────
//
// Dominio SEPARADO del de infraestructura y del de radar: capas territoriales
// ESTÁTICAS (índice de aislamiento OSM y susceptibilidad histórica physrisk) y
// la ruta OSM de la escuela seleccionada. Son contexto derivado offline, nunca
// un pronóstico ni el estado confirmado del edificio. Tercer union type y
// componente hermano para no acoplar el acotamiento de los dominios previos.
export type CapaAccesos = 'aislamiento' | 'inundacion'

export const CAPAS_ACCESOS_LABELS: Record<CapaAccesos, string> = {
  aislamiento: `${TEXTOS_ACCESOS.tituloAcceso} (0 a 3)`,
  inundacion: TEXTOS_ACCESOS.tituloInundacion,
}

const ORDEN_CAPAS_ACCESOS: CapaAccesos[] = [
  'aislamiento',
  ...(MOSTRAR_AGUA_ESTIMADA ? ['inundacion' as const] : []),
]

export function AccesosLayerControl({
  capas,
  onChange,
}: {
  capas: Record<CapaAccesos, boolean>
  onChange: (capa: CapaAccesos, value: boolean) => void
}) {
  const styles = useOverlayStyles()

  return (
    <div
      className={styles.controlCard}
      role="group"
      aria-labelledby="accesos-layer-control-heading"
    >
      <h2 className={styles.controlHeading} id="accesos-layer-control-heading">
        Capas territoriales
      </h2>
      {ORDEN_CAPAS_ACCESOS.map((capa) => (
        <Checkbox
          key={capa}
          label={CAPAS_ACCESOS_LABELS[capa]}
          checked={capas[capa]}
          onCheckedChange={(checked) => onChange(capa, checked)}
        />
      ))}
    </div>
  )
}
