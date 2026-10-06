'use client'

import { useState, type JSX } from 'react'
import { formatearVentanaAlerta, type GrupoAlertaRadar } from '@/lib/infraestructura/radar-meteo/alertas-agrupadas'

export function AlertasSeccion(props: {
  grupos: GrupoAlertaRadar[]
  cargando: boolean
  error: boolean
  claveSeleccionada: string | null
  onSeleccionar: (clave: string | null) => void
}): JSX.Element {
  const { grupos, cargando, error, claveSeleccionada, onSeleccionar } = props
  const [mostrarTodas, setMostrarTodas] = useState(false)
  const grupoSeleccionado = grupos.find((grupo) => grupo.clave === claveSeleccionada)
  const mostrarTodo = mostrarTodas || Boolean(grupoSeleccionado && grupos.indexOf(grupoSeleccionado) >= 4)
  const gruposVisibles = grupos.length > 4 && !mostrarTodo ? grupos.slice(0, 4) : grupos

  return (
    <section id="radar-alertas-smn" aria-labelledby="radar-alertas-smn-titulo" className="map-radar-alertas">
      <h3 id="radar-alertas-smn-titulo" className="map-sitact__titulo-seccion">Alertas del SMN</h3>
      {cargando ? (
        <p role="status" className="map-sitact__vacio">Cargando alertas…</p>
      ) : error ? (
        <p className="map-sitact__vacio">No se pudieron cargar las alertas del SMN.</p>
      ) : grupos.length === 0 ? (
        <p className="map-sitact__vacio">Sin alertas oficiales vigentes ni próximas · SMN</p>
      ) : (
        <>
          <div className="map-sitact__lista">
            {gruposVisibles.map((grupo) => {
              const seleccionada = grupo.clave === claveSeleccionada
              const evento = `${grupo.proxima ? 'Próxima · ' : ''}${grupo.evento} · ${grupo.severidad}`
              const departamentos = grupo.departamentos.length ? grupo.departamentos.join(', ') : 'Corrientes'
              const color = colorFranja(grupo.nivelSat)
              return (
                <div className="map-radar-alertas__item" key={grupo.clave}>
                  <button
                    type="button"
                    className="map-sitact__fila"
                    aria-expanded={seleccionada}
                    onClick={() => onSeleccionar(seleccionada ? null : grupo.clave)}
                  >
                    <span className="map-sitact__franja" style={{ backgroundColor: color }} aria-hidden="true" />
                    <span className="map-sitact__contenido-fila">
                      <span className="map-sitact__nombre">{evento}</span>
                      <span className="map-sitact__meta">{departamentos}</span>
                      <span className="map-sitact__meta">{formatearVentanaAlerta(grupo.onset, grupo.expires)}</span>
                    </span>
                  </button>
                  {seleccionada ? (
                    <div className="map-radar-alertas__detalle" role="region" aria-label={`Detalle: ${grupo.evento}`}>
                      <strong>{grupo.headline ?? grupo.evento}</strong>
                      {grupo.description ? <p>{grupo.description}</p> : null}
                      {grupo.instruction ? <p>Recomendación oficial: {grupo.instruction}</p> : null}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
          {grupos.length > 4 ? (
            <button
              type="button"
              className="map-sitact__mas"
              onClick={() => {
                if (mostrarTodo && grupoSeleccionado && grupos.indexOf(grupoSeleccionado) >= 4) onSeleccionar(null)
                setMostrarTodas(!mostrarTodas)
              }}
            >
              {mostrarTodo ? 'Ver menos' : `Ver las ${grupos.length} alertas`}
            </button>
          ) : null}
        </>
      )}
    </section>
  )
}

function colorFranja(nivel: string | null): string {
  const nivelNormalizado = nivel?.toLocaleLowerCase('es')
  if (nivelNormalizado === 'yellow' || nivelNormalizado === 'amarillo' || nivelNormalizado === 'amarilla') return 'var(--severidad-media)'
  if (nivelNormalizado === 'orange' || nivelNormalizado === 'naranja') return 'var(--severidad-alta)'
  if (nivelNormalizado === 'red' || nivelNormalizado === 'rojo' || nivelNormalizado === 'roja') return 'var(--danger-mark)'
  return 'var(--line)'
}
