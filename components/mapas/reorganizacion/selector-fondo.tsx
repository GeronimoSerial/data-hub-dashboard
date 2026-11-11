'use client'

// Cambiar de fondo cambia el `mapStyle` del mapa. No verificado: que react-map-gl
// vuelva a agregar Source/Layer tras ese cambio. El paquete `react-map-gl/maplibre`
// no resuelve en el node_modules local y natalidad no lo prueba.

import { FONDOS_REORGANIZACION, type FondoId } from '@/lib/reorganizacion/fondos'
import { SegmentedGroup, SegmentedItem } from '@/components/ui/toggle-group'

type Props = {
  valor: FondoId
  onCambio: (id: FondoId) => void
}

export function SelectorFondo({ valor, onCambio }: Props) {
  return (
    <SegmentedGroup
      aria-label="Mapa de fondo"
      value={valor}
      onValueChange={(next) => onCambio(next as FondoId)}
    >
      {FONDOS_REORGANIZACION.map((fondo) => (
        <SegmentedItem key={fondo.id} value={fondo.id} title={fondo.descripcion}>
          {fondo.etiqueta}
        </SegmentedItem>
      ))}
    </SegmentedGroup>
  )
}
