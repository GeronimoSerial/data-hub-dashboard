'use client'

import { Button } from '@/components/ui/button'
import type {
  CodigoErrorRecorrido,
  ErrorRecorrido,
  EstadoRecorrido,
  PuntoRecorrido,
  ResultadoRecorrido,
} from './use-recorrido'

export interface PanelRecorridoProps {
  estado: EstadoRecorrido
  origen: PuntoRecorrido | null
  destino: PuntoRecorrido | null
  resultado: ResultadoRecorrido | null
  error: ErrorRecorrido | null
  onActivar: () => void
  onDesactivar: () => void
  onLimpiar: () => void
  onReintentar: () => void
}

const FORMATO_KM = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const FORMATO_ENTERO = new Intl.NumberFormat('es-AR')

// Solo fallas transitorias del servicio admiten reintento inmediato.
const CODIGOS_REINTENTABLES: ReadonlySet<CodigoErrorRecorrido> = new Set([
  'proveedor_no_disponible',
  'tiempo_agotado',
  'red',
])

const INSTRUCCION: Record<EstadoRecorrido, string> = {
  inactivo: 'Active la medición para elegir un origen y un destino.',
  eligiendo_origen: 'Elija el origen en el mapa o en el listado.',
  eligiendo_destino: 'Elija el destino en el mapa o en el listado.',
  cargando: 'Calculando el recorrido por camino vial.',
  listo: 'Recorrido calculado entre el origen y el destino.',
  error: 'No se pudo completar la medición.',
}

function formatearTiempo(minutos: number): string {
  const horas = Math.floor(minutos / 60)
  const resto = minutos % 60
  if (horas === 0) return `${FORMATO_ENTERO.format(resto)} min`
  return `${FORMATO_ENTERO.format(horas)} h ${FORMATO_ENTERO.format(resto)} min`
}

/** Medición de recorrido: controles, origen y destino, distancia y tiempo teórico. */
export function PanelRecorrido({
  estado,
  origen,
  destino,
  resultado,
  error,
  onActivar,
  onDesactivar,
  onLimpiar,
  onReintentar,
}: PanelRecorridoProps) {
  const activo = estado !== 'inactivo'
  const puedeReintentar = error !== null && CODIGOS_REINTENTABLES.has(error.codigo) && origen !== null && destino !== null

  return (
    <section className="rz-ruta" aria-label="Recorrido">
      <p className="rz-nota" aria-live="polite">
        {INSTRUCCION[estado]}
      </p>

      <div className="rz-acciones">
        <Button variant={activo ? 'secondary' : 'default'} onClick={activo ? onDesactivar : onActivar}>
          {activo ? 'Terminar medición' : 'Medir recorrido'}
        </Button>
        {activo && puedeReintentar && (
          <Button variant="secondary" onClick={onReintentar}>
            Reintentar
          </Button>
        )}
        {activo && (
          <Button variant="ghost" onClick={onLimpiar}>
            Limpiar
          </Button>
        )}
      </div>

      {activo && (
        <dl className="rz-kv">
          <dt>Origen</dt>
          <dd>{origen?.nombre ?? 'Sin elegir'}</dd>
          <dt>Destino</dt>
          <dd>{destino?.nombre ?? 'Sin elegir'}</dd>
        </dl>
      )}

      {resultado && (
        <dl className="rz-ruta__resultado">
          <div>
            <dt>Distancia</dt>
            <dd>{`${FORMATO_KM.format(resultado.distanciaKm)} km`}</dd>
          </div>
          <div>
            <dt>Tiempo teórico</dt>
            <dd>{formatearTiempo(Math.round(resultado.duracionMin))}</dd>
          </div>
        </dl>
      )}

      {error && <p className="rz-ruta__error">{error.mensaje}</p>}

      <p className="rz-nota">
        El tiempo es teórico: no contempla el estado del camino ni el clima, y puede faltar información rural en
        OpenStreetMap.
      </p>
    </section>
  )
}
