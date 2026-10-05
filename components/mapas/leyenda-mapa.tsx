'use client'

import { BookMinus, BookX, Clock, DoorOpen, House } from 'lucide-react'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { ETIQUETA_CLASES } from '@/lib/infraestructura/mapa/etiquetas'
import type { PestanaMapa } from '@/lib/infraestructura/mapa/tipos'
import { SEVERIDADES } from '@/lib/infraestructura/validacion'
import { COLOR_SIN_AFECTACION } from '@/lib/mapas/construir-escuelas-mapa-feature-collection'

const ESTADOS_LEYENDA = [
  { Icono: BookX, etiqueta: ETIQUETA_CLASES.sin },
  { Icono: BookMinus, etiqueta: ETIQUETA_CLASES.parcial },
  { Icono: DoorOpen, etiqueta: ETIQUETA_CLASES.evacuado },
  { Icono: House, etiqueta: ETIQUETA_CLASES.centro },
  { Icono: Clock, etiqueta: 'Sin actualizar' },
] as const

export function LeyendaMapa({ pestana }: { pestana: PestanaMapa }) {
  if (pestana !== 'actual') return null

  return (
    <aside className="map-leyenda" aria-label="Referencias del mapa">
      <ul className="map-leyenda__fila">
        {[...SEVERIDADES].reverse().map((severidad) => (
          <li className="map-leyenda__elemento" key={severidad}>
            <span
              aria-hidden="true"
              className="map-leyenda__muestra"
              style={{ backgroundColor: colorSeveridad(severidad) }}
            />
            <span>{severidad}</span>
          </li>
        ))}
        <li className="map-leyenda__elemento" key="sin-reporte">
          <span
            aria-hidden="true"
            className="map-leyenda__muestra"
            style={{ backgroundColor: COLOR_SIN_AFECTACION }}
          />
          <span>Sin reporte</span>
        </li>
      </ul>
      <ul className="map-leyenda__fila">
        {ESTADOS_LEYENDA.map(({ Icono, etiqueta }) => (
          <li className="map-leyenda__elemento" key={etiqueta}>
            <Icono aria-hidden="true" className="map-leyenda__icono" size={14} />
            <span>{etiqueta}</span>
          </li>
        ))}
      </ul>
    </aside>
  )
}
