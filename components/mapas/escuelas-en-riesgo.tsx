'use client'

import { useMemo, useState, type JSX } from 'react'
import { detalleNivelOInstituto, etiquetaDepartamento } from '@/lib/infraestructura/mapa/etiquetas'
import {
  colorRiesgo,
  escuelasEnRadar,
  ETIQUETA_NIVEL_CLIMA,
  ETIQUETA_NIVEL_VULNERABILIDAD,
  etiquetaNivelRiesgo,
  resumirRiesgo,
} from '@/lib/infraestructura/mapa/radar'
import type { HorizonteMotor } from '@/lib/infraestructura/mapa/radar'
import type { EscuelaMapaEnriquecida } from '@/lib/infraestructura/mapa/tipos'
import { useIdioma, useTextos } from '@/lib/i18n/idioma-provider'
import { localeNumero } from '@/lib/i18n/formato-numero'

export interface EscuelasEnRiesgoProps {
  puntos: ReadonlyArray<{ cueAnexo: string; horizonteHoras: number; nivelRiesgo: string | null; nivelAmenaza?: string | null }> | null
  escuelas: EscuelaMapaEnriquecida[]
  horizonte: HorizonteMotor
  cargando: boolean
  error: string | null
  onSeleccionar: (cueAnexo: string) => void
}

// La lista arranca corta para que "Alertas del SMN" quede a la vista sin scroll.
const ESCUELAS_VISIBLES = 3
const NIVELES_RESUMEN = ['muy_alto', 'alto', 'moderado'] as const

/** Riesgo calculado por el motor (probabilístico) para el horizonte elegido. */
export function EscuelasEnRiesgo(props: EscuelasEnRiesgoProps): JSX.Element {
  const { puntos, escuelas, horizonte, cargando, error, onSeleccionar } = props
  const dict = useTextos()
  const idioma = useIdioma()
  const FORMATO_NUMERO = useMemo(() => new Intl.NumberFormat(localeNumero(idioma)), [idioma])
  const t = dict.controles.riesgo
  // Prioridad moderada o más, o amenaza alta/muy alta aunque la prioridad sea
  // baja: misma regla que colorea la capa del mapa (`escuelasEnRadar`).
  // Amenaza null = sin dato: no se muestra.
  const lista = puntos === null ? [] : escuelasEnRadar(puntos, escuelas, horizonte)
  const resumen = resumirRiesgo(lista)
  const [verTodas, setVerTodas] = useState(false)
  const listaVisible = verTodas ? lista : lista.slice(0, ESCUELAS_VISIBLES)

  return (
    <section aria-labelledby="map-radar-riesgo-titulo" className="map-radar-riesgo" data-testid="escuelas-en-riesgo">
      <h3 id="map-radar-riesgo-titulo" className="map-sitact__titulo-seccion">{t.titulo}</h3>
      {cargando ? (
        <p role="status" className="map-sitact__vacio map-radar-riesgo__reserva">{t.calculando}</p>
      ) : error ? (
        <p role="status" className="map-sitact__vacio">{t.error}</p>
      ) : (
        <>
          <div className="map-sitact__kpis" aria-label={t.resumen}>
            <div className="map-sitact__kpi map-sitact__kpi--resaltado">
              <strong data-testid="escuelas-en-riesgo-total">{FORMATO_NUMERO.format(resumen.escuelas)}</strong>
              <span>{t.escuelas}</span>
            </div>
            <div className="map-sitact__kpi">
              <strong>{FORMATO_NUMERO.format(resumen.alumnos)}</strong>
              <span>{t.alumnos}</span>
            </div>
          </div>
          {resumen.escuelas > 0 && (
            <p className="map-radar-riesgo__desglose" data-testid="escuelas-en-riesgo-desglose">
              {NIVELES_RESUMEN.filter((nivel) => resumen.porNivel[nivel] > 0).map((nivel) => `${FORMATO_NUMERO.format(resumen.porNivel[nivel])} ${etiquetaNivelRiesgo(dict, nivel).toLowerCase()}`).join(' · ')}
            </p>
          )}
          {lista.length > 0 ? (
            <div className="map-sitact__lista">
              {listaVisible.map(({ escuela, nivel, amenaza, vulnerabilidad }) => {
                const departamento = etiquetaDepartamento(escuela.departamento)
                const detalle = detalleNivelOInstituto(escuela, dict)
                const niveles = detalle ? ` · ${detalle}` : ''
                const motivo = [
                  amenaza && `Clima: ${ETIQUETA_NIVEL_CLIMA[amenaza]}`,
                  vulnerabilidad && t.vulnerabilidad(ETIQUETA_NIVEL_VULNERABILIDAD[vulnerabilidad]),
                ].filter(Boolean).join(' · ')
                return (
                  <button
                    key={escuela.cueAnexo}
                    type="button"
                    className="map-sitact__fila"
                    data-testid={`escuela-en-riesgo-${escuela.cueAnexo}`}
                    onClick={() => onSeleccionar(escuela.cueAnexo)}
                    aria-label={`${escuela.nombre}, ${departamento}`}
                  >
                    <span className="map-sitact__franja" style={{ backgroundColor: colorRiesgo(nivel) }} />
                    <span className="map-sitact__contenido-fila">
                      <span className="map-sitact__nombre" title={escuela.nombre}>{escuela.nombre}</span>
                      <span className="map-sitact__meta">{departamento}{niveles}</span>
                      <span className="map-sitact__chips">
                        <span className="map-sitact__pill map-sitact__pill--neutro">{t.nivel(etiquetaNivelRiesgo(dict, nivel).toLowerCase())}</span>
                      </span>
                      {motivo && <span className="map-sitact__meta map-radar-riesgo__motivo">{motivo}</span>}
                    </span>
                  </button>
                )
              })}
              {lista.length > ESCUELAS_VISIBLES && (
                <button type="button" className="map-radar-riesgo__ver-mas" aria-expanded={verTodas} onClick={() => setVerTodas((valor) => !valor)}>
                  {verTodas ? t.verMenos : t.verMas(lista.length - ESCUELAS_VISIBLES)}
                </button>
              )}
            </div>
          ) : (
            <p className="map-sitact__vacio map-sitact__vacio--linea">{t.vacio}</p>
          )}
        </>
      )}
    </section>
  )
}
