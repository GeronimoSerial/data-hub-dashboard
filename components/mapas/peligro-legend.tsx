import {
  CircleAlert,
  CircleCheck,
  CircleHelp,
  OctagonAlert,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import type { NivelPeligro } from '@/lib/infraestructura/riesgo/peligro/nivel'
import {
  COLOR_NIVEL_PELIGRO,
  ETIQUETA_NIVEL_PELIGRO,
  NIVELES_PELIGRO,
} from '@/lib/mapas/peligro-capas'

// Ícono distinto por nivel: la forma cambia con el nivel, así que la leyenda
// sigue siendo distinguible en escala de grises (o para quien no percibe
// color). Se eligió íconos de Lucide en vez de texturas CSS porque la
// diferencia de silueta es más obvia que la de un rayado, y no hace falta CSS
// nuevo. `sin_dato` usa la ayuda/interrogación, no un color de peligro.
const ICONO_NIVEL_PELIGRO: Record<NivelPeligro, LucideIcon> = {
  verde: CircleCheck,
  amarillo: CircleAlert,
  naranja: TriangleAlert,
  rojo: OctagonAlert,
  sin_dato: CircleHelp,
}

export function PeligroLegend({
  className,
  hayNivelProvisorio = false,
}: {
  className?: string
  hayNivelProvisorio?: boolean
}) {
  return (
    <div className={className}>
      <p className="peligro-legend__titulo">Peligro meteorológico estimado</p>
      <ul className="peligro-legend" aria-label="Niveles de peligro meteorológico">
        {NIVELES_PELIGRO.map((nivel) => {
          const Icono = ICONO_NIVEL_PELIGRO[nivel]
          return (
            <li key={nivel} className="peligro-legend__item">
              <span
                className="peligro-legend__muestra"
                style={{ backgroundColor: COLOR_NIVEL_PELIGRO[nivel] }}
                aria-hidden="true"
              />
              <Icono className="peligro-legend__icono" size={16} aria-hidden="true" />
              <span className="peligro-legend__etiqueta">
                {ETIQUETA_NIVEL_PELIGRO[nivel]}
              </span>
            </li>
          )
        })}
      </ul>
      {hayNivelProvisorio ? (
        <p className="peligro-legend__provisorio">
          <TriangleAlert size={16} aria-hidden="true" />
          Nivel provisorio (umbrales fijos de lluvia) mientras se calcula la
          climatología de la zona.
        </p>
      ) : null}
    </div>
  )
}
