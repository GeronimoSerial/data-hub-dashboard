'use client'

import { useMemo, type JSX } from 'react'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'
import type { AlertaActiva } from '@/lib/infraestructura/consulta'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { MOTIVOS, SEVERIDADES } from '@/lib/infraestructura/validacion'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'

const TODOS = 'todos'
const TODAS = 'todas'

type FiltrosForm = {
  territorio: string
  nivel: string
  establecimiento: string
  motivo: string
  severidad: string
}

export function ListaAlertas(props: {
  alertas: AlertaActiva[]
  filtros: FiltrosForm
  onFiltroChange: <K extends keyof FiltrosForm>(
    campo: K,
    valor: FiltrosForm[K],
  ) => void
  seleccionadaCue: string | null
  onSeleccionar: (cueAnexo: string) => void
}): JSX.Element {
  const styles = useOverlayStyles()

  const itemsMotivo = useMemo(
    () => ({ [TODOS]: 'Todos', ...Object.fromEntries(MOTIVOS.map((m) => [m, m])) }),
    [],
  )
  const itemsSeveridad = useMemo(
    () => ({ [TODAS]: 'Todas', ...Object.fromEntries(SEVERIDADES.map((s) => [s, s])) }),
    [],
  )

  return (
    <div className={`${styles.panel} ${styles.legendPanel}`}>
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

        <label className="map-filtro-campo">
          <span className="map-filtro-label">Establecimiento</span>
          <input
            className="ui-input map-filtro-input"
            type="text"
            placeholder="CUE-Anexo"
            value={props.filtros.establecimiento}
            onChange={(event) =>
              props.onFiltroChange('establecimiento', event.target.value)
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
              {MOTIVOS.map((motivo) => (
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
      </div>

      {props.alertas.length === 0 ? (
        <span className={styles.hint}>
          No hay alertas activas con los filtros aplicados.
        </span>
      ) : (
        <ul className={styles.alertasList}>
          {props.alertas.map((alerta) => (
            <li key={alerta.id}>
              <button
                type="button"
                className={
                  props.seleccionadaCue === alerta.cueAnexo
                    ? `${styles.alertaRow} ${styles.alertaRowActive}`
                    : styles.alertaRow
                }
                onClick={() => props.onSeleccionar(alerta.cueAnexo)}
              >
                <span
                  className={styles.swatch}
                  style={{ backgroundColor: colorSeveridad(alerta.severidad) }}
                />
                <b>{alerta.nombre}</b>
                <span className={styles.popupMuted}>
                  {alerta.localidad}, {alerta.departamento} · {alerta.motivo}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
