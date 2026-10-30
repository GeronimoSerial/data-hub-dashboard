'use client'


import { useSyncExternalStore } from 'react'
import { DatoFechado, NotaInfo } from '@/components/ui/dato-fechado'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { colorNivelPlan, ETIQUETA_NIVEL_PLAN, nivelesLeyendaPlanificacion, TITULO_LEYENDA_VISTA, type VistaPlanificacion } from '@/lib/infraestructura/mapa/planificacion'
import { colorRiesgo, ETIQUETA_HORIZONTE_MOTOR, ETIQUETA_NIVEL_RIESGO, type HorizonteMotor } from '@/lib/infraestructura/mapa/radar'
import { ETIQUETA_ESTADO_CLASES } from '@/lib/infraestructura/mapa/etiquetas'
import { SEVERIDADES } from '@/lib/infraestructura/validacion'
import { CLASES_LLUVIA, type MetaLluviaObservada } from '@/components/mapas/capa-lluvia-observada'
import { IconoMapaLeyenda, svgMarcadorEstacion, type EstadoEstacion } from '@/lib/mapas/insignias-mapa'
import { GLIFO_BADGE_ESTADO, SVG_ICONO_ESCUELA_SOLUCIONADA_LEYENDA, svgBadgeEstado } from '@/lib/mapas/iconos-mapa'

type PropsLeyendaMapa =
  | { pestana: 'actual' }
  | { pestana: 'radar'; horizonte: HorizonteMotor }
  | { pestana: 'planificacion'; vista: VistaPlanificacion; horizonte?: HorizonteMotor }
  | { pestana: 'estadisticas' }

// Mismo SVG que rasteriza el mapa, a tamaño de leyenda (16 px, escala 1).
const svgEstadoLeyenda = (icono: keyof typeof GLIFO_BADGE_ESTADO) => svgBadgeEstado(GLIFO_BADGE_ESTADO[icono], false, 16, 1)

const ESTADOS_LEYENDA = [
  { svg: svgEstadoLeyenda('sin'), etiqueta: ETIQUETA_ESTADO_CLASES.sin },
  { svg: svgEstadoLeyenda('parcial'), etiqueta: ETIQUETA_ESTADO_CLASES.parcial },
  { svg: svgEstadoLeyenda('evacuado'), etiqueta: ETIQUETA_ESTADO_CLASES.evacuado },
  { svg: svgEstadoLeyenda('centro'), etiqueta: ETIQUETA_ESTADO_CLASES.centro },
  { svg: svgEstadoLeyenda('reloj'), etiqueta: 'Sin actualizar' },
  { svg: SVG_ICONO_ESCUELA_SOLUCIONADA_LEYENDA, etiqueta: 'Solucionada recientemente' },
] as const

const ESTADOS_ALTURA_RIO: ReadonlyArray<{ estado: EstadoEstacion; etiqueta: string }> = [
  { estado: 'evacuacion', etiqueta: 'Evacuación' },
  { estado: 'alerta', etiqueta: 'Alerta' },
  { estado: 'normal', etiqueta: 'Normal' },
  { estado: 'sin_dato', etiqueta: 'Sin dato' },
]

const FORMATO_CORTE_LLUVIA = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'America/Argentina/Buenos_Aires',
})

