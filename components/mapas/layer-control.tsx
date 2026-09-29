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
  escuelas: 'Todas las escuelas (padrón)',
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
    <div
      className={styles.controlCard}
      role="group"
      aria-labelledby="infra-layer-control-heading"
    >
      <h2 className={styles.controlHeading} id="infra-layer-control-heading">
        Capas
      </h2>
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

// ── Capas del modo Radar ────────────────────────────────────────────────────
//
// Dominio DISTINTO del de arriba: peligro meteorológico estimado y riesgo
// pronosticado, no estado de servicio observado. Por eso es un union type y un
// componente HERMANO en vez de ampliar `CapaInfraestructura`: el comentario de
// ese tipo dice que es a propósito acotado a un dominio, y meter acá 'peligro'
// y 'riesgo' haría que ambos controles tuvieran que ignorarse mutuamente las
// claves que no les corresponden. Los dos controles conviven en el mismo
// `controlsStack` y el radar sólo se monta si el flag está prendido.
export type CapaRadar = 'peligro' | 'riesgo' | 'riesgo-acceso'

export const CAPAS_RADAR_LABELS: Record<CapaRadar, string> = {
  peligro: 'Peligro meteorológico estimado (por departamento)',
  riesgo: 'Riesgo pronosticado por escuela',
  // Dimensión SEPARADA del riesgo compuesto: el acceso no es una severidad ni
  // un estado del edificio, por eso es una capa propia y no una codificación
  // de color de una capa existente.
  'riesgo-acceso': 'Riesgo de acceso',
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
        Capas del radar
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
export type CapaAccesos = 'aislamiento' | 'inundacion' | 'rutaSeleccion'

export const CAPAS_ACCESOS_LABELS: Record<CapaAccesos, string> = {
  aislamiento: 'Aislamiento de acceso (OSM, estático)',
  inundacion: 'Susceptibilidad histórica de inundación fluvial (physrisk)',
  rutaSeleccion: 'Ruta y cruces de agua de la escuela seleccionada (OSM)',
}

const ORDEN_CAPAS_ACCESOS: CapaAccesos[] = ['aislamiento', 'inundacion', 'rutaSeleccion']

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