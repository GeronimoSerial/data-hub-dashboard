'use client'

import { useEffect, useRef, type JSX, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { useOverlayStyles } from '@/components/mapas/overlay-styles'
import type { RespuestaReplay, VistaReplay } from '@/lib/infraestructura/use-replay'

// Panel del "modo Replay" (batch E7c): elegir departamento + ventana de
// fechas, reproducir la línea de tiempo devuelta por GET /api/infraestructura/replay
// y alternar entre las dos vistas ("conocido en ese momento" / "vigencia
// reconstruida", batch E7b). Es un modo de ANÁLISIS separado del modo Radar:
// no se apila sobre él, vive detrás de su propio conmutador y su propio flag
// (REPLAY_ENABLED).
//
// Decisiones de UX de este panel (ver docs/ejecucion-enos/E7c/registro.md):
// - Nunca autoplay al abrir: `playing` siempre arranca en false, lo decide el
//   padre (map-infraestructura-page) al montar el modo.
// - Las fechas viajan en UTC directo (mismo criterio que el export de E7b,
//   ZONA_HORARIA_DATOS='UTC'): el input datetime-local no aplica ninguna
//   conversión de huso horario, sólo agrega los segundos y el sufijo 'Z'.
// - Un cuadro sin dato en alguna fuente (`vacios`) se muestra como "Sin dato"
//   explícito, nunca se interpola con el cuadro anterior ni se anima como si
//   fuera continuidad.

export const ETIQUETA_VISTA: Record<VistaReplay, string> = {
  conocido: 'Lo que se sabía en ese momento',
  reconstruido: 'Reconstrucción con datos posteriores',
}

const INTERVALO_REPRODUCCION_MS = 1200

function isoAInputLocal(iso: string): string {
  // 'YYYY-MM-DDTHH:mm:ssZ' -> 'YYYY-MM-DDTHH:mm' (recorta segundos y el
  // sufijo de zona; el valor SIGUE siendo UTC, ver nota de cabecera).
  return iso.slice(0, 16)
}

function inputLocalAIso(valor: string): string | undefined {
  if (!valor) return undefined
  return `${valor}:00Z`
}

function formatearInstante(iso: string): string {
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return iso
  return (
    fecha.toLocaleString('es-AR', {
      timeZone: 'UTC',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }) + ' UTC'
  )
}

export interface ReplayPanelProps {
  departamentos: string[]
  territorioId: string | null
  onTerritorioIdChange: (valor: string | null) => void
  desde: string
  hasta: string
  onDesdeChange: (valor: string) => void
  onHastaChange: (valor: string) => void
  vista: VistaReplay
  onVistaChange: (valor: VistaReplay) => void
  paso: number
  data: RespuestaReplay | null
  loading: boolean
  error: string | null
  frameIndex: number
  onFrameIndexChange: (indice: number) => void
  playing: boolean
  onPlayingChange: (valor: boolean) => void
  onVolver: () => void
}

function construirUrlExport(
  formato: 'csv' | 'json',
  params: Pick<ReplayPanelProps, 'territorioId' | 'desde' | 'hasta' | 'vista' | 'paso'>,
): string | null {
  if (!params.territorioId || !params.desde || !params.hasta) return null
  const query = new URLSearchParams({
    territorioTipo: 'departamento',
    territorioId: params.territorioId,
    desde: params.desde,
    hasta: params.hasta,
    paso: String(params.paso),
    vista: params.vista,
    formato,
  })
  return `/api/infraestructura/replay/export?${query.toString()}`
}

export function ReplayPanel(props: ReplayPanelProps): JSX.Element {
  const styles = useOverlayStyles()
  const {
    departamentos,
    territorioId,
    onTerritorioIdChange,
    desde,
    hasta,
    onDesdeChange,
    onHastaChange,
    vista,
    onVistaChange,
    paso,
    data,
    loading,
    error,
    frameIndex,
    onFrameIndexChange,
    playing,
    onPlayingChange,
    onVolver,
  } = props

  const cuadros = data?.cuadros ?? []
  const totalCuadros = cuadros.length
  const cuadroActual = totalCuadros > 0 ? cuadros[Math.min(frameIndex, totalCuadros - 1)] : null
  const vacioActual =
    totalCuadros > 0 ? data?.vacios[Math.min(frameIndex, totalCuadros - 1)] : undefined

  // Reproducción automática: SOLO tras un play explícito (nunca al abrir el
  // modo ni al cargar datos nuevos). Se detiene sola al llegar al último
  // cuadro, en vez de volver al principio en loop (repetir sin que el
  // usuario lo pida se leería como una animación de continuidad falsa).
  useEffect(() => {
    if (!playing || totalCuadros === 0) return
    const id = setInterval(() => {
      onFrameIndexChange(
        frameIndex + 1 >= totalCuadros ? totalCuadros - 1 : frameIndex + 1,
      )
      if (frameIndex + 1 >= totalCuadros - 1) onPlayingChange(false)
    }, INTERVALO_REPRODUCCION_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reinicia el intervalo en cada cuadro para poder detenerse justo en el último.
  }, [playing, totalCuadros, frameIndex])

  const puedeRetroceder = frameIndex > 0
  const puedeAvanzar = frameIndex < totalCuadros - 1

  const grupoTimelineRef = useRef<HTMLDivElement>(null)

  function irAtras() {
    if (puedeRetroceder) onFrameIndexChange(frameIndex - 1)
  }
  function irAdelante() {
    if (puedeAvanzar) onFrameIndexChange(frameIndex + 1)
  }
  function alternarReproduccion() {
    if (totalCuadros === 0) return
    onPlayingChange(!playing)
  }

  function onKeyDownTimeline(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.key === 'ArrowLeft') {
      evento.preventDefault()
      irAtras()
    } else if (evento.key === 'ArrowRight') {
      evento.preventDefault()
      irAdelante()
    }
  }

  const urlExportCsv = construirUrlExport('csv', { territorioId, desde, hasta, vista, paso })
  const urlExportJson = construirUrlExport('json', { territorioId, desde, hasta, vista, paso })

  return (
    <div className={`${styles.panel} map-replay-panel`} data-testid="replay-panel">
      <p className={styles.hint} role="status" data-testid="replay-indicador-historia">
        {cuadroActual
          ? `Estás viendo historia: ${formatearInstante(cuadroActual.instante)}`
          : 'Elegí un departamento y una ventana de fechas para empezar el replay.'}
      </p>

      <div className="map-replay-panel__seleccion">
        <label htmlFor="replay-departamento">Departamento</label>
        <select
          id="replay-departamento"
          value={territorioId ?? ''}
          onChange={(evento) => onTerritorioIdChange(evento.target.value || null)}
        >
          <option value="">Seleccionar…</option>
          {departamentos.map((nombre) => (
            <option key={nombre} value={nombre}>
              {nombre}
            </option>
          ))}
        </select>

        <label htmlFor="replay-desde">Desde</label>
        <input
          id="replay-desde"
          type="datetime-local"
          value={isoAInputLocal(desde)}
          onChange={(evento) => onDesdeChange(inputLocalAIso(evento.target.value) ?? '')}
        />

        <label htmlFor="replay-hasta">Hasta</label>
        <input
          id="replay-hasta"
          type="datetime-local"
          value={isoAInputLocal(hasta)}
          onChange={(evento) => onHastaChange(inputLocalAIso(evento.target.value) ?? '')}
        />
      </div>

      <div
        className="map-replay-panel__vista"
        role="group"
        aria-label="Vista temporal del replay"
      >
        <Button
          type="button"
          size="sm"
          variant={vista === 'conocido' ? 'default' : 'secondary'}
          aria-pressed={vista === 'conocido'}
          onClick={() => onVistaChange('conocido')}
        >
          {ETIQUETA_VISTA.conocido}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={vista === 'reconstruido' ? 'default' : 'secondary'}
          aria-pressed={vista === 'reconstruido'}
          onClick={() => onVistaChange('reconstruido')}
        >
          {ETIQUETA_VISTA.reconstruido}
        </Button>
      </div>

      {loading && (
        <p role="status" className={styles.hint}>
          Cargando replay…
        </p>
      )}
      {error && (
        <p role="alert" className={`${styles.hint} ${styles.statusError}`}>
          {error}
        </p>
      )}

      {data && totalCuadros === 0 && (
        <p role="status" className={styles.hint} data-testid="replay-sin-cuadros">
          Sin datos para este período.
        </p>
      )}

      {totalCuadros > 0 && (
        <div
          className="map-replay-panel__timeline"
          role="group"
          aria-label="Línea de tiempo del replay"
          tabIndex={0}
          ref={grupoTimelineRef}
          onKeyDown={onKeyDownTimeline}
        >
          <Button
            type="button"
            size="sm"
            variant="secondary"
            aria-label="Retroceder un cuadro"
            onClick={irAtras}
            disabled={!puedeRetroceder}
          >
            ⏮
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            aria-pressed={playing}
            onClick={alternarReproduccion}
          >
            {playing ? 'Pausar' : 'Reproducir'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            aria-label="Avanzar un cuadro"
            onClick={irAdelante}
            disabled={!puedeAvanzar}
          >
            ⏭
          </Button>
          <p className="map-replay-panel__contador" aria-live="polite">
            Cuadro {frameIndex + 1} de {totalCuadros}
          </p>

          {vacioActual && (vacioActual.snapshotRiesgo || vacioActual.peligro || vacioActual.lluvia) && (
            <ul className="map-replay-panel__vacios" data-testid="replay-vacios">
              {vacioActual.snapshotRiesgo && <li>Sin dato de riesgo para este período.</li>}
              {vacioActual.peligro && <li>Sin dato de peligro para este período.</li>}
              {vacioActual.lluvia && <li>Sin dato de lluvia observada para este período.</li>}
            </ul>
          )}
        </div>
      )}

      <div className="map-replay-panel__export">
        {urlExportCsv && (
          <a href={urlExportCsv} data-testid="replay-export-csv">
            Exportar CSV
          </a>
        )}
        {urlExportJson && (
          <a href={urlExportJson} data-testid="replay-export-json">
            Exportar JSON
          </a>
        )}
      </div>

      <Button type="button" size="sm" variant="secondary" onClick={onVolver}>
        Volver a la situación actual
      </Button>
    </div>
  )
}
