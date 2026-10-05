'use client'

import { useState } from 'react'
import { BookMinus, BookX, Clock, DoorOpen, House } from 'lucide-react'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { etiquetaDepartamento, ETIQUETA_CLASES } from '@/lib/infraestructura/mapa/etiquetas'
import { ordenarReportes, resumir } from '@/lib/infraestructura/mapa/agregar'
import { tiempoRelativo } from '@/lib/infraestructura/mapa/tiempo-relativo'
import { etiquetaApoyoMapa } from '@/lib/infraestructura/mapa/etiqueta-apoyo'
import type { EscuelaMapaEnriquecida, GravedadMapa } from '@/lib/infraestructura/mapa/tipos'

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
const NOMBRE_SEVERIDAD: Record<GravedadMapa, string> = {
  0: '',
  1: 'Baja',
  2: 'Media',
  3: 'Alta',
  4: 'Crítica',
}

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
          {ETIQUETA_CLASES[escuela.clases]}
        </span>
      )}
      {apoyo && (
        <span className={`map-sitact__pill ${escuela.apoyo === 'no' ? 'map-sitact__pill--aviso' : 'map-sitact__pill--apoyo'}`}>
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
          <span>Escuelas con reporte</span>
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
      </div>

      {resumen.sinClases > 0 && (
        <div className="map-sitact__apoyo">
          <p><strong>{resumen.sinClasesConApoyo} de {resumen.sinClases}</strong> escuelas sin clases brindan apoyo pedagógico</p>
          <div className="map-sitact__barra" role="progressbar" aria-label="Escuelas sin clases que brindan apoyo pedagógico" aria-valuemin={0} aria-valuemax={resumen.sinClases} aria-valuenow={resumen.sinClasesConApoyo}>
            <span style={{ width: `${porcentajeApoyo}%` }} />
          </div>
        </div>
      )}

      <section className="map-sitact__reportes" aria-labelledby="map-sitact-reportes-titulo">
        <h3 id="map-sitact-reportes-titulo" className="map-sitact__titulo-seccion">
          <span>Reportes</span><span className="map-sitact__atenuado">por gravedad</span>
        </h3>
        {reportes.length > 0 ? (
          <div className="map-sitact__lista">
            {reportes.map((escuela) => {
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
                  <span className="map-sitact__franja" style={{ backgroundColor: colorSeveridad(NOMBRE_SEVERIDAD[escuela.gravedad]) }} />
                  <span className="map-sitact__contenido-fila">
                    <span className="map-sitact__nombre">{escuela.nombre}</span>
                    <span className="map-sitact__meta">{departamento}{nivel}</span>
                    {chipsEscuela(escuela)}
                  </span>
                  {novedad && <span className="map-sitact__cuando">{novedad}</span>}
                </button>
              )
            })}
          </div>
        ) : (
          <p className="map-sitact__vacio">Ninguna escuela con reporte para estos filtros.</p>
        )}
      </section>
    </section>
  )
}
