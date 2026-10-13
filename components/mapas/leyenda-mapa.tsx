'use client'

import { useState } from 'react'
import { BookMinus, BookX, Check, ChevronDown, ChevronUp, Clock, DoorOpen, House } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { COLOR_JUNTO_LAGUNA, colorNivelPlan, ETIQUETA_JUNTO_LAGUNA, ETIQUETA_NIVEL_PLAN, nivelesLeyendaPlanificacion, TITULO_LEYENDA_VISTA, type VistaPlanificacion } from '@/lib/infraestructura/mapa/planificacion'
import { colorRiesgo, ETIQUETA_HORIZONTE_MOTOR, ETIQUETA_NIVEL_RIESGO, type HorizonteMotor } from '@/lib/infraestructura/mapa/radar'
import { ETIQUETA_ESTADO_CLASES } from '@/lib/infraestructura/mapa/etiquetas'
import { SEVERIDADES } from '@/lib/infraestructura/validacion'
import { COLOR_ESTADO_ALTURA, etiquetaEstadoAltura } from '@/components/mapas/capa-estaciones-rio'

type PropsLeyendaMapa =
  | { pestana: 'actual' }
  | { pestana: 'radar'; horizonte: HorizonteMotor }
  | { pestana: 'planificacion'; vista: VistaPlanificacion }
  | { pestana: 'estadisticas' }

const ESTADOS_LEYENDA = [
  { Icono: BookX, etiqueta: ETIQUETA_ESTADO_CLASES.sin },
  { Icono: BookMinus, etiqueta: ETIQUETA_ESTADO_CLASES.parcial },
  { Icono: DoorOpen, etiqueta: ETIQUETA_ESTADO_CLASES.evacuado },
  { Icono: House, etiqueta: ETIQUETA_ESTADO_CLASES.centro },
  { Icono: Clock, etiqueta: 'Sin actualizar' },
  { Icono: Check, etiqueta: 'Solucionada recientemente' },
] as const

const ESTADOS_ALTURA_RIO = ['evacuacion', 'alerta', 'normal', 'sin_dato'] as const

function LeyendaAlturaRios() {
  return (
    <aside className="map-leyenda" aria-label="Altura de ríos">
      <b className="map-leyenda__titulo">Altura de ríos</b>
      <ul className="map-leyenda__fila">
        {ESTADOS_ALTURA_RIO.map((estado) => (
          <li className="map-leyenda__elemento" key={estado}>
            <span aria-hidden="true" className="map-leyenda__muestra" style={{ backgroundColor: COLOR_ESTADO_ALTURA[estado] }} />
            <span>{etiquetaEstadoAltura(estado)}</span>
          </li>
        ))}
      </ul>
    </aside>
  )
}

export function LeyendaMapa(props: PropsLeyendaMapa & { estacionesRio?: boolean }) {
  return (
    <>
      {props.estacionesRio && <LeyendaAlturaRios />}
      <LeyendaPestana {...props} />
    </>
  )
}

function LeyendaPestana(props: PropsLeyendaMapa) {
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
                className={`map-leyenda__muestra${nivel === 'bajo' ? ' map-leyenda__muestra--neutra' : ''}`}
                style={nivel === 'bajo' ? undefined : { backgroundColor: colorRiesgo(nivel) }}
              />
              <span>{etiqueta}</span>
            </li>
          ))}
        </ul>
      </aside>
    )
  }

  if (props.pestana === 'planificacion') {
    const niveles = nivelesLeyendaPlanificacion(props.vista)

    return (
      <aside className="map-leyenda" aria-label="Referencias del mapa">
        <b className="map-leyenda__titulo">{TITULO_LEYENDA_VISTA[props.vista]}</b>
        <ul className="map-leyenda__fila">
          {niveles.map((nivel) => (
            <li className="map-leyenda__elemento" key={nivel}>
              <span
                aria-hidden="true"
                className={`map-leyenda__muestra${nivel === 0 ? ' map-leyenda__muestra--neutra' : ''}`}
                style={nivel === 0 ? undefined : { backgroundColor: colorNivelPlan(nivel) }}
              />
              <span>{ETIQUETA_NIVEL_PLAN[nivel]}</span>
            </li>
          ))}
          {props.vista === 'inundacion' && (
            <li className="map-leyenda__elemento" key="junto-laguna">
              <span aria-hidden="true" className="map-leyenda__muestra" style={{ backgroundColor: COLOR_JUNTO_LAGUNA }} />
              <span>{ETIQUETA_JUNTO_LAGUNA}</span>
            </li>
          )}
        </ul>
      </aside>
    )
  }

  return <LeyendaActual />
}

function LeyendaActual() {
  const [simbolosAbiertos, setSimbolosAbiertos] = useState(false)

  return (
    <aside className="map-leyenda" aria-label="Referencias del mapa">
      <div id="map-leyenda-simbolos" hidden={!simbolosAbiertos}>
        <ul className="map-leyenda__simbolos">
          {ESTADOS_LEYENDA.map(({ Icono, etiqueta }) => (
            <li className="map-leyenda__elemento" key={etiqueta}>
              <Icono aria-hidden="true" className="map-leyenda__icono" size={14} />
              <span>{etiqueta}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="map-leyenda__actual">
        <ul className="map-leyenda__fila map-leyenda__gravedades">
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
          <li className="map-leyenda__elemento" key="sin-situaciones">
            <span
              aria-hidden="true"
              className="map-leyenda__muestra map-leyenda__muestra--neutra"
            />
            <span>Sin situaciones</span>
          </li>
        </ul>
        <Button
          aria-controls="map-leyenda-simbolos"
          aria-expanded={simbolosAbiertos}
          className="map-leyenda__boton"
          onClick={() => setSimbolosAbiertos((abiertos) => !abiertos)}
          size="sm"
          type="button"
          variant="ghost"
        >
          Símbolos
          {simbolosAbiertos
            ? <ChevronUp aria-hidden="true" size={14} />
            : <ChevronDown aria-hidden="true" size={14} />}
        </Button>
      </div>
    </aside>
  )
}