function LeyendaLluviaObservada({ meta }: { meta: MetaLluviaObservada }) {
  const hasta = meta.hasta && !Number.isNaN(Date.parse(meta.hasta)) ? FORMATO_CORTE_LLUVIA.format(new Date(meta.hasta)) : null
  return (
    <div className="map-leyenda__bloque">
      <b className="map-leyenda__subtitulo">
        <DatoFechado actualizado={hasta ? `Actualizado ${hasta}` : 'Sin fecha de actualización'} vencido={meta.vencida}>
          Lluvia observada {meta.horas} h
        </DatoFechado>
        <NotaInfo
          texto={`Estimación satelital (NASA IMERG), no medición en tierra.${meta.parciales > 0 ? ` ${meta.parciales} celdas con ventana incompleta.` : ''} Hacé clic en el mapa para ver el valor.`}
        />
      </b>
      <ul className="map-leyenda__escala">
        {CLASES_LLUVIA.map((clase) => (
          <li className="map-leyenda__elemento" key={clase.desde}>
            <span aria-hidden="true" className="map-leyenda__muestra" style={{ backgroundColor: clase.color }} />
            <span>{clase.etiqueta}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const CONSULTA_ESTRECHA = '(max-width: 1279px)'

/** En pantallas de hasta 1279 px la leyenda arranca plegada para dejar mapa útil. */
function usePantallaEstrecha(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {}
      const consulta = window.matchMedia(CONSULTA_ESTRECHA)
      consulta.addEventListener('change', avisar)
      return () => consulta.removeEventListener('change', avisar)
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(CONSULTA_ESTRECHA).matches : false),
    () => false,
  )
}

function SituacionActual({ estacionesRio, lluviaObservada, riesgoHoy, abierta }: {
  abierta: boolean
  riesgoHoy: boolean
  estacionesRio: boolean
  lluviaObservada: MetaLluviaObservada | null
}) {
  return (
    <details className="map-leyenda__seccion" open={abierta}>
      <summary className="map-leyenda__seccion-titulo">Situación actual</summary>
      <div className="map-leyenda__seccion-cuerpo">
        {estacionesRio && (
          <div className="map-leyenda__bloque">
            <b className="map-leyenda__subtitulo">Estaciones de Prefectura<NotaInfo texto="Una lectura de más de 18 h conserva su último nivel; su antigüedad está en la ficha de la estación." /></b>
            <ul className="map-leyenda__situacion">
              {ESTADOS_ALTURA_RIO.map(({ estado, etiqueta }) => (
                <li className="map-leyenda__elemento" key={estado}>
                  <IconoMapaLeyenda svg={svgMarcadorEstacion(estado, 0.6)} />
                  <span>{etiqueta}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {lluviaObservada && <LeyendaLluviaObservada meta={lluviaObservada} />}
        {riesgoHoy && (
          <div className="map-leyenda__bloque">
            <b className="map-leyenda__subtitulo">Escuelas en riesgo hoy</b>
            <ul className="map-leyenda__fila">
              {(['muy_alto', 'alto', 'moderado'] as const).map((nivel) => (
                <li className="map-leyenda__elemento" key={nivel}>
                  <span aria-hidden="true" className="map-leyenda__muestra" style={{ backgroundColor: colorRiesgo(nivel) }} />
                  <span>{ETIQUETA_NIVEL_RIESGO[nivel]}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  )
}

function ReferenciasRiesgo({ props }: { props: PropsLeyendaMapa }) {
  // Riesgo hoy de Planificación comparte la escala del motor con el Radar.
  if (props.pestana === 'planificacion' && props.vista === 'riesgo') {
    return <ReferenciasRiesgo props={{ pestana: 'radar', horizonte: props.horizonte ?? 24 }} />
  }
  if (props.pestana === 'radar') {
    const niveles = [
      ['muy_alto', ETIQUETA_NIVEL_RIESGO.muy_alto],
      ['alto', ETIQUETA_NIVEL_RIESGO.alto],
      ['moderado', ETIQUETA_NIVEL_RIESGO.moderado],
    ] as const

    return (
      <>
        <b className="map-leyenda__titulo">
          Riesgo actual (hoy) · {ETIQUETA_HORIZONTE_MOTOR[props.horizonte]}
          <NotaInfo texto="Las demás escuelas se ven como puntos grises tenues al acercar el mapa (zoom 9 o más); con un clic se abre su ficha." />
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
      </>
    )
  }

  if (props.pestana === 'planificacion' && props.vista !== 'riesgo') {
    const niveles = nivelesLeyendaPlanificacion(props.vista)

    return (
      <>
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
        </ul>
      </>
    )
  }

  if (props.pestana === 'actual') {
    return (
      <>
        <p>El color indica la gravedad del establecimiento o la prioridad calculada de inaccesibilidad de alumnos, según la situación principal.</p>
        <p>La prioridad de alumnos combina el porcentaje de la matrícula afectada y la cantidad de alumnos. Sin matrícula o selección vigente, no se asigna un nivel.</p>
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
            <span aria-hidden="true" className="map-leyenda__muestra map-leyenda__muestra--neutra" />
            <span>Sin situaciones</span>
          </li>
        </ul>
      </>
    )
  }

  return null
}

export function LeyendaMapa(props: PropsLeyendaMapa & { estacionesRio?: boolean; lluviaObservada?: MetaLluviaObservada | null; riesgoHoy?: boolean }) {
  const estrecha = usePantallaEstrecha()
  const estacionesRio = Boolean(props.estacionesRio)
  const lluviaObservada = props.lluviaObservada ?? null
  const riesgoHoy = Boolean(props.riesgoHoy)
  const hayCapas = estacionesRio || lluviaObservada !== null || riesgoHoy

  if (props.pestana === 'estadisticas' && !hayCapas) return null

  return (
    <aside className={`map-leyenda map-leyenda--${props.pestana}`} aria-label="Referencias del mapa">
      {hayCapas && (
        <SituacionActual
          // Fuera de "Situación actual" manda la escala de la pestaña: estas referencias quedan plegadas.
          abierta={!estrecha && (props.pestana === 'actual' || props.pestana === 'estadisticas')}
          estacionesRio={estacionesRio}
          lluviaObservada={lluviaObservada}
          riesgoHoy={riesgoHoy}
        />
      )}
      {props.pestana !== 'estadisticas' && (
        <details className="map-leyenda__seccion" open={!estrecha || props.pestana === 'radar' || props.pestana === 'planificacion'}>
          <summary className="map-leyenda__seccion-titulo">{props.pestana === 'actual' ? 'Gravedad / prioridad' : 'Riesgo / gravedad'}</summary>
          <div className="map-leyenda__seccion-cuerpo">
            <ReferenciasRiesgo props={props} />
          </div>
        </details>
      )}
      {props.pestana === 'actual' && (
        <details className="map-leyenda__seccion">
          <summary className="map-leyenda__seccion-titulo">Símbolos</summary>
          <div className="map-leyenda__seccion-cuerpo">
            <ul className="map-leyenda__simbolos">
              {ESTADOS_LEYENDA.map(({ svg, etiqueta }) => (
                <li className="map-leyenda__elemento" key={etiqueta}>
                  <IconoMapaLeyenda svg={svg} />
                  <span>{etiqueta}</span>
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}
    </aside>
  )
}
