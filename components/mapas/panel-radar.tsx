'use client'

import type { JSX } from 'react'
import { EscuelasEnRiesgo } from '@/components/mapas/escuelas-en-riesgo'
import { SelectorHorizonteMotor } from '@/components/mapas/selector-horizonte-motor'
import { Segmentado } from '@/components/mapas/segmentado'
import { AlertasSeccion } from '@/components/mapas/radar-meteo/alertas-seccion'
import { PronosticoResumen } from '@/components/mapas/radar-meteo/pronostico-resumen'
import { ETIQUETAS_VARIABLE_RADAR, VARIABLES_RADAR_UI, type VariableRadarUI } from '@/components/mapas/radar-meteo/selector'
import { useTextos } from '@/lib/i18n/idioma-provider'
import { pronosticoPorHorizonte } from '@/lib/infraestructura/radar-meteo/pronostico-horizonte'
import type { ResumenRadarMeteo } from '@/lib/infraestructura/radar-meteo/use-resumen-radar-meteo'
import type { EscuelaMapaEnriquecida } from '@/lib/infraestructura/mapa/tipos'
import type { HorizonteMotor } from '@/lib/infraestructura/mapa/radar'
import type { GrupoAlertaRadar } from '@/lib/infraestructura/radar-meteo/alertas-agrupadas'

export interface PanelRadarProps {
  horizonte: HorizonteMotor
  disponibles: HorizonteMotor[]
  onHorizonte: (horizonte: HorizonteMotor) => void
  variable: VariableRadarUI
  onVariable: (variable: VariableRadarUI) => void
  /**
   * Puntos del radar (todo el universo). null mientras no llegaron.
   * `nivelRiesgo` es la prioridad educativa; `nivelAmenaza` es la amenaza
   * sola (I-7), que se muestra aparte porque la prioridad la atenúa.
   */
  puntos: ReadonlyArray<{ cueAnexo: string; horizonteHoras: number; nivelRiesgo: string | null; nivelAmenaza?: string | null }> | null
  /** Escuelas del padrón con los filtros compartidos ya aplicados. */
  escuelas: EscuelaMapaEnriquecida[]
  cargando: boolean
  error: string | null
  onSeleccionar: (cueAnexo: string) => void
  alertas: {
    grupos: GrupoAlertaRadar[]
    cargando: boolean
    error: boolean
    claveSeleccionada: string | null
    onSeleccionar: (clave: string | null) => void
  }
  pronostico: {
    resumen: ResumenRadarMeteo | null
    cargando: boolean
    error: boolean
    departamentoId: string | null
    onDepartamento: (id: string | null) => void
  }
}


export function PanelRadar(props: PanelRadarProps): JSX.Element {
  const { horizonte, disponibles, onHorizonte, variable, onVariable, puntos, escuelas, cargando, error, onSeleccionar, alertas, pronostico } = props
  const t = useTextos()
  const etiquetaVariable = (valor: VariableRadarUI): string => {
    if (valor === 'lluvia') return t.radarResto.panel.lluvia
    if (valor === 'probabilidad') return t.radarResto.panel.probabilidad
    // Viento and Granizo read the same in Portuguese.
    return ETIQUETAS_VARIABLE_RADAR[valor]
  }
  const hayMotor = disponibles.length > 0
  const hayPronostico = pronostico.resumen !== null && !pronostico.resumen.sinDatos && pronostico.resumen.departamentos.length > 0
  const pronosticoHorizonte = hayPronostico && pronostico.resumen ? pronosticoPorHorizonte(pronostico.resumen, horizonte) : null

  return (
    <section className="map-sitact" aria-label="Radar" data-testid="panel-radar">
      <SelectorHorizonteMotor horizonte={horizonte} disponibles={disponibles} onHorizonte={onHorizonte} />

      <Segmentado
        etiqueta={t.radarResto.panel.variable}
        opciones={VARIABLES_RADAR_UI.map((valor) => ({ valor, etiqueta: etiquetaVariable(valor) }))}
        valor={variable}
        onChange={onVariable}
        columnas={2}
      />

      {hayMotor || cargando ? (
        // Lugar fijo: se reserva mientras carga el motor para que el bloque no
        // aparezca tarde y empuje el resto del panel. Es riesgo calculado
        // (probabilístico), distinto de los reportes de "Situación actual".
        <EscuelasEnRiesgo puntos={puntos} escuelas={escuelas} horizonte={horizonte} cargando={cargando} error={error} onSeleccionar={onSeleccionar} />
      ) : null}

      <AlertasSeccion {...alertas} />

      {pronosticoHorizonte ? (
        <PronosticoResumen pronostico={pronosticoHorizonte} horizonte={horizonte} runAt={pronostico.resumen?.runAt ?? null} departamentoId={pronostico.departamentoId} onDepartamento={pronostico.onDepartamento} />
      ) : pronostico.cargando || (cargando && !hayMotor) ? (
        <p role="status" className="map-sitact__vacio">{t.radarResto.pronostico.cargando}</p>
      ) : hayMotor ? null : error !== null && pronostico.error ? (
        <p role="status" className="map-sitact__vacio">{t.radarResto.pronostico.error}</p>
      ) : (
        <p className="map-sitact__vacio">{t.radarResto.pronostico.vacio}</p>
      )}
    </section>
  )
}
