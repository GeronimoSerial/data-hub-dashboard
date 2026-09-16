'use client'

import type { JSX } from 'react'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'
import type { AlertaActiva } from '@/lib/infraestructura/consulta'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { MOTIVOS, SEVERIDADES } from '@/lib/infraestructura/validacion'

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

  return (
    <div className={`${styles.panel} ${styles.legendPanel}`}>
      <div className={styles.filtrosGrid}>
        <label>
          Territorio
          <input
            type="text"
            placeholder="Departamento o localidad"
            value={props.filtros.territorio}
            onChange={(event) =>
              props.onFiltroChange('territorio', event.target.value)
            }
          />
        </label>

        <label>
          Nivel
          <input
            type="text"
            placeholder="Nivel (ej. PRIMARIA)"
            value={props.filtros.nivel}
            onChange={(event) =>
              props.onFiltroChange('nivel', event.target.value)
            }
          />
        </label>

        <label>
          Establecimiento
          <input
            type="text"
            placeholder="CUE-Anexo"
            value={props.filtros.establecimiento}
            onChange={(event) =>
              props.onFiltroChange('establecimiento', event.target.value)
            }
          />
        </label>

        <label>
          Motivo
          <select
            value={props.filtros.motivo}
            onChange={(event) =>
              props.onFiltroChange('motivo', event.target.value)
            }
          >
            <option value="">Todos</option>
            {MOTIVOS.map((motivo) => (
              <option key={motivo} value={motivo}>
                {motivo}
              </option>
            ))}
          </select>
        </label>

        <label>
          Severidad
          <select
            value={props.filtros.severidad}
            onChange={(event) =>
              props.onFiltroChange('severidad', event.target.value)
            }
          >
            <option value="">Todas</option>
            {SEVERIDADES.map((severidad) => (
              <option key={severidad} value={severidad}>
                {severidad}
              </option>
            ))}
          </select>
        </label>
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
