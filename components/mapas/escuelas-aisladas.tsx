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
import { useIdioma, useTextos } from '@/lib/i18n/idioma-provider'
import { localeNumero } from '@/lib/i18n/formato-numero'
import { colorPrioridad, etiquetaNivelPlan, prioridadPlanificacion } from '@/lib/infraestructura/mapa/planificacion'
import type { EscuelaMapaEnriquecida } from '@/lib/infraestructura/mapa/tipos'
import type { TerritorioMapa } from '@/lib/infraestructura/territorio-mapa'

export function EscuelasAisladas(props: {
  escuelas: EscuelaMapaEnriquecida[]
  territorio: TerritorioMapa
  onSeleccionar: (cueAnexo: string) => void
}): JSX.Element {
  const { escuelas, territorio, onSeleccionar } = props
  const dict = useTextos()
  const t = dict.controles.aisladas
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
    <section aria-labelledby="map-planificacion-aisladas-titulo" data-testid="escuelas-aisladas">
      <div className="map-sitact__titulo-seccion">
        <h3 id="map-planificacion-aisladas-titulo" style={{ margin: 0, font: 'inherit' }}>{t.titulo}</h3>
        <ComoFunciona />
      </div>

      {items.length > 0 ? (
        <>
          <ul className="map-sitact__kpis" aria-label={t.resumen} style={{ listStyle: 'none', margin: '0 0 var(--s-2)', padding: 0 }}>
            <Kpi valor={resumen.escuelas} texto={t.escuelas} testid="escuelas-aisladas-total" />
            <Kpi valor={resumen.alumnos} texto={t.alumnos} />
            <Kpi valor={resumen.lejanas} texto={t.lejanas} />
            <Kpi valor={resumen.sinAlternativa} texto={t.sinAlternativa} />
          </ul>
          <Select value={orden} items={ORDENES_AISLADAS.map((o) => ({ value: o.valor, label: o.etiqueta }))} onValueChange={(v) => v != null && setOrden(v as OrdenAisladas)}>
            <SelectTrigger className="map-filtro-input" aria-label={t.ordenar} />
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
                  data-testid={`escuela-aislada-${escuela.cueAnexo}`}
                  onClick={() => onSeleccionar(escuela.cueAnexo)}
                  aria-label={`${escuela.nombre}, ${departamento}`}
                >
                  <span className="map-sitact__franja" style={{ backgroundColor: colorPrioridad(item) }} />
                  <span className="map-sitact__contenido-fila">
                    <span className="map-sitact__nombre" title={escuela.nombre}>{escuela.nombre}</span>
                    <span className="map-sitact__meta">{detalle || departamento}</span>
                  </span>
                  <span className="map-sitact__cuando">{etiquetaNivelPlan(dict, item.nivel)}</span>
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <p className="map-sitact__vacio">{t.vacio}</p>
      )}
    </section>
  )
}

function Kpi({ valor, texto, testid }: { valor: number; texto: string; testid?: string }): JSX.Element {
  const idioma = useIdioma()
  const formatoEntero = useMemo(() => new Intl.NumberFormat(localeNumero(idioma)), [idioma])
  return (
    <li className="map-sitact__kpi">
      <strong data-testid={testid}>{formatoEntero.format(valor)}</strong>
      <span>{texto}</span>
    </li>
  )
}

// Popover (no tooltip) porque contiene un enlace: se abre con hover, foco o clic
// y se puede recorrer con teclado.
function ComoFunciona(): JSX.Element {
  const t = useTextos().controles.aisladas
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        delay={150}
        type="button"
        style={{ border: 0, background: 'none', padding: 0, color: 'var(--accent)', font: 'inherit', fontSize: 'var(--t-micro)', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
      >
        {t.comoFunciona}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="ui-tooltip-positioner" sideOffset={6} align="end">
          <Popover.Popup className="ui-tooltip-popup" style={{ lineHeight: 1.4 }}>
            <p style={{ margin: 0 }}>
              {t.explicacion}
            </p>
            <a href="#metodologia/metodologia-aislamiento" style={{ display: 'inline-block', marginTop: 4, color: 'inherit', fontWeight: 600, textDecoration: 'underline' }}>
              {t.verMetodologia}
            </a>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
