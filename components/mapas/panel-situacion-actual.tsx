'use client'

import { useState } from 'react'
import { BookMinus, BookX, Check, Clock, DoorOpen, House } from 'lucide-react'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { etiquetaDepartamento, ETIQUETA_ESTADO_CLASES } from '@/lib/infraestructura/mapa/etiquetas'
import { ordenarReportes, resumir } from '@/lib/infraestructura/mapa/agregar'
import { tiempoRelativo } from '@/lib/infraestructura/mapa/tiempo-relativo'
import { etiquetaApoyoMapa } from '@/lib/infraestructura/mapa/etiqueta-apoyo'
import { severidadDeGravedad } from '@/lib/infraestructura/mapa/gravedad'
import type { EscuelaMapaEnriquecida } from '@/lib/infraestructura/mapa/tipos'

interface PanelSituacionActualProps {
  escuelas: EscuelaMapaEnriquecida[]
  actualizadoEn: string | null
  onSeleccionar: (cueAnexo: string) => void
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
function horaActualizacion(iso: string, ahoraMs: number): string {
  const fecha = new Date(iso)
  if (!Number.isFinite(fecha.getTime())) return ''

  const hoy = new Date(ahoraMs).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
  const dia = fecha.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })
  return hoy === dia ? `Hoy ${FORMATO_HORA.format(fecha)}` : FORMATO_FECHA.format(fecha)
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

export function PanelSituacionActual({ escuelas, actualizadoEn, onSeleccionar }: PanelSituacionActualProps) {
  const [ahoraMs] = useState(() => Date.now())
  const resumen = resumir(escuelas)
  const reportes = ordenarReportes(escuelas).filter((escuela) => escuela.gravedad > 0)
  const solucionadasRecientes = escuelas
    .filter((escuela) => escuela.solucionadasRecientes > 0 && escuela.gravedad === 0)
    .sort((a, b) => {
      if (a.ultimaNovedad === null && b.ultimaNovedad !== null) return 1
      if (a.ultimaNovedad !== null && b.ultimaNovedad === null) return -1
      if (a.ultimaNovedad !== b.ultimaNovedad) return (b.ultimaNovedad ?? '').localeCompare(a.ultimaNovedad ?? '')
      return a.nombre.localeCompare(b.nombre, 'es')
    })
  const porcentajeApoyo = resumen.sinClases === 0
    ? 0
    : Math.round(resumen.sinClasesConApoyo / resumen.sinClases * 100)

  return (
    <section className="map-sitact" aria-labelledby="map-sitact-titulo">
      <header className="map-sitact__encabezado">
        <h2 id="map-sitact-titulo">Situación actual</h2>
        {actualizadoEn && horaActualizacion(actualizadoEn, ahoraMs) && (
          <time className="map-sitact__hora" dateTime={actualizadoEn}>{horaActualizacion(actualizadoEn, ahoraMs)}</time>
        )}
      </header>

      <div className="map-sitact__kpis" aria-label="Resumen de escuelas">
        <div className="map-sitact__kpi">
          <strong>{FORMATO_NUMERO.format(resumen.conReporte)}</strong>
          <span>Escuelas con situaciones abiertas</span>
        </div>
        <div className="map-sitact__kpi map-sitact__kpi--resaltado">
          <strong>{FORMATO_NUMERO.format(resumen.sinClases)}</strong>
          <span>Sin clases</span>
        </div>
        <div className="map-sitact__kpi">
          <strong>{FORMATO_NUMERO.format(resumen.alumnosSinClases)}</strong>
          <span>Alumnos sin clases</span>
        </div>
        <div className="map-sitact__kpi">
          <strong>{FORMATO_NUMERO.format(resumen.sinActualizar)}</strong>
          <span>Sin actualizar</span>
        </div>
        <div className="map-sitact__kpi">
          <strong>{FORMATO_NUMERO.format(resumen.solucionadasRecientes)}</strong>
          <span>Solucionadas en los últimos 15 días</span>
        </div>
      </div>

      {resumen.sinClases > 0 && (
        <div className="map-sitact__apoyo">
          <p><strong>{resumen.sinClasesConApoyo} de {resumen.sinClases}</strong> escuelas sin clases brindan asistencia pedagógica</p>
          <div className="map-sitact__barra" role="progressbar" aria-label="Escuelas sin clases que brindan asistencia pedagógica" aria-valuemin={0} aria-valuemax={resumen.sinClases} aria-valuenow={resumen.sinClasesConApoyo}>
            <span style={{ width: `${porcentajeApoyo}%` }} />
          </div>
          {resumen.sinClasesSinDato > 0 && <p>{resumen.sinClasesSinDato} sin dato</p>}
        </div>
      )}

      <section className="map-sitact__reportes" aria-labelledby="map-sitact-reportes-titulo">
        <h3 id="map-sitact-reportes-titulo" className="map-sitact__titulo-seccion">
          <span>Situaciones</span><span className="map-sitact__atenuado">por gravedad</span>
        </h3>
        {reportes.length > 0 ? (
          <div className="map-sitact__lista">
            {reportes.map((escuela) => {
              const severidad = severidadDeGravedad(escuela.gravedad)
              const nivel = escuela.niveles.length > 0 ? ` · ${escuela.niveles.join(', ')}` : ''
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
                    <span className="map-sitact__meta">{departamento}{nivel}</span>
                    {chipsEscuela(escuela)}
                  </span>
                  {novedad && <span className="map-sitact__cuando">{novedad}</span>}
                </button>
              )
            })}
          </div>
        ) : solucionadasRecientes.length === 0 ? (
          <p className="map-sitact__vacio">Ninguna escuela con situaciones abiertas para estos filtros.</p>
        ) : null}
      </section>

      {solucionadasRecientes.length > 0 && (
        <section className="map-sitact__reportes" aria-labelledby="map-sitact-solucionadas-titulo">
          <h3 id="map-sitact-solucionadas-titulo" className="map-sitact__titulo-seccion">
            Solucionadas en los últimos 15 días
          </h3>
          <div className="map-sitact__lista">
            {solucionadasRecientes.map((escuela) => {
              const nivel = escuela.niveles.length > 0 ? ` · ${escuela.niveles.join(', ')}` : ''
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
        </section>
      )}
    </section>
  )
}
