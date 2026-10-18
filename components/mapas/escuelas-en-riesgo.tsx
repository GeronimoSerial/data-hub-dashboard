'use client'

import { useState, type JSX } from 'react'
import { etiquetaDepartamento } from '@/lib/infraestructura/mapa/etiquetas'
import {
  colorRiesgo,
  escuelasEnRadar,
  ETIQUETA_NIVEL_CLIMA,
  ETIQUETA_NIVEL_RIESGO,
  ETIQUETA_NIVEL_VULNERABILIDAD,
  resumirRiesgo,
} from '@/lib/infraestructura/mapa/radar'
import type { HorizonteMotor } from '@/lib/infraestructura/mapa/radar'
import type { EscuelaMapaEnriquecida } from '@/lib/infraestructura/mapa/tipos'

export interface EscuelasEnRiesgoProps {
  puntos: ReadonlyArray<{ cueAnexo: string; horizonteHoras: number; nivelRiesgo: string | null; nivelAmenaza?: string | null }> | null
  escuelas: EscuelaMapaEnriquecida[]
  horizonte: HorizonteMotor
  cargando: boolean
  error: string | null
  onSeleccionar: (cueAnexo: string) => void
}

const FORMATO_NUMERO = new Intl.NumberFormat('es-AR')
// La lista arranca corta para que "Alertas del SMN" quede a la vista sin scroll.
const ESCUELAS_VISIBLES = 3
const NIVELES_RESUMEN = ['muy_alto', 'alto', 'moderado'] as const

/** Riesgo calculado por el motor (probabilístico) para el horizonte elegido. */
export function EscuelasEnRiesgo(props: EscuelasEnRiesgoProps): JSX.Element {
  const { puntos, escuelas, horizonte, cargando, error, onSeleccionar } = props
  // Prioridad moderada o más, o amenaza alta/muy alta aunque la prioridad sea
  // baja: misma regla que colorea la capa del mapa (`escuelasEnRadar`).
  // Amenaza null = sin dato: no se muestra.
  const lista = puntos === null ? [] : escuelasEnRadar(puntos, escuelas, horizonte)
  const resumen = resumirRiesgo(lista)
  const [verTodas, setVerTodas] = useState(false)
  const listaVisible = verTodas ? lista : lista.slice(0, ESCUELAS_VISIBLES)

  return (
    <section aria-labelledby="map-radar-riesgo-titulo" className="map-radar-riesgo">
      <h3 id="map-radar-riesgo-titulo" className="map-sitact__titulo-seccion">Riesgo calculado (probabilístico)</h3>
      {cargando ? (
        <p role="status" className="map-sitact__vacio map-radar-riesgo__reserva">Calculando riesgo…</p>
      ) : error ? (
        <p role="status" className="map-sitact__vacio">No se pudo cargar el pronóstico. Intente de nuevo más tarde.</p>
      ) : (
        <>
          <div className="map-sitact__kpis" aria-label="Resumen de riesgo">
            <div className="map-sitact__kpi map-sitact__kpi--resaltado">
              <strong>{FORMATO_NUMERO.format(resumen.escuelas)}</strong>
              <span>Escuelas en riesgo</span>
            </div>
            <div className="map-sitact__kpi">
              <strong>{FORMATO_NUMERO.format(resumen.alumnos)}</strong>
              <span>Alumnos en esas escuelas</span>
            </div>
          </div>
          {resumen.escuelas > 0 && (
            <p className="map-radar-riesgo__desglose">
              {NIVELES_RESUMEN.filter((nivel) => resumen.porNivel[nivel] > 0).map((nivel) => `${FORMATO_NUMERO.format(resumen.porNivel[nivel])} ${ETIQUETA_NIVEL_RIESGO[nivel].toLowerCase()}`).join(' · ')}
            </p>
          )}
          {lista.length > 0 ? (
            <div className="map-sitact__lista">
              {listaVisible.map(({ escuela, nivel, amenaza, vulnerabilidad }) => {
                const departamento = etiquetaDepartamento(escuela.departamento)
                const niveles = escuela.niveles.length > 0 ? ` · ${escuela.niveles.join(', ')}` : ''
                const motivo = [
                  amenaza && `Clima: ${ETIQUETA_NIVEL_CLIMA[amenaza]}`,
                  vulnerabilidad && `Vulnerabilidad: ${ETIQUETA_NIVEL_VULNERABILIDAD[vulnerabilidad]}`,
                ].filter(Boolean).join(' · ')
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
                      <span className="map-sitact__chips">
                        <span className="map-sitact__pill map-sitact__pill--neutro">Riesgo {ETIQUETA_NIVEL_RIESGO[nivel].toLowerCase()}</span>
                      </span>
                      {motivo && <span className="map-sitact__meta map-radar-riesgo__motivo">{motivo}</span>}
                    </span>
                  </button>
                )
              })}
              {lista.length > ESCUELAS_VISIBLES && (
                <button type="button" className="map-radar-riesgo__ver-mas" aria-expanded={verTodas} onClick={() => setVerTodas((valor) => !valor)}>
                  {verTodas ? 'Ver menos' : `Ver más (${lista.length - ESCUELAS_VISIBLES})`}
                </button>
              )}
            </div>
          ) : (
            <p className="map-sitact__vacio map-sitact__vacio--linea">Ninguna escuela en riesgo para estos filtros.</p>
          )}
        </>
      )}
    </section>
  )
}
