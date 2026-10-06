'use client'

import { useState, type JSX } from 'react'
import type { HorizonteMotor } from '@/lib/infraestructura/mapa/radar'
import { fechaCorta } from '@/lib/infraestructura/radar-meteo/alertas-agrupadas'
import { UMBRAL_LLUVIA_MM, type PronosticoHorizonte } from '@/lib/infraestructura/radar-meteo/pronostico-horizonte'

const FORMATO_LLUVIA = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 })

export function PronosticoResumen(props: {
  pronostico: PronosticoHorizonte
  horizonte: HorizonteMotor
  runAt: string | null
  departamentoId: string | null
  onDepartamento: (id: string | null) => void
}): JSX.Element {
  const { pronostico, horizonte, runAt, departamentoId, onDepartamento } = props
  const [mostrarTodas, setMostrarTodas] = useState(false)
  const indiceSeleccionado = pronostico.filas.findIndex(({ id }) => id === departamentoId)
  const mostrarTodo = mostrarTodas || indiceSeleccionado >= 8
  const filasVisibles = pronostico.filas.length > 8 && !mostrarTodo ? pronostico.filas.slice(0, 8) : pronostico.filas
  const ventana = horizonte === 24
    ? 'Próximas 24 h'
    : horizonte === 72
      ? 'Próximos 3 días'
      : pronostico.dias === 1
        ? 'Próximo día'
        : `Próximos ${pronostico.dias} días`

  return (
    <section className="map-radar-pronostico" aria-labelledby="map-radar-pronostico-titulo">
      <div className="map-sitact__kpis map-sitact__kpis--3" aria-label="Resumen del pronóstico">
        <div className={`map-sitact__kpi${pronostico.conLluvia20mm > 0 ? ' map-sitact__kpi--resaltado' : ''}`}>
          <strong>{pronostico.conLluvia20mm}</strong>
          <span>Deptos. con lluvia ≥ 20 mm</span>
        </div>
        <div className="map-sitact__kpi">
          <strong>{pronostico.rafagaMax ? `${pronostico.rafagaMax.kmh} km/h` : 'Sin dato'}</strong>
          <span>Ráfaga máxima</span>
          {pronostico.rafagaMax ? <span className="map-sitact__meta">{pronostico.rafagaMax.departamento}</span> : null}
        </div>
        <div className="map-sitact__kpi">
          <strong>{pronostico.conGranizo}</strong>
          <span>Deptos. con granizo posible</span>
        </div>
      </div>

      <section className="map-radar-pronostico__seccion">
        <h3 id="map-radar-pronostico-titulo" className="map-sitact__titulo-seccion">
          <span>Pronóstico por departamento</span>
          <span className="map-sitact__atenuado">{ventana}</span>
        </h3>
        {pronostico.filas.length > 0 ? (
          <>
            <div className="map-sitact__lista">
              {filasVisibles.map((fila) => {
                const seleccionado = fila.id === departamentoId
                const cantidad = fila.lluviaMm === null ? 'sin dato' : `${FORMATO_LLUVIA.format(fila.lluviaMm)} mm`
                const metadatos = [
                  fila.probabilidadMax === null ? null : `Prob. máx. ${fila.probabilidadMax} %`,
                  fila.rafagaMaxKmh === null ? null : `Ráf. máx. ${fila.rafagaMaxKmh} km/h`,
                  fila.granizoPosible ? 'Granizo posible' : null,
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
                    <span className="map-sitact__cuando">{fila.lluviaMm === null ? 'Sin dato' : `${FORMATO_LLUVIA.format(fila.lluviaMm)} mm`}</span>
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
                {mostrarTodo ? 'Ver menos' : `Ver los ${pronostico.filas.length} departamentos`}
              </button>
            ) : null}
          </>
        ) : <p className="map-sitact__vacio">Sin datos por departamento.</p>}
        {horizonte !== 24 ? <p className="map-sitact__meta">La probabilidad de lluvia corresponde a las próximas 48 h.</p> : null}
        {runAt ? <p className="map-sitact__meta">Actualizado {fechaCorta(runAt)}</p> : null}
      </section>
    </section>
  )
}
