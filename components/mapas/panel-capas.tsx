'use client'

import { BASEMAPS, type BasemapId } from '@/lib/map-types'
import { type CapasVisibles } from '@/lib/infraestructura/mapa/capas'
import { RadioGroup, RadioItem } from '@/components/ui/radio'
import { Switch } from '@/components/ui/switch'
import { colorNivelPlan, ETIQUETA_NIVEL_PLAN } from '@/lib/infraestructura/mapa/planificacion'
import { type HorasLluvia } from '@/components/mapas/capa-lluvia-observada'

type Props = {
  value: BasemapId
  onChange: (id: BasemapId) => void
  capasVisibles: CapasVisibles
  onCapasVisiblesChange: (capas: CapasVisibles) => void
  haySeleccion: boolean
  riesgoDisponible?: boolean
  /** The engine risk snapshot exists (Radar enabled): offer "Escuelas en riesgo hoy". */
  riesgoHoyDisponible?: boolean
  horasLluvia?: HorasLluvia
  onHorasLluviaChange?: (horas: HorasLluvia) => void
}

const NIVELES_RIESGO = [3, 2, 1] as const

export function PanelCapas({ value, onChange, capasVisibles, onCapasVisiblesChange, haySeleccion, riesgoDisponible = false, riesgoHoyDisponible = false, horasLluvia = 72, onHorasLluviaChange }: Props) {
  const cambiarCapa = (capa: keyof CapasVisibles, visible: boolean) => {
    onCapasVisiblesChange({ ...capasVisibles, [capa]: visible })
  }

  return (
    <section className="map-sitact" aria-label="Capas" data-testid="panel-capas">
      <section className="map-capas__grupo" role="group" aria-labelledby="map-capas-situacion-titulo">
        <h3 id="map-capas-situacion-titulo" className="map-sitact__titulo-seccion">Situación actual</h3>
        <Switch
          checked={capasVisibles.estacionesRio}
          onCheckedChange={(visible) => cambiarCapa('estacionesRio', visible)}
          label="Estaciones de Prefectura (altura de ríos)"
        />
        <Switch
          checked={capasVisibles.lluviaObservada}
          onCheckedChange={(visible) => cambiarCapa('lluviaObservada', visible)}
          label="Lluvia observada (satélite IMERG)"
        />
        {capasVisibles.lluviaObservada && (
          <RadioGroup
            value={String(horasLluvia)}
            onValueChange={(next) => onHorasLluviaChange?.(next === '24' ? 24 : 72)}
            aria-label="Ventana de lluvia observada"
          >
            <RadioItem value="24" label="24 h" />
            <RadioItem value="72" label="72 h" />
          </RadioGroup>
        )}
      </section>
      <section className="map-capas__grupo" role="group" aria-labelledby="map-capas-mapa-base-titulo">
        <h3 id="map-capas-mapa-base-titulo" className="map-sitact__titulo-seccion">Mapa base</h3>
        <RadioGroup value={value} onValueChange={(next) => onChange(next as BasemapId)}>
          {(Object.keys(BASEMAPS) as BasemapId[]).map((id) => (
            <RadioItem key={id} value={id} label={BASEMAPS[id].label} />
          ))}
        </RadioGroup>
        <Switch
          checked={capasVisibles.limitesDepartamentos}
          onCheckedChange={(visible) => cambiarCapa('limitesDepartamentos', visible)}
          label="Límites de los departamentos"
        />
        <Switch
          checked={capasVisibles.nombresDepartamentos}
          onCheckedChange={(visible) => cambiarCapa('nombresDepartamentos', visible)}
          label="Nombres de los departamentos"
        />
      </section>
      <section className="map-capas__grupo" role="group" aria-labelledby="map-capas-referencias-titulo">
        <h3 id="map-capas-referencias-titulo" className="map-sitact__titulo-seccion">Referencias</h3>
        <div>
          <Switch
            checked={capasVisibles.rutaAcceso}
            onCheckedChange={(visible) => cambiarCapa('rutaAcceso', visible)}
            label="Ruta de acceso de la escuela seleccionada"
          />
          {!haySeleccion && <p className="map-hint">Se muestra al seleccionar una escuela.</p>}
        </div>
        <div>
          <Switch
            checked={capasVisibles.crucesAgua}
            onCheckedChange={(visible) => cambiarCapa('crucesAgua', visible)}
            label="Cruces de agua de la ruta"
          />
          {!haySeleccion && <p className="map-hint">Se muestra al seleccionar una escuela.</p>}
        </div>
      </section>
      <section className="map-capas__grupo" role="group" aria-labelledby="map-capas-riesgo-titulo">
        <h3 id="map-capas-riesgo-titulo" className="map-sitact__titulo-seccion">Riesgo</h3>
        {riesgoHoyDisponible && (
          <Switch
            checked={capasVisibles.escuelasEnRiesgo}
            onCheckedChange={(visible) => cambiarCapa('escuelasEnRiesgo', visible)}
            label="Escuelas en riesgo hoy (moderado o más)"
          />
        )}
        <Switch
          checked={capasVisibles.escuelasAisladas}
          onCheckedChange={(visible) => cambiarCapa('escuelasAisladas', visible)}
          label="Escuelas aisladas"
          disabled={!riesgoDisponible}
        />
        {!riesgoDisponible && <p className="map-hint">Los datos territoriales no están disponibles.</p>}
        {capasVisibles.escuelasAisladas && (
          <div className="map-capas__escala-riesgo" aria-label="Escala de riesgo">
            {NIVELES_RIESGO.map((nivel) => (
              <span className="map-leyenda__elemento" key={nivel}>
                <span className="map-leyenda__muestra map-capas__muestra-riesgo" style={{ backgroundColor: colorNivelPlan(nivel) }} />
                {ETIQUETA_NIVEL_PLAN[nivel]}
              </span>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}
