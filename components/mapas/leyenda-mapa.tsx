'use client'


import { useSyncExternalStore } from 'react'
import { DatoFechado, NotaInfo } from '@/components/ui/dato-fechado'
import { BookMinus, BookX, Check, Clock, DoorOpen, House } from 'lucide-react'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { COLOR_JUNTO_LAGUNA, colorNivelPlan, ETIQUETA_JUNTO_LAGUNA, ETIQUETA_NIVEL_PLAN, nivelesLeyendaPlanificacion, TITULO_LEYENDA_VISTA, type VistaPlanificacion } from '@/lib/infraestructura/mapa/planificacion'
import { colorRiesgo, ETIQUETA_HORIZONTE_MOTOR, ETIQUETA_NIVEL_RIESGO, type HorizonteMotor } from '@/lib/infraestructura/mapa/radar'
import { ETIQUETA_ESTADO_CLASES } from '@/lib/infraestructura/mapa/etiquetas'
import { SEVERIDADES } from '@/lib/infraestructura/validacion'
import { CLASES_LLUVIA, type MetaLluviaObservada } from '@/components/mapas/capa-lluvia-observada'
import type { ResumenEventosReportados } from '@/components/mapas/capa-eventos-reportados'
import { InsigniaLeyenda, type IdInsignia } from '@/lib/mapas/insignias-mapa'

type RegistroEventosLeyenda = Pick<ResumenEventosReportados, 'actualizadoAl'>

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

const ESTADOS_ALTURA_RIO: ReadonlyArray<{ id: IdInsignia; etiqueta: string }> = [
  { id: 'estacion-evacuacion', etiqueta: 'Evacuación' },
  { id: 'estacion-alerta', etiqueta: 'Alerta' },
  { id: 'estacion-normal', etiqueta: 'Normal' },
  { id: 'estacion-sin-dato', etiqueta: 'Sin dato' },
]

const CONFIANZA_EVENTOS: ReadonlyArray<{ id: IdInsignia; etiqueta: string }> = [
  { id: 'evento-alta', etiqueta: 'Confianza alta' },
  { id: 'evento-media', etiqueta: 'Confianza media' },
  { id: 'evento-baja', etiqueta: 'Confianza baja' },
]

const FORMATO_FECHA_REGISTRO = /^(\d{4})-(\d{2})-(\d{2})$/

function formatearFechaRegistro(fecha: string): string | null {
  const coincidencia = FORMATO_FECHA_REGISTRO.exec(fecha)
  if (!coincidencia) return null
  return `${coincidencia[3]}/${coincidencia[2]}`
}

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

function SituacionActual({ estacionesRio, eventosReportados, registro, lluviaObservada, abierta }: {
  abierta: boolean
  estacionesRio: boolean
  eventosReportados: boolean
  registro: RegistroEventosLeyenda | null | undefined
  lluviaObservada: MetaLluviaObservada | null
}) {
  const registroActualizado = registro?.actualizadoAl ? formatearFechaRegistro(registro.actualizadoAl) : null

  return (
    <details className="map-leyenda__seccion" open={abierta}>
      <summary className="map-leyenda__seccion-titulo">Situación actual</summary>
      <div className="map-leyenda__seccion-cuerpo">
        {estacionesRio && (
          <div className="map-leyenda__bloque">
            <b className="map-leyenda__subtitulo">Estaciones de Prefectura<NotaInfo texto="Sin dato también cuando la última lectura tiene más de 18 h." /></b>
            <ul className="map-leyenda__situacion">
              {ESTADOS_ALTURA_RIO.map(({ id, etiqueta }) => (
                <li className="map-leyenda__elemento" key={id}>
                  <InsigniaLeyenda id={id} tamano={22} />
                  <span>{etiqueta}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {eventosReportados && (
          <div className="map-leyenda__bloque">
            <b className="map-leyenda__subtitulo">Eventos reportados</b>
            <ul className="map-leyenda__situacion">
              {CONFIANZA_EVENTOS.map(({ id, etiqueta }) => (
                <li className="map-leyenda__elemento" key={id}>
                  <InsigniaLeyenda id={id} />
                  <span>{etiqueta}</span>
                </li>
              ))}
            </ul>
            {registroActualizado && <small className="muted">{`Registro actualizado al ${registroActualizado}`}</small>}
          </div>
        )}
        {lluviaObservada && <LeyendaLluviaObservada meta={lluviaObservada} />}
      </div>
    </details>
  )
}

function ReferenciasRiesgo({ props }: { props: PropsLeyendaMapa }) {
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

  if (props.pestana === 'planificacion') {
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
          {props.vista === 'inundacion' && (
            <li className="map-leyenda__elemento" key="junto-laguna">
              <span aria-hidden="true" className="map-leyenda__muestra" style={{ backgroundColor: COLOR_JUNTO_LAGUNA }} />
              <span>{ETIQUETA_JUNTO_LAGUNA}</span>
            </li>
          )}
        </ul>
      </>
    )
  }

  if (props.pestana === 'actual') {
    return (
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
    )
  }

  return null
}

export function LeyendaMapa(props: PropsLeyendaMapa & { estacionesRio?: boolean; eventosReportados?: boolean; resumenEventos?: RegistroEventosLeyenda | null; lluviaObservada?: MetaLluviaObservada | null }) {
  const estrecha = usePantallaEstrecha()
  const estacionesRio = Boolean(props.estacionesRio)
  const eventosReportados = Boolean(props.eventosReportados)
  const lluviaObservada = props.lluviaObservada ?? null
  const hayCapas = estacionesRio || eventosReportados || lluviaObservada !== null

  if (props.pestana === 'estadisticas' && !hayCapas) return null

  return (
    <aside className={`map-leyenda map-leyenda--${props.pestana}`} aria-label="Referencias del mapa">
      {hayCapas && (
        <SituacionActual
          // Fuera de "Situación actual" manda la escala de la pestaña: estas referencias quedan plegadas.
          abierta={!estrecha && (props.pestana === 'actual' || props.pestana === 'estadisticas')}
          estacionesRio={estacionesRio}
          eventosReportados={eventosReportados}
          registro={props.resumenEventos}
          lluviaObservada={lluviaObservada}
        />
      )}
      {props.pestana !== 'estadisticas' && (
        <details className="map-leyenda__seccion" open={!estrecha || props.pestana === 'radar' || props.pestana === 'planificacion'}>
          <summary className="map-leyenda__seccion-titulo">Riesgo / gravedad</summary>
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
              {ESTADOS_LEYENDA.map(({ Icono, etiqueta }) => (
                <li className="map-leyenda__elemento" key={etiqueta}>
                  <Icono aria-hidden="true" className="map-leyenda__icono" size={14} />
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
