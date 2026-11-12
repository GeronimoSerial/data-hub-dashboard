'use client'

import { ImpactoAlumnosResumen } from '@/components/infraestructura/impacto-alumnos-resumen'

import { useState, type ReactNode } from 'react'
import { BookMinus, BookX, Check, Clock, DoorOpen, House } from 'lucide-react'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { etiquetaDepartamento, ETIQUETA_ESTADO_CLASES } from '@/lib/infraestructura/mapa/etiquetas'
import { ordenarReportes, resumir } from '@/lib/infraestructura/mapa/agregar'
import { tiempoRelativo } from '@/lib/infraestructura/mapa/tiempo-relativo'
import { etiquetaApoyoMapa } from '@/lib/infraestructura/mapa/etiqueta-apoyo'
import { severidadDeGravedad } from '@/lib/infraestructura/mapa/gravedad'
import type { EscuelaMapaEnriquecida } from '@/lib/infraestructura/mapa/tipos'
import { detalleNivelOInstituto } from '@/lib/infraestructura/mapa/etiquetas'

/** " · " más el detalle de la escuela, o nada si no tiene. */
function textoDetalle(escuela: EscuelaMapaEnriquecida): string {
  const detalle = detalleNivelOInstituto(escuela)
  return detalle ? ` · ${detalle}` : ''
}

interface PanelSituacionActualProps {
  escuelas: EscuelaMapaEnriquecida[]
  actualizadoEn: string | null
  onSeleccionar: (cueAnexo: string) => void
  /** Extra sections rendered at the end of the panel (e.g. reported events). */
  secciones?: ReactNode
}

const FORMATO_HORA = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
})

const FORMATO_FECHA = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  day: 'numeric',
  month: 'short',
})

const FORMATO_NUMERO = new Intl.NumberFormat('es-AR')

type FiltroLista = 'todas' | 'sinClases' | 'sinActualizar'

const FILTROS_LISTA: { id: FiltroLista; etiqueta: string }[] = [
  { id: 'todas', etiqueta: 'Todas' },
  { id: 'sinClases', etiqueta: 'Sin clases' },
  { id: 'sinActualizar', etiqueta: 'Sin actualizar' },
]

function cumpleFiltro(escuela: EscuelaMapaEnriquecida, filtro: FiltroLista): boolean {
  if (filtro === 'sinClases') return escuela.clases !== 'normal'
  if (filtro === 'sinActualizar') return escuela.sinActualizar
  return true
}
export function horaActualizacion(iso: string, ahoraMs: number): string {
  const fecha = new Date(iso)
  if (!Number.isFinite(fecha.getTime())) return ''

  const hoy = new Date(ahoraMs).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
  const dia = fecha.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
  if (hoy === dia) return `Hoy ${FORMATO_HORA.format(fecha)}`
  // Shows today's date but keeps the last report date visible so stale data is not mistaken for current.
  return `Hoy ${FORMATO_FECHA.format(new Date(ahoraMs))} · último parte ${FORMATO_FECHA.format(fecha)}`
}

function IconoClases({ estado }: { estado: EscuelaMapaEnriquecida['clases'] }) {
  if (estado === 'sin') return <BookX aria-hidden="true" />
  if (estado === 'parcial') return <BookMinus aria-hidden="true" />
  if (estado === 'evacuado') return <DoorOpen aria-hidden="true" />
  if (estado === 'centro') return <House aria-hidden="true" />
  return null
}

function chipsEscuela(escuela: EscuelaMapaEnriquecida) {
  const apoyo = etiquetaApoyoMapa(escuela.clases, escuela.apoyo)
  return (
    <span className="map-sitact__chips">
      {escuela.clases !== 'normal' && (
        <span className="map-sitact__pill map-sitact__pill--clases">
          <IconoClases estado={escuela.clases} />
          {ETIQUETA_ESTADO_CLASES[escuela.clases]}
        </span>
      )}
      {apoyo && (
        <span className={`map-sitact__pill ${escuela.apoyo === 'no' ? 'map-sitact__pill--aviso' : escuela.apoyo === 'sin_dato' ? 'map-sitact__pill--neutro' : 'map-sitact__pill--apoyo'}`}>
          {apoyo}
        </span>
      )}
      {escuela.sinActualizar && (
        <span className="map-sitact__pill map-sitact__pill--neutro">
          <Clock aria-hidden="true" />
          Sin actualizar
        </span>
      )}
    </span>
  )
}

