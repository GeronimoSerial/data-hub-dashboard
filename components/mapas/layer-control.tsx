'use client'

import { COPY } from '@/lib/copy/didactica'
import { OVERLAY_LABELS, type OverlayKey } from '@/lib/map-types'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'
import { Checkbox } from '@/components/ui/checkbox'
import { tituloAcceso, tituloInundacion } from '@/lib/mapas/accesos-capas'
import { MOSTRAR_AGUA_ESTIMADA } from '@/lib/mapas/flags'
import { textos, type Diccionario } from '@/lib/i18n'
import { useTextos } from '@/lib/i18n/idioma-provider'

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
  const t = useTextos()

  return (
    <div className={styles.controlCard}>
      <h2 className={styles.controlHeading}>{t.controlesCapas.capas}</h2>
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

// Dimensión SEPARADA del riesgo compuesto: el acceso no es una severidad ni
// un estado del edificio, por eso es una capa propia y no una codificación
// de color de una capa existente.
export const CAPAS_RADAR_LABELS: Record<CapaRadar, string> = textos('es').controlesCapas.radar

const ORDEN_CAPAS_RADAR: CapaRadar[] = ['peligro', 'riesgo', 'riesgo-acceso']

export function RadarLayerControl({
  capas,
  onChange,
}: {
  capas: Record<CapaRadar, boolean>
  onChange: (capa: CapaRadar, value: boolean) => void
}) {
  const styles = useOverlayStyles()
  const t = useTextos()

  return (
    <div
      className={styles.controlCard}
      role="group"
      aria-labelledby="radar-layer-control-heading"
    >
      <h2 className={styles.controlHeading} id="radar-layer-control-heading">
        {t.controlesCapas.capasRadar}
      </h2>
      {ORDEN_CAPAS_RADAR.map((capa) => (
        <Checkbox
          key={capa}
          label={t.controlesCapas.radar[capa]}
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

export function etiquetasCapasAccesos(
  d: Diccionario['controlesCapas'],
  t: Diccionario = textos('es'),
): Record<CapaAccesos, string> {
  return {
    aislamiento: d.accesoAislamiento(tituloAcceso(t)),
    inundacion: tituloInundacion(t),
  }
}

export const CAPAS_ACCESOS_LABELS: Record<CapaAccesos, string> = etiquetasCapasAccesos(textos('es').controlesCapas)

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
  const t = useTextos()
  const etiquetas = etiquetasCapasAccesos(t.controlesCapas, t)

  return (
    <div
      className={styles.controlCard}
      role="group"
      aria-labelledby="accesos-layer-control-heading"
    >
      <h2 className={styles.controlHeading} id="accesos-layer-control-heading">
        {t.controlesCapas.capasTerritoriales}
      </h2>
      {ORDEN_CAPAS_ACCESOS.map((capa) => (
        <Checkbox
          key={capa}
          label={etiquetas[capa]}
          checked={capas[capa]}
          onCheckedChange={(checked) => onChange(capa, checked)}
        />
      ))}
    </div>
  )
}
