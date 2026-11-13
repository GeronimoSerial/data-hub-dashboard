// Public view of the daily verdict, for non technical readers. No 'use client':
// safe to render on the server. Same reading as the modal: headline, one line
// per department ordered by severity, quiet departments in one line.
import { textosActuales } from '@/lib/i18n'
import { marcaActual } from '@/lib/infraestructura/region/publica'
import type { DtoVeredicto } from '@/lib/infraestructura/veredicto/dto'
import type { EventoTerreno } from '@/lib/infraestructura/veredicto/eventos-terreno'
import { etiquetaNivel, nombreDepartamento } from '@/lib/infraestructura/veredicto/niveles'
import { lecturaDelDia } from '@/lib/infraestructura/veredicto/resumen'

const ETIQUETA_TIPO_DIA: Record<string, string> = {
  observado: 'Observado',
  hoy: 'Hoy',
  pronostico: 'Pronóstico',
}

function fechaCorta(fecha: string): string {
  const [, mes, dia] = fecha.split('-')
  return `${dia}/${mes}`
}

function Dia({ fecha, delDia, eventos }: { fecha: string; delDia: DtoVeredicto[]; eventos: EventoTerreno[] }) {
  const { provincia, titular, lineas, sinNovedad } = lecturaDelDia(delDia)
  const tipo = provincia?.tipoDia ?? delDia[0]?.tipoDia ?? ''
  return (
    <section className="veredicto-publico__dia">
      <header className="veredicto-dia__encabezado">
        <h2>
          {fechaCorta(fecha)} — {ETIQUETA_TIPO_DIA[tipo] ?? tipo}
        </h2>
        {provincia ? <span className="veredicto-publico__nivel">{etiquetaNivel(provincia.nivel)}</span> : null}
      </header>
      {titular ? <p className="veredicto-dia__titular">{titular}</p> : null}
      {lineas.length > 0 ? (
        <ul className="veredicto-lineas">
          {lineas.map((linea) => (
            <li key={linea.veredicto.id} className="veredicto-linea" data-nivel={linea.veredicto.nivel}>
              <div className="veredicto-linea__cabeza">
                <strong>{linea.nombre}</strong>
                <span className="veredicto-publico__nivel">{etiquetaNivel(linea.veredicto.nivel)}</span>
              </div>
              <p className="veredicto-linea__texto">{linea.texto}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {sinNovedad.length > 0 ? (
        <p className="veredicto-dia__quietos">
          {lineas.length === 0 ? 'Sin novedades en ningún departamento.' : `Sin novedades: ${sinNovedad.join(', ')}.`}
        </p>
      ) : null}
      {eventos.length > 0 ? (
        <div className="veredicto-seccion">
          <h3>Confirmado en terreno</h3>
          <ul>
            {eventos.map((e) => (
              <li key={e.id} className="veredicto-evento">
                <strong>{e.titulo}</strong>
                <span>
                  {e.lugar} ({nombreDepartamento(e.departamento)}) · {e.fechaTexto} · {e.confianzaTexto}
                </span>
                <a href={e.fuente.url} target="_blank" rel="noopener noreferrer">
                  {e.fuente.medio}
                  {e.fuente.fecha ? `, ${e.fuente.fecha}` : ''}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

export function VeredictoPublico({
  veredictos,
  eventos = [],
}: {
  veredictos: DtoVeredicto[]
  eventos?: EventoTerreno[]
}) {
  const porFecha = new Map<string, DtoVeredicto[]>()
  for (const v of veredictos) {
    porFecha.set(v.fecha, [...(porFecha.get(v.fecha) ?? []), v])
  }
  const fechas = [...porFecha.keys()].sort()
  const enCalibracion = veredictos.some((v) => v.enCalibracion)

  return (
    <article className="veredicto-publico">
      <div className="veredicto-publico__contenido">
        <h1>{textosActuales().shellHub.meta.tituloVeredicto(marcaActual().jurisdiccionLineas[0] ?? '')}</h1>
        <p className="veredicto-publico__aviso" role="note">
          No es un aviso oficial. Consulte al SMN, a Prefectura Naval y a Defensa Civil.
        </p>
        {veredictos.some((v) => v.fuente === 'ia') && (
          <p className="veredicto-procedencia">Resúmenes generados con IA · pueden contener errores</p>
        )}
        {enCalibracion && (
          <p className="veredicto-procedencia">En calibración: los criterios de este veredicto todavía se están ajustando.</p>
        )}

        {fechas.map((fecha) => (
          <Dia
            key={fecha}
            fecha={fecha}
            delDia={porFecha.get(fecha) ?? []}
            eventos={eventos.filter((e) => e.fecha === fecha)}
          />
        ))}
      </div>
    </article>
  )
}
