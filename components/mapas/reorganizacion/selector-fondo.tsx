'use client'

// Cambiar de fondo cambia el `mapStyle` del mapa. No verificado: que react-map-gl
// vuelva a agregar Source/Layer tras ese cambio. El paquete `react-map-gl/maplibre`
// no resuelve en el node_modules local y natalidad no lo prueba.

import type { BasemapId } from '@/lib/map-types'
import { FONDOS_REORGANIZACION } from '@/lib/reorganizacion/fondos'
import { SegmentedGroup, SegmentedItem } from '@/components/ui/toggle-group'

type Props = {
  valor: BasemapId
  onCambio: (id: BasemapId) => void
}

export function SelectorFondo({ valor, onCambio }: Props) {
  return (
    <SegmentedGroup
      aria-label="Mapa de fondo"
      value={valor}
      onValueChange={(next) => onCambio(next as BasemapId)}
    >
      {FONDOS_REORGANIZACION.map((fondo) => (
        <SegmentedItem key={fondo.id} value={fondo.id} title={fondo.descripcion}>
          {fondo.etiqueta}
        </SegmentedItem>
      ))}
    </SegmentedGroup>
  )
}
