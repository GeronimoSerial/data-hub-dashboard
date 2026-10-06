'use client'

import { BASEMAPS, type BasemapId } from '@/lib/map-types'
import { type CapasVisibles } from '@/lib/infraestructura/mapa/capas'
import { RadioGroup, RadioItem } from '@/components/ui/radio'
import { Switch } from '@/components/ui/switch'

type Props = {
  value: BasemapId
  onChange: (id: BasemapId) => void
  capasVisibles: CapasVisibles
  onCapasVisiblesChange: (capas: CapasVisibles) => void
  haySeleccion: boolean
}

export function PanelCapas({ value, onChange, capasVisibles, onCapasVisiblesChange, haySeleccion }: Props) {
  const cambiarCapa = (capa: keyof CapasVisibles, visible: boolean) => {
    onCapasVisiblesChange({ ...capasVisibles, [capa]: visible })
  }

  return (
    <section className="map-sitact" aria-label="Capas">
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
    </section>
  )
}
