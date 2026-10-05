'use client'

import type { JSX } from 'react'
import { Segmentado } from '@/components/mapas/segmentado'
import { ETIQUETAS_VARIABLE_RADAR, VARIABLES_RADAR_UI, type VariableRadarUI } from '@/components/mapas/radar-meteo/selector'
import { etiquetaDepartamento } from '@/lib/infraestructura/mapa/etiquetas'
import {
  colorRiesgo,
  escuelasPorRiesgo,
  ETIQUETA_HORIZONTE_MOTOR,
  ETIQUETA_NIVEL_RIESGO,
  resumirRiesgo,
} from '@/lib/infraestructura/mapa/radar'
import type { EscuelaMapaEnriquecida } from '@/lib/infraestructura/mapa/tipos'
import type { HorizonteMotor } from '@/lib/infraestructura/mapa/radar'

export interface PanelRadarProps {
  horizonte: HorizonteMotor
  disponibles: HorizonteMotor[]
  onHorizonte: (horizonte: HorizonteMotor) => void
  variable: VariableRadarUI
  onVariable: (variable: VariableRadarUI) => void
  /** Puntos del radar (todo el universo). null mientras no llegaron. */
  puntos: ReadonlyArray<{ cueAnexo: string; horizonteHoras: number; nivelRiesgo: string | null }> | null
  /** Escuelas del padrón con los filtros compartidos ya aplicados. */
  escuelas: EscuelaMapaEnriquecida[]
  cargando: boolean
  error: string | null
  onSeleccionar: (cueAnexo: string) => void
}

const FORMATO_NUMERO = new Intl.NumberFormat('es-AR')
const HORIZONTES: HorizonteMotor[] = [24, 72, 240]

export function PanelRadar(props: PanelRadarProps): JSX.Element {
  const { horizonte, disponibles, onHorizonte, variable, onVariable, puntos, escuelas, cargando, error, onSeleccionar } = props
  const opciones = HORIZONTES.map((valor) => ({
    valor,
    etiqueta: ETIQUETA_HORIZONTE_MOTOR[valor],
    deshabilitada: !disponibles.includes(valor),
    titulo: 'Sin datos para este horizonte',
  }))
  const lista = puntos === null ? [] : escuelasPorRiesgo(puntos, escuelas, horizonte)
    .filter(({ nivel }) => nivel === 'muy_alto' || nivel === 'alto' || nivel === 'moderado')
  const resumen = resumirRiesgo(lista)
  const sinPronostico = disponibles.length === 0

  return (
    <section className="map-sitact" aria-labelledby="map-radar-titulo" data-testid="panel-radar">
      <header className="map-sitact__encabezado">
        <h2 id="map-radar-titulo">Radar</h2>
        <span className="map-sitact__hora">Pronóstico</span>
      </header>

      <Segmentado
        etiqueta="Horizonte"
        opciones={opciones}
        valor={horizonte}
        onChange={onHorizonte}
      />

      <Segmentado
        etiqueta="Variable meteorológica"
        opciones={VARIABLES_RADAR_UI.map((valor) => ({ valor, etiqueta: ETIQUETAS_VARIABLE_RADAR[valor] }))}
        valor={variable}
        onChange={onVariable}
      />

      {cargando ? (
        <p role="status" className="map-sitact__vacio">Cargando pronóstico…</p>
      ) : error ? (
        <p role="status" className="map-sitact__vacio">No se pudo cargar el pronóstico. Intente de nuevo más tarde.</p>
      ) : sinPronostico ? (
        <p className="map-sitact__vacio">Todavía no hay un pronóstico disponible. Vuelva a consultar más tarde.</p>
      ) : (
        <>
          <div className="map-sitact__kpis" aria-label="Resumen de riesgo">
            <div className="map-sitact__kpi map-sitact__kpi--resaltado">
              <strong>{FORMATO_NUMERO.format(resumen.escuelasAltas)}</strong>
              <span>Riesgo alto o muy alto</span>
            </div>
            <div className="map-sitact__kpi">
              <strong>{FORMATO_NUMERO.format(resumen.alumnosAltos)}</strong>
              <span>Alumnos en esas escuelas</span>
            </div>
          </div>

          <section aria-labelledby="map-radar-riesgo-titulo">
            <h3 id="map-radar-riesgo-titulo" className="map-sitact__titulo-seccion">Escuelas en riesgo</h3>
            {lista.length > 0 ? (
              <div className="map-sitact__lista">
                {lista.map(({ escuela, nivel }) => {
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
                      <span className="map-sitact__franja" style={{ backgroundColor: colorRiesgo(nivel) }} />
                      <span className="map-sitact__contenido-fila">
                        <span className="map-sitact__nombre" title={escuela.nombre}>{escuela.nombre}</span>
                        <span className="map-sitact__meta">{departamento}{niveles}</span>
                      </span>
                      <span className="map-sitact__cuando">{ETIQUETA_NIVEL_RIESGO[nivel]}</span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="map-sitact__vacio">Ninguna escuela en riesgo para estos filtros.</p>
            )}
          </section>
        </>
      )}
    </section>
  )
}
