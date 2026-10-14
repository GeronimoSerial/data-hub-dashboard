import type { ItemEventoReportado, ResumenEventosReportados } from '@/components/mapas/capa-eventos-reportados'
import type { ResumenProvincial } from '@/lib/mapas/eventos-inundaciones'
import { InsigniaLeyenda, type IdInsignia } from '@/lib/mapas/insignias-mapa'

type Props = {
  resumen: ResumenEventosReportados | null
  onSeleccionar: (id: string) => void
  onResaltar: (id: string | null) => void
}

type Confianza = ItemEventoReportado['confianza']

/** Turns a YYYY-MM-DD string into dd/MM, or null when the value is missing or malformed. */
function diaMes(fecha: string | null | undefined): string | null {
  const coincidencia = /^\d{4}-(\d{2})-(\d{2})/.exec(fecha ?? '')
  return coincidencia ? `${coincidencia[2]}/${coincidencia[1]}` : null
}

function contarPorConfianza(eventos: ItemEventoReportado[]): Record<Confianza, number> {
  const conteo: Record<Confianza, number> = { alta: 0, media: 0, baja: 0 }
  for (const evento of eventos) {
    if (evento.confianza) conteo[evento.confianza] += 1
  }
  return conteo
}

function ResumenProvincialBloque({ entrada }: { entrada: ResumenProvincial }) {
  return (
    <div className="map-sitact__fila map-eventos__provincial">
      <div className="map-sitact__contenido-fila">
        <span className="map-sitact__nombre">{entrada.titulo}</span>
        {entrada.hechos[0] && <span className="map-sitact__meta">{entrada.hechos[0]}</span>}
        {entrada.fuentes.map((fuente) => (
          <a
            key={fuente.url}
            className="map-sitact__cuando"
            href={fuente.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {`Fuente: ${fuente.medio}, ${fuente.fecha}`}
          </a>
        ))}
      </div>
    </div>
  )
}

function FilaEvento({
  evento,
  onSeleccionar,
  onResaltar,
}: {
  evento: ItemEventoReportado
  onSeleccionar: (id: string) => void
  onResaltar: (id: string | null) => void
}) {
  const bloqueado = evento.noDeterminada
  const dia = diaMes(evento.fecha) ?? 'fecha sin informar'
  return (
    <button
      type="button"
      className="map-sitact__fila map-eventos__fila"
      aria-disabled={bloqueado ? 'true' : undefined}
      aria-label={`${evento.titulo}, ${evento.lugar}`}
      onClick={() => {
        if (!bloqueado) onSeleccionar(evento.id)
      }}
      onMouseEnter={() => onResaltar(evento.id)}
      onFocus={() => onResaltar(evento.id)}
      onMouseLeave={() => onResaltar(null)}
      onBlur={() => onResaltar(null)}
    >
      {evento.confianza && <InsigniaLeyenda id={`evento-${evento.confianza}` as IdInsignia} tamano={18} />}
      <span className="map-sitact__contenido-fila">
        <span className="map-sitact__nombre" title={evento.titulo}>{evento.titulo}</span>
        <span className="map-sitact__meta-fila">
          <span className="map-sitact__meta">{`${evento.lugar} · ${dia}`}</span>
          {evento.medio && <span className="map-sitact__cuando">{evento.medio}</span>}
        </span>
        {bloqueado && (
          <span className="map-sitact__chips">
            <span className="map-sitact__pill">Ubicación no determinada</span>
          </span>
        )}
      </span>
    </button>
  )
}

export function SeccionEventosReportados({ resumen, onSeleccionar, onResaltar }: Props) {
  if (!resumen) return null
  const conteo = contarPorConfianza(resumen.eventos)
  const registro = diaMes(resumen.actualizadoAl)

  return (
    <details className="map-sitact__reportes map-sitact__eventos">
      <summary>
        <h3 className="map-sitact__titulo-seccion">
          <span>Lo que informan los medios</span>
          <span className="map-sitact__atenuado">
            {`${conteo.alta} alta · ${conteo.media} media · ${conteo.baja} baja`}
            {registro && ` · registro al ${registro}`}
          </span>
        </h3>
      </summary>
      {resumen.resumenProvincial.length > 0 && (
        <>
          <p className="map-eventos__etiqueta">Resumen provincial</p>
          {resumen.resumenProvincial.map((entrada) => (
            <ResumenProvincialBloque key={entrada.id_evento} entrada={entrada} />
          ))}
        </>
      )}
      <p className="map-eventos__etiqueta">Eventos</p>
      <div className="map-sitact__lista map-eventos__lista">
        {resumen.eventos.map((evento) => (
          <FilaEvento
            key={evento.id}
            evento={evento}
            onSeleccionar={onSeleccionar}
            onResaltar={onResaltar}
          />
        ))}
      </div>
    </details>
  )
}