export function PanelSituacionActual({ escuelas, onSeleccionar, secciones }: PanelSituacionActualProps) {
  const [ahoraMs] = useState(() => Date.now())
  const [filtro, setFiltro] = useState<FiltroLista>('todas')
  const resumen = resumir(escuelas)
  const abiertas = ordenarReportes(escuelas).filter((escuela) => escuela.gravedad > 0 || (escuela.parte?.afectaciones.length ?? 0) > 0)
  const reportes = abiertas.filter((escuela) => cumpleFiltro(escuela, filtro))
  const solucionadasRecientes = escuelas
    .filter((escuela) => escuela.solucionadasRecientes > 0 && escuela.gravedad === 0 && !(escuela.parte?.afectaciones.length))
    .sort((a, b) => {
      if (a.ultimaNovedad === null && b.ultimaNovedad !== null) return 1
      if (a.ultimaNovedad !== null && b.ultimaNovedad === null) return -1
      if (a.ultimaNovedad !== b.ultimaNovedad) return (b.ultimaNovedad ?? '').localeCompare(a.ultimaNovedad ?? '')
      return a.nombre.localeCompare(b.nombre, 'es')
    })

  return (
    <section className="map-sitact" aria-label="Situación actual" data-testid="panel-situacion-actual">
      <div className="map-sitact__kpis" aria-label="Resumen de escuelas">
        <div className="map-sitact__kpi map-sitact__kpi--resaltado">
          <span>Escuelas sin clases</span>
          <strong>{FORMATO_NUMERO.format(resumen.sinClases)}</strong>
          <small>De {FORMATO_NUMERO.format(resumen.conReporte)} con situaciones abiertas</small>
        </div>
        <div className="map-sitact__kpi">
          <span>Alumnos sin clases</span>
          <strong>{FORMATO_NUMERO.format(resumen.alumnosSinClases)}</strong>
          <small>Sin clases presenciales</small>
        </div>
      </div>

      <dl className="map-sitact__secundarios">
        <div>
          <dt>Sin actualizar</dt>
          <dd>{FORMATO_NUMERO.format(resumen.sinActualizar)}</dd>
        </div>
        {resumen.sinClases > 0 && (
          <div className="map-sitact__apoyo">
            <dt>Con asistencia pedagógica</dt>
            <dd>{resumen.sinClasesConApoyo} de {resumen.sinClases}</dd>
            {resumen.sinClasesSinDato > 0 && <dd className="map-sitact__atenuado">{resumen.sinClasesSinDato} sin dato</dd>}
          </div>
        )}
      </dl>

      <section className="map-sitact__reportes" aria-labelledby="map-sitact-reportes-titulo">
        <h3 id="map-sitact-reportes-titulo" className="map-sitact__titulo-seccion">
          <span>Escuelas afectadas</span><span className="map-sitact__atenuado">{FORMATO_NUMERO.format(abiertas.length)} abiertas</span>
        </h3>
        {abiertas.length > 0 && (
          <div className="map-sitact__filtros" role="group" aria-label="Filtrar escuelas afectadas">
            {FILTROS_LISTA.map((opcion) => (
              <button
                key={opcion.id}
                type="button"
                className="map-sitact__filtro"
                aria-pressed={filtro === opcion.id}
                onClick={() => setFiltro(opcion.id)}
              >
                {opcion.etiqueta}
              </button>
            ))}
          </div>
        )}
        {reportes.length > 0 ? (
          <div className="map-sitact__lista">
            {reportes.map((escuela) => {
              const severidad = severidadDeGravedad(escuela.gravedad)
              const nivel = textoDetalle(escuela)
              const novedad = escuela.ultimaNovedad ? tiempoRelativo(escuela.ultimaNovedad, ahoraMs) : ''
              const departamento = etiquetaDepartamento(escuela.departamento)
              return (
                <button
                  key={escuela.cueAnexo}
                  type="button"
                  className="map-sitact__fila"
                  onClick={() => onSeleccionar(escuela.cueAnexo)}
                  aria-label={`${escuela.nombre}, ${departamento}${nivel}`}
                >
                  <span
                    className="map-sitact__franja"
                    style={severidad ? { backgroundColor: colorSeveridad(severidad) } : undefined}
                  />
                  <span className="map-sitact__contenido-fila">
                    <span className="map-sitact__nombre" title={escuela.nombre}>{escuela.nombre}</span>
                    <span className="map-sitact__meta-fila">
                      <span className="map-sitact__meta">{departamento}{nivel}</span>
                      {novedad && <span className="map-sitact__cuando">{novedad}</span>}
                    </span>
                    {escuela.impactoAlumnos && <span className="map-sitact__meta"><ImpactoAlumnosResumen impacto={escuela.impactoAlumnos} /></span>}
                    {chipsEscuela(escuela)}
                  </span>
                </button>
              )
            })}
          </div>
        ) : abiertas.length > 0 ? (
          <p className="map-sitact__vacio">Ninguna escuela afectada coincide con este filtro.</p>
        ) : solucionadasRecientes.length === 0 ? (
          <p className="map-sitact__vacio">Ninguna escuela con situaciones abiertas para estos filtros.</p>
        ) : null}
      </section>

      {solucionadasRecientes.length > 0 && (
        <details className="map-sitact__plegable">
          <summary className="map-sitact__titulo-seccion">
            <span>Solucionadas en los últimos 15 días</span>
            <span className="map-sitact__atenuado">{FORMATO_NUMERO.format(solucionadasRecientes.length)}</span>
          </summary>
          <div className="map-sitact__lista">
            {solucionadasRecientes.map((escuela) => {
              const nivel = textoDetalle(escuela)
              const departamento = etiquetaDepartamento(escuela.departamento)
              return (
                <button
                  key={escuela.cueAnexo}
                  type="button"
                  className="map-sitact__fila"
                  onClick={() => onSeleccionar(escuela.cueAnexo)}
                  aria-label={`${escuela.nombre}, ${departamento}${nivel}`}
                >
                  <span className="map-sitact__franja" aria-hidden="true" />
                  <span className="map-sitact__contenido-fila">
                    <span className="map-sitact__nombre" title={escuela.nombre}>{escuela.nombre}</span>
                    <span className="map-sitact__meta">{departamento}{nivel}</span>
                    <span className="map-sitact__chips">
                      <span className="map-sitact__pill map-sitact__pill--ok">
                        <Check aria-hidden="true" />Solucionada recientemente
                      </span>
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </details>
      )}

      {secciones}
    </section>
  )
}
