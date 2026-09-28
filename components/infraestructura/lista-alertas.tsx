'use client'

import { useMemo, type JSX } from 'react'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'
import type { ParteMapa } from '@/lib/infraestructura/parte-mapa'
import { SEVERIDADES } from '@/lib/infraestructura/validacion'
import { CATEGORIAS, CATEGORIA_META } from '@/lib/infraestructura/categorias'
import type { EstadoServicioGeneral } from '@/lib/infraestructura/trayectoria-tipos'
import { ETIQUETA_SERVICIO } from './estado-actual-textos'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'

const TODOS = 'todos'
const TODAS = 'todas'

// Los tres estados posibles de EstadoServicioGeneral, en el mismo orden en
// que se los muestra en todos lados (normal → parcial → suspendido): de
// "nada que reportar" a "lo peor".
const SERVICIOS: EstadoServicioGeneral[] = ['normal', 'parcial', 'suspendido']

type FiltrosForm = {
  territorio: string
  nivel: string
  establecimiento: string
  motivo: string
  severidad: string
  categoria: string
  servicio: string
}

export function ListaAlertas(props: {
  partes: ParteMapa[]
  filtros: FiltrosForm
  onFiltroChange: <K extends keyof FiltrosForm>(
    campo: K,
    valor: FiltrosForm[K],
  ) => void
  // Estado de apertura del bloque de filtros avanzados. Vive en el padre
  // (MapInfraestructuraPage) porque esta lista se desmonta al cambiar de modo
  // del mapa (Situación actual / Radar / Replay): si el <details> fuera no
  // controlado, cada remontaje lo devolvía cerrado y el usuario perdía lo que
  // tenía abierto.
  filtrosAbiertos: boolean
  onFiltrosAbiertosChange: (abierto: boolean) => void
}): JSX.Element {
  const styles = useOverlayStyles()

  // El motivo ya no es un catálogo fijo en código (tiene ABM, ver
  // lib/infraestructura/motivos.ts): el filtro ofrece los motivos que
  // efectivamente aparecen en los partes vigentes, no un catálogo completo
  // que requeriría otra llamada a la API sólo para poblar un <select>.
  // Ahora se recorren las afectaciones de cada parte (antes cada alerta ERA
  // una afectación; ahora un parte agrupa varias).
  const motivosPresentes = useMemo(
    () =>
      Array.from(
        new Set(props.partes.flatMap((parte) => parte.afectaciones.map((a) => a.motivo))),
      ).sort((a, b) => a.localeCompare(b)),
    [props.partes],
  )
  const itemsMotivo = useMemo(
    () => ({ [TODOS]: 'Todos', ...Object.fromEntries(motivosPresentes.map((m) => [m, m])) }),
    [motivosPresentes],
  )
  const itemsSeveridad = useMemo(
    () => ({ [TODAS]: 'Todas', ...Object.fromEntries(SEVERIDADES.map((s) => [s, s])) }),
    [],
  )
  const itemsCategoria = useMemo(
    () => ({
      [TODAS]: 'Todas',
      ...Object.fromEntries(CATEGORIAS.map((c) => [c, CATEGORIA_META[c].label])),
    }),
    [],
  )
  const itemsServicio = useMemo(
    () => ({ [TODOS]: 'Todos', ...Object.fromEntries(SERVICIOS.map((s) => [s, ETIQUETA_SERVICIO[s]])) }),
    [],
  )

  return (
    <div className={`${styles.panel} ${styles.legendPanel}`}>
      <details
        className="map-filtros-avanzados"
        open={props.filtrosAbiertos}
        onToggle={(event) => props.onFiltrosAbiertosChange(event.currentTarget.open)}
      >
        <summary>Filtros del mapa</summary>
      <div className={styles.filtrosGrid}>
        <label className="map-filtro-campo">
          <span className="map-filtro-label">Territorio</span>
          <input
            className="ui-input map-filtro-input"
            type="text"
            placeholder="Departamento o localidad"
            value={props.filtros.territorio}
            onChange={(event) =>
              props.onFiltroChange('territorio', event.target.value)
            }
          />
        </label>

        <label className="map-filtro-campo">
          <span className="map-filtro-label">Nivel</span>
          <input
            className="ui-input map-filtro-input"
            type="text"
            placeholder="Nivel (ej. PRIMARIA)"
            value={props.filtros.nivel}
            onChange={(event) =>
              props.onFiltroChange('nivel', event.target.value)
            }
          />
        </label>

        <div className="map-filtro-campo">
          <span className="map-filtro-label">Motivo</span>
          <Select
            value={props.filtros.motivo || TODOS}
            items={itemsMotivo}
            onValueChange={(value) =>
              props.onFiltroChange('motivo', value === TODOS ? '' : String(value))
            }
          >
            <SelectTrigger aria-label="Motivo" className="map-filtro-input" />
            <SelectContent>
              <SelectItem value={TODOS}>Todos</SelectItem>
              {motivosPresentes.map((motivo) => (
                <SelectItem key={motivo} value={motivo}>
                  {motivo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="map-filtro-campo">
          <span className="map-filtro-label">Severidad</span>
          <Select
            value={props.filtros.severidad || TODAS}
            items={itemsSeveridad}
            onValueChange={(value) =>
              props.onFiltroChange('severidad', value === TODAS ? '' : String(value))
            }
          >
            <SelectTrigger aria-label="Severidad" className="map-filtro-input" />
            <SelectContent>
              <SelectItem value={TODAS}>Todas</SelectItem>
              {SEVERIDADES.map((severidad) => (
                <SelectItem key={severidad} value={severidad}>
                  {severidad}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="map-filtro-campo">
          <span className="map-filtro-label">Categoría</span>
          <Select
            value={props.filtros.categoria || TODAS}
            items={itemsCategoria}
            onValueChange={(value) =>
              props.onFiltroChange('categoria', value === TODAS ? '' : String(value))
            }
          >
            <SelectTrigger aria-label="Categoría" className="map-filtro-input" />
            <SelectContent>
              <SelectItem value={TODAS}>Todas</SelectItem>
              {CATEGORIAS.map((categoria) => (
                <SelectItem key={categoria} value={categoria}>
                  {CATEGORIA_META[categoria].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="map-filtro-campo">
          <span className="map-filtro-label">Servicio</span>
          <Select
            value={props.filtros.servicio || TODOS}
            items={itemsServicio}
            onValueChange={(value) =>
              props.onFiltroChange('servicio', value === TODOS ? '' : String(value))
            }
          >
            <SelectTrigger aria-label="Servicio" className="map-filtro-input" />
            <SelectContent>
              <SelectItem value={TODOS}>Todos</SelectItem>
              {SERVICIOS.map((servicio) => (
                <SelectItem key={servicio} value={servicio}>
                  {ETIQUETA_SERVICIO[servicio]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      </details>
      {props.partes.length === 0 ? (
        <span className={styles.hint}>
          No hay escuelas con afectación vigente con los filtros aplicados.
        </span>
      ) : null}
    </div>
  )
}
