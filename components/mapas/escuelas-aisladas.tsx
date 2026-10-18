'use client'

import { useMemo, useState, type JSX } from 'react'
import { Popover } from '@base-ui/react/popover'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { etiquetaDepartamento } from '@/lib/infraestructura/mapa/etiquetas'
import {
  detalleAislamiento,
  ORDENES_AISLADAS,
  ordenarAisladas,
  resumenAisladas,
  type OrdenAisladas,
} from '@/lib/infraestructura/mapa/escuelas-aisladas'
import { colorPrioridad, ETIQUETA_NIVEL_PLAN, prioridadPlanificacion } from '@/lib/infraestructura/mapa/planificacion'
import type { EscuelaMapaEnriquecida } from '@/lib/infraestructura/mapa/tipos'
import type { TerritorioMapa } from '@/lib/infraestructura/territorio-mapa'

const formatoEntero = new Intl.NumberFormat('es-AR')

export function EscuelasAisladas(props: {
  escuelas: EscuelaMapaEnriquecida[]
  territorio: TerritorioMapa
  onSeleccionar: (cueAnexo: string) => void
}): JSX.Element {
  const { escuelas, territorio, onSeleccionar } = props
  const [orden, setOrden] = useState<OrdenAisladas>('distancia')

  const items = useMemo(() => {
    const datos = territorio.aislamiento?.escuelas ?? {}
    return prioridadPlanificacion(escuelas, 'aisladas', { territorio }).flatMap((item) => {
      const dato = datos[item.escuela.cueAnexo]
      return dato ? [{ ...item, nombre: item.escuela.nombre, alumnos: item.escuela.alumnos, dato }] : []
    })
  }, [escuelas, territorio])
  const lista = useMemo(() => ordenarAisladas(items, orden), [items, orden])
  const resumen = resumenAisladas(items)

  return (
    <section aria-labelledby="map-planificacion-aisladas-titulo">
      <div className="map-sitact__titulo-seccion">
        <h3 id="map-planificacion-aisladas-titulo" style={{ margin: 0, font: 'inherit' }}>Escuelas aisladas</h3>
        <ComoFunciona />
      </div>

      {items.length > 0 ? (
        <>
          <ul className="map-sitact__kpis" aria-label="Resumen de aislamiento" style={{ listStyle: 'none', margin: '0 0 var(--s-2)', padding: 0 }}>
            <Kpi valor={resumen.escuelas} texto="Escuelas" />
            <Kpi valor={resumen.alumnos} texto="Alumnos" />
            <Kpi valor={resumen.lejanas} texto="A más de 30 km de una localidad urbana" />
            <Kpi valor={resumen.sinAlternativa} texto="Sin camino alternativo" />
          </ul>
          <Select value={orden} items={ORDENES_AISLADAS.map((o) => ({ value: o.valor, label: o.etiqueta }))} onValueChange={(v) => v != null && setOrden(v as OrdenAisladas)}>
            <SelectTrigger className="map-filtro-input" aria-label="Ordenar por" />
            <SelectContent>
              {ORDENES_AISLADAS.map((o) => (
                <SelectItem key={o.valor} value={o.valor}>{o.etiqueta}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="map-sitact__lista">
            {lista.map((item) => {
              const { escuela } = item
              const departamento = etiquetaDepartamento(escuela.departamento)
              const detalle = detalleAislamiento(item.dato)
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
                    <span className="map-sitact__meta">{detalle || departamento}</span>
                  </span>
                  <span className="map-sitact__cuando">{ETIQUETA_NIVEL_PLAN[item.nivel]}</span>
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <p className="map-sitact__vacio">Ninguna escuela aislada para estos filtros.</p>
      )}
    </section>
  )
}

function Kpi({ valor, texto }: { valor: number; texto: string }): JSX.Element {
  return (
    <li className="map-sitact__kpi">
      <strong>{formatoEntero.format(valor)}</strong>
      <span>{texto}</span>
    </li>
  )
}

// Popover (no tooltip) porque contiene un enlace: se abre con hover, foco o clic
// y se puede recorrer con teclado.
function ComoFunciona(): JSX.Element {
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={150}
        type="button"
        style={{ border: 0, background: 'none', padding: 0, color: 'var(--accent)', font: 'inherit', fontSize: 'var(--t-micro)', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
      >
        ¿Cómo funciona?
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="ui-tooltip-positioner" sideOffset={6} align="end">
          <Popover.Popup className="ui-tooltip-popup" style={{ lineHeight: 1.4 }}>
            <p style={{ margin: 0 }}>
              Distancia por camino hasta la localidad urbana más cercana (2.000 habitantes o más), según la red de caminos de OpenStreetMap.
            </p>
            <a href="#metodologia/metodologia-aislamiento" style={{ display: 'inline-block', marginTop: 4, color: 'inherit', fontWeight: 600, textDecoration: 'underline' }}>
              Ver metodología
            </a>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
