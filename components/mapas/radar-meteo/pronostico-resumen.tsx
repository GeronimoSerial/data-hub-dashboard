'use client'

import { useMemo, useState, type JSX } from 'react'
import type { HorizonteMotor } from '@/lib/infraestructura/mapa/radar'
import { fechaCorta } from '@/lib/infraestructura/radar-meteo/alertas-agrupadas'
import { UMBRAL_LLUVIA_MM, type PronosticoHorizonte } from '@/lib/infraestructura/radar-meteo/pronostico-horizonte'
import { useIdioma, useTextos } from '@/lib/i18n/idioma-provider'
import { localeNumero } from '@/lib/i18n/formato-numero'

export function PronosticoResumen(props: {
  pronostico: PronosticoHorizonte
  horizonte: HorizonteMotor
  runAt: string | null
  departamentoId: string | null
  onDepartamento: (id: string | null) => void
}): JSX.Element {
  const { pronostico, horizonte, runAt, departamentoId, onDepartamento } = props
  const t = useTextos()
  const idioma = useIdioma()
  const FORMATO_LLUVIA = useMemo(() => new Intl.NumberFormat(localeNumero(idioma), { maximumFractionDigits: 1 }), [idioma])
  const p = t.radar.pronostico
  const [mostrarTodas, setMostrarTodas] = useState(false)
  const indiceSeleccionado = pronostico.filas.findIndex(({ id }) => id === departamentoId)
  const mostrarTodo = mostrarTodas || indiceSeleccionado >= 8
  const filasVisibles = pronostico.filas.length > 8 && !mostrarTodo ? pronostico.filas.slice(0, 8) : pronostico.filas
  const ventana = horizonte === 24
    ? p.ventana24
    : horizonte === 72
      ? p.ventana72
      : pronostico.dias === 1
        ? p.ventanaDia
        : p.ventanaDias(pronostico.dias)

  return (
    <section className="map-radar-pronostico" aria-labelledby="map-radar-pronostico-titulo">
      <h3 id="map-radar-pronostico-titulo" className="map-sitact__titulo-seccion">
        <span>{p.titulo}</span>
        <span className="map-sitact__atenuado">{ventana}</span>
      </h3>
      <div className="map-sitact__kpis map-sitact__kpis--3" aria-label={p.resumenAria}>
        <div className={`map-sitact__kpi${pronostico.conLluvia20mm > 0 ? ' map-sitact__kpi--resaltado' : ''}`}>
          <strong>{pronostico.conLluvia20mm}</strong>
          <span>{p.conLluvia20}</span>
        </div>
        <div className="map-sitact__kpi">
          <strong>{pronostico.rafagaMax ? `${pronostico.rafagaMax.kmh} km/h` : p.sinDato}</strong>
          <span>{p.rafagaMax}</span>
          {pronostico.rafagaMax ? <span className="map-sitact__meta">{pronostico.rafagaMax.departamento}</span> : null}
        </div>
        <div className="map-sitact__kpi">
          <strong>{pronostico.conGranizo}</strong>
          <span>{p.conGranizo}</span>
        </div>
      </div>

      <section className="map-radar-pronostico__seccion">
        {pronostico.filas.length > 0 ? (
          <>
            <div className="map-sitact__lista">
              {filasVisibles.map((fila) => {
                const seleccionado = fila.id === departamentoId
                const cantidad = fila.lluviaMm === null ? p.sinDatoMin : `${FORMATO_LLUVIA.format(fila.lluviaMm)} mm`
                const metadatos = [
                  fila.probabilidadMax === null ? null : p.probMax(fila.probabilidadMax),
                  fila.rafagaMaxKmh === null ? null : p.rafagaMaxKmh(fila.rafagaMaxKmh),
                  fila.granizoPosible ? p.granizoPosible : null,
                ].filter((valor): valor is string => valor !== null).join(' · ')
                return (
                  <button
                    key={fila.id}
                    type="button"
                    className="map-sitact__fila map-radar-pronostico__fila"
                    aria-pressed={seleccionado}
                    aria-label={`${fila.nombre}, ${cantidad}`}
                    onClick={() => onDepartamento(seleccionado ? null : fila.id)}
                  >
                    <span
                      className="map-sitact__franja"
                      aria-hidden="true"
                      style={{ backgroundColor: fila.lluviaMm !== null && fila.lluviaMm >= UMBRAL_LLUVIA_MM ? 'var(--severidad-alta)' : 'var(--line)' }}
                    />
                    <span className="map-sitact__contenido-fila">
                      <span className="map-sitact__nombre">{fila.nombre}</span>
                      {metadatos ? <span className="map-sitact__meta">{metadatos}</span> : null}
                    </span>
                    <span className="map-sitact__cuando">{fila.lluviaMm === null ? p.sinDato : `${FORMATO_LLUVIA.format(fila.lluviaMm)} mm`}</span>
                  </button>
                )
              })}
            </div>
            {pronostico.filas.length > 8 ? (
              <button
                type="button"
                className="map-sitact__mas"
                onClick={() => {
                  if (mostrarTodo && indiceSeleccionado >= 8) onDepartamento(null)
                  setMostrarTodas(!mostrarTodo)
                }}
              >
                {mostrarTodo ? p.verMenos : p.verTodos(pronostico.filas.length)}
              </button>
            ) : null}
          </>
        ) : <p className="map-sitact__vacio">{p.sinDatos}</p>}
        {horizonte !== 24 ? <p className="map-sitact__meta">{p.notaProbabilidad}</p> : null}
        {runAt ? <p className="map-sitact__meta">{p.actualizado(fechaCorta(runAt))}</p> : null}
      </section>
    </section>
  )
}
