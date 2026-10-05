'use client'

import { BookMinus, BookX, Clock, DoorOpen, House } from 'lucide-react'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { colorNivelPlan, ETIQUETA_NIVEL_PLAN, TITULO_LEYENDA_VISTA, type VistaPlanificacion } from '@/lib/infraestructura/mapa/planificacion'
import { colorRiesgo, ETIQUETA_HORIZONTE_MOTOR, ETIQUETA_NIVEL_RIESGO, type HorizonteMotor } from '@/lib/infraestructura/mapa/radar'
import { ETIQUETA_CLASES } from '@/lib/infraestructura/mapa/etiquetas'
import { SEVERIDADES } from '@/lib/infraestructura/validacion'
import { COLOR_SIN_AFECTACION } from '@/lib/mapas/construir-escuelas-mapa-feature-collection'

type PropsLeyendaMapa =
  | { pestana: 'actual' }
  | { pestana: 'radar'; horizonte: HorizonteMotor }
  | { pestana: 'planificacion'; vista: VistaPlanificacion }
  | { pestana: 'estadisticas' }

const ESTADOS_LEYENDA = [
  { Icono: BookX, etiqueta: ETIQUETA_CLASES.sin },
  { Icono: BookMinus, etiqueta: ETIQUETA_CLASES.parcial },
  { Icono: DoorOpen, etiqueta: ETIQUETA_CLASES.evacuado },
  { Icono: House, etiqueta: ETIQUETA_CLASES.centro },
  { Icono: Clock, etiqueta: 'Sin actualizar' },
] as const

export function LeyendaMapa(props: PropsLeyendaMapa) {
  if (props.pestana === 'estadisticas') return null

  if (props.pestana === 'radar') {
    const niveles = [
      ['muy_alto', ETIQUETA_NIVEL_RIESGO.muy_alto],
      ['alto', ETIQUETA_NIVEL_RIESGO.alto],
      ['moderado', ETIQUETA_NIVEL_RIESGO.moderado],
      ['bajo', ETIQUETA_NIVEL_RIESGO.bajo],
    ] as const

    return (
      <aside className="map-leyenda" aria-label="Referencias del mapa">
        <b className="map-leyenda__titulo">
          Riesgo de afectación · {ETIQUETA_HORIZONTE_MOTOR[props.horizonte]}
        </b>
        <ul className="map-leyenda__fila">
          {niveles.map(([nivel, etiqueta]) => (
            <li className="map-leyenda__elemento" key={nivel}>
              <span
                aria-hidden="true"
                className="map-leyenda__muestra"
                style={{ backgroundColor: colorRiesgo(nivel) }}
              />
              <span>{etiqueta}</span>
            </li>
          ))}
        </ul>
      </aside>
    )
  }

  if (props.pestana === 'planificacion') {
    const niveles = [3, 2, 1, 0] as const

    return (
      <aside className="map-leyenda" aria-label="Referencias del mapa">
        <b className="map-leyenda__titulo">{TITULO_LEYENDA_VISTA[props.vista]}</b>
        <ul className="map-leyenda__fila">
          {niveles.map((nivel) => (
            <li className="map-leyenda__elemento" key={nivel}>
              <span
                aria-hidden="true"
                className="map-leyenda__muestra"
                style={{ backgroundColor: colorNivelPlan(nivel) }}
              />
              <span>{ETIQUETA_NIVEL_PLAN[nivel]}</span>
            </li>
          ))}
        </ul>
      </aside>
    )
  }

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
