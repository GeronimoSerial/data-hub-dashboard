'use client'

import { useId } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import {
  ETIQUETAS_TENDENCIA,
  FILTROS_INICIALES,
  ZONA_SIN_UBICACION,
  etiquetaOpcion,
  hayFiltroActivo,
  type FiltrosReorganizacion,
  type IndicadoresReorganizacion,
  type OpcionesFiltro,
} from '@/lib/reorganizacion/filtros'
import type { EscuelaV29 } from '@/lib/reorganizacion/tipos'

/** Máximo de filas renderizadas; el resto se informa en el contador. */
const LIMITE_FILAS = 200

/** Valor interno de la opción "todos" de cada selector (nunca es un dato real). */
const TODOS = '__todos__'

const ETIQUETAS_POF: Record<'si' | 'no', string> = {
  si: 'Con registros POF',
  no: 'Sin registros POF',
}

interface Opcion {
  value: string
  label: string
}

export interface PanelReorganizacionProps {
  escuelasFiltradas: EscuelaV29[]
  totalEscuelas: number
  filtros: FiltrosReorganizacion
  onFiltros: (next: FiltrosReorganizacion) => void
  opciones: OpcionesFiltro
  indicadores: IndicadoresReorganizacion
  /** Clasificación salarial que se resalta en el mapa. "" no resalta. */
  clasificacion: string
  onClasificacion: (clasificacion: string) => void
  cantidadResaltadas: number
  /** CUE de la escuela seleccionada, o null. */
  seleccionada: string | null
  onSeleccionarEscuela: (cue: string) => void
  plegado: boolean
  onPlegado: (plegado: boolean) => void
}

function formatearNumero(valor: number): string {
  return valor.toLocaleString('es-AR')
}

interface CampoSelectorProps {
  id: string
  etiqueta: string
  valor: string
  opciones: Opcion[]
  onCambio: (valor: string) => void
}

