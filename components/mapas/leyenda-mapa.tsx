'use client'

import { useState } from 'react'
import { BookMinus, BookX, Check, ChevronDown, ChevronUp, Clock, DoorOpen, House } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { COLOR_JUNTO_LAGUNA, colorNivelPlan, ETIQUETA_JUNTO_LAGUNA, ETIQUETA_NIVEL_PLAN, nivelesLeyendaPlanificacion, TITULO_LEYENDA_VISTA, type VistaPlanificacion } from '@/lib/infraestructura/mapa/planificacion'
import { colorRiesgo, ETIQUETA_HORIZONTE_MOTOR, ETIQUETA_NIVEL_RIESGO, type HorizonteMotor } from '@/lib/infraestructura/mapa/radar'
import { ETIQUETA_ESTADO_CLASES } from '@/lib/infraestructura/mapa/etiquetas'
import { SEVERIDADES } from '@/lib/infraestructura/validacion'
import { CLASES_LLUVIA, type MetaLluviaObservada } from '@/components/mapas/capa-lluvia-observada'
import type { ResumenEventosReportados } from '@/components/mapas/capa-eventos-reportados'
import { InsigniaLeyenda, type IdInsignia } from '@/lib/mapas/insignias-mapa'

type ResumenEventosLeyenda = Pick<ResumenEventosReportados, 'resumenProvincial' | 'sinUbicacionPrecisa' | 'actualizadoAl'>

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

function LeyendaAlturaRios() {
  return (
    <aside className="map-leyenda" aria-label="Altura de ríos">
      <b className="map-leyenda__titulo">Estaciones de Prefectura</b>
      <ul className="map-leyenda__fila">
        {ESTADOS_ALTURA_RIO.map(({ id, etiqueta }) => (
          <li className="map-leyenda__elemento" key={id}>
            <InsigniaLeyenda id={id} tamano={22} />
            <span>{etiqueta}</span>
          </li>
        ))}
      </ul>
      <small className="muted">Sin dato también cuando la última lectura tiene más de 12 h.</small>
    </aside>
  )
}

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

function LeyendaEventosReportados({ resumen }: { resumen?: ResumenEventosLeyenda | null }) {
  const resumenProvincial = resumen?.resumenProvincial ?? []
  const sinUbicacionPrecisa = resumen?.sinUbicacionPrecisa ?? []
  const registroActualizado = resumen?.actualizadoAl ? formatearFechaRegistro(resumen.actualizadoAl) : null

  return (
    <aside className="map-leyenda" aria-label="Eventos reportados">
      <b className="map-leyenda__titulo">Eventos reportados</b>
      <ul className="map-leyenda__fila">
        {CONFIANZA_EVENTOS.map(({ id, etiqueta }) => (
          <li className="map-leyenda__elemento" key={id}>
            <InsigniaLeyenda id={id} />
            <span>{etiqueta}</span>
          </li>
        ))}
      </ul>
      {registroActualizado && <small className="muted">{`Registro actualizado al ${registroActualizado}`}</small>}
      {resumenProvincial.length > 0 && (
        <section className="map-leyenda__resumen">
          <b className="map-leyenda__subtitulo">Resumen provincial</b>
          <ul>
            {resumenProvincial.map((evento) => {
              const fuente = evento.fuentes[0]
              return (
                <li key={evento.id_evento}>
                  <span>{evento.titulo}</span>
                  {evento.hechos[0] && <small>{evento.hechos[0]}</small>}
                  {fuente && (
                    <small>
                      <a href={fuente.url} target="_blank" rel="noopener noreferrer">{fuente.medio}</a>
                    </small>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}
      {sinUbicacionPrecisa.length > 0 && (
        <small>{`Sin ubicación precisa: ${sinUbicacionPrecisa.map((lugar) => lugar.lugar).join(', ')}`}</small>
      )}
    </aside>
  )
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
    <aside className="map-leyenda" aria-label="Lluvia observada">
      <b className="map-leyenda__titulo">Lluvia observada {meta.horas} h (satélite IMERG)</b>
      <ul className="map-leyenda__fila">
        {CLASES_LLUVIA.map((clase) => (
          <li className="map-leyenda__elemento" key={clase.desde}>
            <span aria-hidden="true" className="map-leyenda__muestra" style={{ backgroundColor: clase.color }} />
            <span>{clase.etiqueta}</span>
          </li>
        ))}
      </ul>
      <small>Hasta: {hasta ?? 'Sin dato'}</small>
      {meta.vencida && <small className="map-leyenda__aviso">{`Datos desactualizados: última observación ${hasta ?? 'sin dato'}.`}</small>}
      <small>Estimación satelital, no medición en tierra. Hacé clic en el mapa para ver el valor.</small>
      {meta.parciales > 0 && <small>{meta.parciales} celdas con ventana incompleta (ver detalle al hacer clic)</small>}
    </aside>
  )
}

export function LeyendaMapa(props: PropsLeyendaMapa & { estacionesRio?: boolean; eventosReportados?: boolean; resumenEventos?: ResumenEventosLeyenda | null; lluviaObservada?: MetaLluviaObservada | null }) {
  return (
    <>
      {props.estacionesRio && <LeyendaAlturaRios />}
      {props.eventosReportados && <LeyendaEventosReportados resumen={props.resumenEventos} />}
      {props.lluviaObservada && <LeyendaLluviaObservada meta={props.lluviaObservada} />}
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
