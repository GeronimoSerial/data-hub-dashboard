'use client'

import { useId } from 'react'
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
  const idTitulo = useId()
  const activo = estado !== 'inactivo'
  const puedeReintentar = error !== null && CODIGOS_REINTENTABLES.has(error.codigo) && origen !== null && destino !== null

  return (
    <section aria-labelledby={idTitulo} className="flex flex-col gap-3 p-4">
      <h3 id={idTitulo} className="text-sm font-semibold">
        Recorrido
      </h3>

      <Button variant={activo ? 'secondary' : 'default'} onClick={activo ? onDesactivar : onActivar}>
        {activo ? 'Terminar medición' : 'Medir recorrido'}
      </Button>

      <div aria-live="polite" className="flex flex-col gap-2 text-sm">
        <p className="text-slate-700">{INSTRUCCION[estado]}</p>

        {activo && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-slate-700">Origen</dt>
            <dd className="break-words">{origen?.nombre ?? 'Sin elegir'}</dd>
            <dt className="text-slate-700">Destino</dt>
            <dd className="break-words">{destino?.nombre ?? 'Sin elegir'}</dd>
          </dl>
        )}

        {resultado && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="text-slate-700">Distancia</dt>
            <dd className="font-medium">{`${FORMATO_KM.format(resultado.distanciaKm)} km`}</dd>
            <dt className="text-slate-700">Tiempo teórico</dt>
            <dd className="font-medium">{formatearTiempo(Math.round(resultado.duracionMin))}</dd>
          </dl>
        )}

        {error && <p className="font-medium text-red-800">{error.mensaje}</p>}
      </div>

      {activo && (
        <div className="flex flex-wrap gap-2">
          {puedeReintentar && (
            <Button variant="secondary" size="sm" onClick={onReintentar}>
              Reintentar
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onLimpiar}>
            Limpiar
          </Button>
        </div>
      )}

      <p className="text-xs text-slate-700">
        El tiempo es teórico: no contempla el estado del camino ni el clima, y puede faltar información rural en
        OpenStreetMap.
      </p>
    </section>
  )
}