/** Selector accesible sobre components/ui/select. Traduce el valor vacío a TODOS. */
function CampoSelector({ id, etiqueta, valor, opciones, onCambio }: CampoSelectorProps) {
  return (
    <div className="map-filtro-campo">
      <label htmlFor={id} className="map-filtro-label">
        {etiqueta}
      </label>
      <Select
        value={valor || TODOS}
        items={opciones}
        onValueChange={(next) => next != null && onCambio(String(next) === TODOS ? '' : String(next))}
      >
        <SelectTrigger id={id} className="map-filtro-input" />
        <SelectContent>
          {opciones.map((opcion) => (
            <SelectItem key={opcion.value} value={opcion.value}>
              {opcion.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function PanelReorganizacion({
  escuelasFiltradas,
  totalEscuelas,
  filtros,
  onFiltros,
  opciones,
  indicadores,
  clasificacion,
  onClasificacion,
  cantidadResaltadas,
  seleccionada,
  onSeleccionarEscuela,
  plegado,
  onPlegado,
}: PanelReorganizacionProps) {
  const id = useId()
  const idBusqueda = `${id}-busqueda`
  const idPanel = `${id}-panel`
  const idTitulo = `${id}-titulo`

  const visibles = escuelasFiltradas.slice(0, LIMITE_FILAS)
  // La clasificación se limpia con su propio selector; "Limpiar filtros" no la toca.
  const hayFiltros = hayFiltroActivo({ ...filtros, clasificacion: '' })

  const opcionesDepartamento: Opcion[] = [
    { value: TODOS, label: 'Todos los departamentos' },
    ...opciones.departamentos.map((d) => ({ value: d, label: d })),
  ]
  const opcionesZona: Opcion[] = [
    { value: TODOS, label: 'Todas las zonas' },
    ...opciones.zonas.map((z) => ({ value: z, label: etiquetaOpcion(z) })),
  ]
  const opcionesTendencia: Opcion[] = [
    { value: TODOS, label: 'Todas las tendencias' },
    ...Object.entries(ETIQUETAS_TENDENCIA).map(([valor, etiqueta]) => ({ value: valor, label: etiqueta })),
  ]
  const opcionesPof: Opcion[] = [
    { value: TODOS, label: 'Con y sin registros POF' },
    ...(Object.keys(ETIQUETAS_POF) as Array<'si' | 'no'>).map((valor) => ({ value: valor, label: ETIQUETAS_POF[valor] })),
  ]
  const opcionesClasificacion: Opcion[] = [
    { value: TODOS, label: 'Sin resaltado' },
    ...opciones.clasificaciones.map((c) => ({ value: c, label: etiquetaOpcion(c) })),
  ]

  return (
    <section className="map-sitact" aria-labelledby={idTitulo}>
      <div className="map-sitact__titulo-seccion">
        <h2 id={idTitulo}>Establecimientos</h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={!plegado}
          aria-controls={idPanel}
          onClick={() => onPlegado(!plegado)}
        >
          {plegado ? 'Mostrar panel' : 'Ocultar panel'}
        </Button>
      </div>

      <div id={idPanel} hidden={plegado}>
        <div className="map-sitact" role="group" aria-label="Indicadores">
          <div className="map-sitact__kpis">
            <div className="map-sitact__kpi">
              <strong>{formatearNumero(indicadores.establecimientos)}</strong>
              <span>Establecimientos filtrados</span>
            </div>
            <div className="map-sitact__kpi">
              <strong>{formatearNumero(indicadores.alumnos)}</strong>
              <span>Alumnos</span>
            </div>
            <div className="map-sitact__kpi">
              <strong>{formatearNumero(indicadores.ubicados)}</strong>
              <span>Ubicados en el mapa</span>
            </div>
            <div className="map-sitact__kpi">
              <strong>{formatearNumero(indicadores.conPof)}</strong>
              <span>Con POF identificada</span>
            </div>
          </div>
        </div>

        <div className="map-sitact">
          <div className="map-filtros-grid">
            <div className="map-filtro-campo">
              <label htmlFor={idBusqueda} className="map-filtro-label">
                Buscar
              </label>
              <Input
                id={idBusqueda}
                type="search"
                className="map-filtro-input"
                placeholder="CUE, nombre o localidad"
                value={filtros.busqueda}
                onChange={(evento) => onFiltros({ ...filtros, busqueda: evento.target.value })}
              />
            </div>
            <CampoSelector
              id={`${id}-departamento`}
              etiqueta="Departamento"
              valor={filtros.departamento}
              opciones={opcionesDepartamento}
              onCambio={(departamento) => onFiltros({ ...filtros, departamento })}
            />
            <CampoSelector
              id={`${id}-zona`}
              etiqueta="Zona histórica"
              valor={filtros.zona}
              opciones={opcionesZona}
              onCambio={(zona) => onFiltros({ ...filtros, zona })}
            />
            <CampoSelector
              id={`${id}-tendencia`}
              etiqueta="Tendencia zonal"
              valor={filtros.tendencia}
              opciones={opcionesTendencia}
              onCambio={(tendencia) => onFiltros({ ...filtros, tendencia: tendencia as FiltrosReorganizacion['tendencia'] })}
            />
            <CampoSelector
              id={`${id}-pof`}
              etiqueta="Registros POF"
              valor={filtros.pof}
              opciones={opcionesPof}
              onCambio={(pof) => onFiltros({ ...filtros, pof: pof as FiltrosReorganizacion['pof'] })}
            />
          </div>

          <div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!hayFiltros}
              onClick={() => onFiltros({ ...FILTROS_INICIALES, clasificacion: filtros.clasificacion })}
            >
              Limpiar filtros
            </Button>
          </div>

          <CampoSelector
            id={`${id}-clasificacion`}
            etiqueta="Resaltar clasificación salarial"
            valor={clasificacion}
            opciones={opcionesClasificacion}
            onCambio={onClasificacion}
          />
          {clasificacion && (
            <p className="map-hint">{formatearNumero(cantidadResaltadas)} resaltadas en el listado</p>
          )}
        </div>

        <div className="map-sitact">
          <p className="map-hint" aria-live="polite">
            Mostrando {formatearNumero(visibles.length)} de {formatearNumero(escuelasFiltradas.length)} establecimientos
            {escuelasFiltradas.length !== totalEscuelas && ` (corte de ${formatearNumero(totalEscuelas)})`}
          </p>

          {escuelasFiltradas.length === 0 ? (
            <div>
              <p className="map-status">Sin coincidencias</p>
              <p className="map-hint">Ajuste la búsqueda o los filtros para ver establecimientos.</p>
            </div>
          ) : (
            <ul className="map-sitact__lista" aria-label="Establecimientos filtrados">
              {visibles.map((escuela) => {
                const esSeleccionada = escuela.cue === seleccionada
                return (
                  <li key={escuela.cue}>
                    <button
                      type="button"
                      className={esSeleccionada ? 'map-sitact__fila map-sitact__fila--seleccionada' : 'map-sitact__fila'}
                      aria-current={esSeleccionada ? 'true' : undefined}
                      onClick={() => onSeleccionarEscuela(escuela.cue)}
                    >
                      <span className="map-sitact__franja" aria-hidden="true" />
                      <span className="map-sitact__contenido-fila">
                        <span className="map-sitact__nombre">{escuela.nombre}</span>
                        <span className="map-sitact__meta">
                          CUE {escuela.cue} · {escuela.localidad} · {etiquetaOpcion(escuela.zona || ZONA_SIN_UBICACION)}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
