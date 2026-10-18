'use client'

import type { JSX } from 'react'
import { EscuelasAisladas } from '@/components/mapas/escuelas-aisladas'
import { EscuelasEnRiesgo } from '@/components/mapas/escuelas-en-riesgo'
import { Segmentado } from '@/components/mapas/segmentado'
import { SelectorHorizonteMotor } from '@/components/mapas/selector-horizonte-motor'
import { etiquetaDepartamento } from '@/lib/infraestructura/mapa/etiquetas'
import {
  colorPrioridad,
  ETIQUETA_VISTA,
  prioridadPlanificacion,
  textoPrioridad,
  VISTAS_PLANIFICACION,
} from '@/lib/infraestructura/mapa/planificacion'
import type { VistaEstructural, VistaPlanificacion } from '@/lib/infraestructura/mapa/planificacion'
import type { HorizonteMotor } from '@/lib/infraestructura/mapa/radar'
import type { EscuelaMapaEnriquecida } from '@/lib/infraestructura/mapa/tipos'
import type { TerritorioMapa } from '@/lib/infraestructura/territorio-mapa'

export interface PanelPlanificacionProps {
  vista: VistaPlanificacion
  onVista: (vista: VistaPlanificacion) => void
  escuelas: EscuelaMapaEnriquecida[]
  territorio: TerritorioMapa | null
  cargando: boolean
  error: boolean
  onSeleccionar: (cueAnexo: string) => void
  /** Pronóstico del motor para Riesgo hoy (mismo snapshot que el Radar). */
  riesgo: {
    horizonte: HorizonteMotor
    disponibles: HorizonteMotor[]
    onHorizonte: (horizonte: HorizonteMotor) => void
    puntos: ReadonlyArray<{ cueAnexo: string; horizonteHoras: number; nivelRiesgo: string | null; nivelAmenaza?: string | null }> | null
    cargando: boolean
    error: string | null
  }
}

export function PanelPlanificacion(props: PanelPlanificacionProps): JSX.Element {
  const { vista, onVista, escuelas, riesgo, onSeleccionar } = props

  return (
    <section className="map-sitact" aria-label="Planificación" data-testid="panel-planificacion">
      <Segmentado
        etiqueta="Vista"
        opciones={VISTAS_PLANIFICACION.map((valor) => ({ valor, etiqueta: ETIQUETA_VISTA[valor] }))}
        valor={vista}
        onChange={onVista}
      />

      {vista === 'riesgo' ? (
        <>
          <SelectorHorizonteMotor horizonte={riesgo.horizonte} disponibles={riesgo.disponibles} onHorizonte={riesgo.onHorizonte} />
          {!riesgo.cargando && !riesgo.error && riesgo.disponibles.length === 0 ? (
            <p className="map-sitact__vacio">Todavía no hay un pronóstico disponible. Vuelva a consultar más tarde.</p>
          ) : (
            <EscuelasEnRiesgo
              puntos={riesgo.puntos}
              escuelas={escuelas}
              horizonte={riesgo.horizonte}
              cargando={riesgo.cargando}
              error={riesgo.error}
              onSeleccionar={onSeleccionar}
            />
          )}
        </>
      ) : (
        <PrioridadEstructural {...props} vista={vista} />
      )}
    </section>
  )
}

function PrioridadEstructural(props: Omit<PanelPlanificacionProps, 'vista'> & { vista: VistaEstructural }): JSX.Element {
  const { vista, escuelas, territorio, cargando, error, onSeleccionar } = props
  const dependeDelTerritorio = vista === 'aisladas'
  const hayDatosVista = vista === 'aisladas'
    ? territorio?.aislamiento !== null && territorio?.aislamiento !== undefined
    : true
  const lista = prioridadPlanificacion(escuelas, vista, { territorio })

  return dependeDelTerritorio && cargando ? (
    <p role="status" className="map-sitact__vacio">Cargando datos…</p>
  ) : dependeDelTerritorio && error ? (
    <p role="status" className="map-sitact__vacio">No se pudieron cargar los datos de esta vista. Intente de nuevo más tarde.</p>
  ) : !hayDatosVista ? (
    <p className="map-sitact__vacio">Todavía no hay datos para esta vista.</p>
  ) : vista === 'aisladas' && territorio ? (
    <EscuelasAisladas escuelas={escuelas} territorio={territorio} onSeleccionar={onSeleccionar} />
  ) : (
    <section aria-labelledby="map-planificacion-prioridad-titulo">
      <h3 id="map-planificacion-prioridad-titulo" className="map-sitact__titulo-seccion">Prioridad de planificación (exposición estructural)</h3>
      {lista.length > 0 ? (
        <div className="map-sitact__lista">
          {lista.map((item) => {
            const { escuela } = item
            const departamento = etiquetaDepartamento(escuela.departamento)
            const niveles = escuela.niveles.length > 0 ? ` · ${escuela.niveles.join(', ')}` : ''
            return (
              <button
                key={escuela.cueAnexo}
                type="button"
                className="map-sitact__fila"
                onClick={() => onSeleccionar(escuela.cueAnexo)}
                aria-label={`${escuela.nombre}, ${departamento}`}
              >
                <span className="map-sitact__franja" style={{ backgroundColor: colorPrioridad(item) }} />
                <span className="map-sitact__contenido-fila">
                  <span className="map-sitact__nombre" title={escuela.nombre}>{escuela.nombre}</span>
                  <span className="map-sitact__meta">{departamento}{niveles}</span>
                </span>
                <span className="map-sitact__cuando">{textoPrioridad(item, vista)}</span>
              </button>
            )
          })}
        </div>
      ) : vista === 'historial' ? (
        <p className="map-sitact__vacio">Todavía no hay situaciones registradas para estos filtros.</p>
      ) : (
        <p className="map-sitact__vacio">Ninguna escuela con prioridad para estos filtros.</p>
      )}
    </section>
  )
}
