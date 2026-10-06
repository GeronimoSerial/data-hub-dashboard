'use client'

import type { JSX } from 'react'
import { Segmentado } from '@/components/mapas/segmentado'
import { etiquetaDepartamento } from '@/lib/infraestructura/mapa/etiquetas'
import {
  ETIQUETA_VISTA,
  prioridadPlanificacion,
  textoPrioridad,
  VISTAS_PLANIFICACION,
  colorNivelPlan,
} from '@/lib/infraestructura/mapa/planificacion'
import type { VistaPlanificacion } from '@/lib/infraestructura/mapa/planificacion'
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
}

export function PanelPlanificacion(props: PanelPlanificacionProps): JSX.Element {
  const { vista, onVista, escuelas, territorio, cargando, error, onSeleccionar } = props
  const dependeDelTerritorio = vista !== 'historial'
  const hayDatosVista = vista === 'aisladas'
    ? territorio?.aislamiento !== null && territorio?.aislamiento !== undefined
    : vista === 'inundacion'
      ? territorio?.susceptibilidad !== null && territorio?.susceptibilidad !== undefined
      : true
  const lista = prioridadPlanificacion(escuelas, vista, { territorio })

  return (
    <section className="map-sitact" aria-label="Planificación" data-testid="panel-planificacion">
      <Segmentado
        etiqueta="Vista"
        opciones={VISTAS_PLANIFICACION.map((valor) => ({ valor, etiqueta: ETIQUETA_VISTA[valor] }))}
        valor={vista}
        onChange={onVista}
      />

      {dependeDelTerritorio && cargando ? (
        <p role="status" className="map-sitact__vacio">Cargando datos…</p>
      ) : dependeDelTerritorio && error ? (
        <p role="status" className="map-sitact__vacio">No se pudieron cargar los datos de esta vista. Intente de nuevo más tarde.</p>
      ) : !hayDatosVista ? (
        <p className="map-sitact__vacio">Todavía no hay datos para esta vista.</p>
      ) : (
        <section aria-labelledby="map-planificacion-prioridad-titulo">
          <h3 id="map-planificacion-prioridad-titulo" className="map-sitact__titulo-seccion">Prioridad</h3>
          {lista.length > 0 ? (
            <div className="map-sitact__lista">
              {lista.map((item) => {
                const { escuela, nivel } = item
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
                    <span className="map-sitact__franja" style={{ backgroundColor: colorNivelPlan(nivel) }} />
                    <span className="map-sitact__contenido-fila">
                      <span className="map-sitact__nombre" title={escuela.nombre}>{escuela.nombre}</span>
                      <span className="map-sitact__meta">{departamento}{niveles}</span>
                    </span>
                    <span className="map-sitact__cuando">{textoPrioridad(item, vista)}</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="map-sitact__vacio">Ninguna escuela con prioridad para estos filtros.</p>
          )}
        </section>
      )}
    </section>
  )
}
