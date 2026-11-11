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
  /** CUE de las escuelas resaltadas por la clasificación salarial. */
  resaltadas: ReadonlySet<string>
  onSeleccionarEscuela: (cue: string) => void
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
    <div className="rz-field">
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
  resaltadas,
  onSeleccionarEscuela,
}: PanelReorganizacionProps) {
  const id = useId()
  const idBusqueda = `${id}-busqueda`

  const visibles = escuelasFiltradas.slice(0, LIMITE_FILAS)
  // La clasificación se limpia con su propio selector; "Limpiar filtros" no la toca.
  const filtrosSinClasificacion = { ...filtros, clasificacion: '' }
  const hayFiltros = hayFiltroActivo(filtrosSinClasificacion)
  const filtrosActivos =
    [filtros.departamento, filtros.zona, filtros.tendencia, filtros.pof].filter(Boolean).length + (clasificacion ? 1 : 0)

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
    <>
      <dl className="rz-stats" role="group" aria-label="Indicadores">
        <div className="rz-stat">
          <dt>Establecimientos filtrados</dt>
          <dd>{formatearNumero(indicadores.establecimientos)}</dd>
        </div>
        <div className="rz-stat">
          <dt>Alumnos</dt>
          <dd>{formatearNumero(indicadores.alumnos)}</dd>
        </div>
        <div className="rz-stat">
          <dt>Ubicados en el mapa</dt>
          <dd>{formatearNumero(indicadores.ubicados)}</dd>
        </div>
        <div className="rz-stat">
          <dt>Con POF identificada</dt>
          <dd>{formatearNumero(indicadores.conPof)}</dd>
        </div>
      </dl>

      <div className="rz-field">
        <label htmlFor={idBusqueda} className="rz-vh">
          Buscar
        </label>
        <Input
          id={idBusqueda}
          type="search"
          className="map-filtro-input"
          placeholder="Buscar por CUE, nombre o localidad"
          value={filtros.busqueda}
          onChange={(evento) => onFiltros({ ...filtros, busqueda: evento.target.value })}
        />
      </div>

      <details className="rz-filtros">
        <summary>
          <span className="rz-filtros__resumen">
            Filtros
            {filtrosActivos > 0 && (
              <span className="rz-filtros__cuenta" aria-label={`${filtrosActivos} activos`}>
                {filtrosActivos}
              </span>
            )}
          </span>
        </summary>
        <div className="rz-filtros__cuerpo">
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
          <div className="rz-ancho">
            <CampoSelector
              id={`${id}-clasificacion`}
              etiqueta="Resaltar clasificación salarial"
              valor={clasificacion}
              opciones={opcionesClasificacion}
              onCambio={onClasificacion}
            />
            {clasificacion && (
              <p className="rz-nota">{formatearNumero(cantidadResaltadas)} resaltadas en el listado</p>
            )}
          </div>
          <div className="rz-ancho">
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
        </div>
      </details>

      <div className="rz-seccion">
        <p className="rz-resultado" aria-live="polite">
          <span>
            Mostrando {formatearNumero(visibles.length)} de {formatearNumero(escuelasFiltradas.length)} establecimientos
            {escuelasFiltradas.length !== totalEscuelas && ` (corte de ${formatearNumero(totalEscuelas)})`}
          </span>
        </p>

        {escuelasFiltradas.length === 0 ? (
          <div>
            <p className="map-status">Sin coincidencias</p>
            <p className="rz-nota">Ajuste la búsqueda o los filtros para ver establecimientos.</p>
          </div>
        ) : (
          <ul className="rz-lista" aria-label="Establecimientos filtrados">
            {visibles.map((escuela) => {
              const esSeleccionada = escuela.cue === seleccionada
              const claseFila = [
                'rz-fila',
                resaltadas.has(escuela.cue) ? 'rz-fila--resaltada' : '',
                esSeleccionada ? 'rz-fila--seleccionada' : '',
              ]
                .filter(Boolean)
                .join(' ')
              return (
                <li key={escuela.cue}>
                  <button
                    type="button"
                    className={claseFila}
                    aria-current={esSeleccionada ? 'true' : undefined}
                    onClick={() => onSeleccionarEscuela(escuela.cue)}
                  >
                    <span className="rz-fila__marca" aria-hidden="true" />
                    <span className="rz-fila__texto">
                      <span className="rz-fila__nombre">{escuela.nombre}</span>
                      <span className="rz-fila__meta">
                        CUE {escuela.cue} · {escuela.localidad}
                      </span>
                    </span>
                    <span className="rz-fila__lado">
                      <span className="rz-fila__alumnos">{formatearNumero(escuela.matricula)}</span>
                      <span className="rz-fila__zona">{etiquetaOpcion(escuela.zona || ZONA_SIN_UBICACION)}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}
