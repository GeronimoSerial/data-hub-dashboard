'use client'

import { ImpactoAlumnosResumen } from '@/components/infraestructura/impacto-alumnos-resumen'

import { useState, type JSX } from 'react'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { EstadoActualSeveridad } from '@/components/infraestructura/estado-actual-severidad'
import { formatearMomentoHistorial } from '@/components/infraestructura/historial-formato'
import { etiquetaEstablecimiento, etiquetaServicio } from '@/components/infraestructura/estado-actual-textos'
import { LineaDeTiempo } from '@/components/infraestructura/linea-de-tiempo'
import type { MovimientoHistorial } from '@/components/infraestructura/historial-movimiento'
import { ordenarSituaciones, type SituacionRecorrido } from '@/lib/infraestructura/parte/recorrido-actualizacion'
import type { EstadoEstablecimiento, EstadoServicioGeneral } from '@/lib/infraestructura/trayectoria-tipos'
import { textos, type Idioma } from '@/lib/i18n'
import { useIdioma, useTextos } from '@/lib/i18n/idioma-provider'

export interface EntradaActualizarProps {
  situaciones: SituacionRecorrido[]
  estadoEstablecimiento: EstadoEstablecimiento
  estadoServicio: EstadoServicioGeneral
  ultimaCarga: { creadaEn: string; titulo: string; cambios: string[] } | null
  historial: MovimientoHistorial[]
  onActualizar: () => void
}

// "desde hoy, 10:27" / "desde 5 de octubre, 10:27": la frase corre en minúscula.
export function desde(iso: string, idioma: Idioma = 'es'): string {
  const momento = formatearMomentoHistorial(iso, new Date(), idioma)
  const hoy = textos(idioma).fichaHistorial.formato.hoy
  return momento.startsWith(hoy) ? hoy.toLowerCase() + momento.slice(hoy.length) : momento
}

// Layout A del spec rediseño §6.1: prioriza el estado activo y su acción.
export function EntradaActualizar({ situaciones, estadoEstablecimiento, estadoServicio, historial, onActualizar }: EntradaActualizarProps): JSX.Element {
  const diccionario = useTextos()
  const t = diccionario.parteAlgoNuevo.entrada
  const idioma = useIdioma()
  const [historialAbierto, setHistorialAbierto] = useState(false)
  const [principal, ...otras] = ordenarSituaciones(situaciones, estadoEstablecimiento)

  return (
    <div className="entrada-actualizar">
      {principal ? (
        <section aria-label={t.situacionPrincipal} className="entrada-actualizar__principal">
          <p className="entrada-actualizar__motivo">
            <strong>{principal.motivo}</strong> {principal.categoria === 'alumnos' ? <ImpactoAlumnosResumen impacto={principal.impactoAlumnos} /> : <EstadoActualSeveridad severidad={principal.severidad} prefijo={false} />}
          </p>
          <p className="entrada-actualizar__detalle">
            {`${etiquetaEstablecimiento(estadoEstablecimiento, diccionario)} · ${etiquetaServicio(estadoServicio, diccionario)} · ${t.desdeFecha(desde(principal.rigeDesde, idioma))}`}
          </p>
        </section>
      ) : null}

      <div className="asistente__acciones">
        <Button type="button" onClick={onActualizar}>{t.actualizar}</Button>
        <Button
          type="button"
          variant="secondary"
          aria-haspopup="dialog"
          onClick={() => setHistorialAbierto(true)}
        >
          {t.verHistorial}
        </Button>
      </div>

      <BottomSheet open={historialAbierto} titulo={t.historial} onCerrar={() => setHistorialAbierto(false)}>
        <LineaDeTiempo movimientos={historial} />
      </BottomSheet>

      {otras.length > 0 ? (
        <section aria-label={t.tambienActivas} className="entrada-actualizar__otras">
          <p className="entrada-actualizar__etiqueta">{t.tambienActivas}</p>
          <ul>
            {otras.map((situacion) => (
              <li key={situacion.id}>
                <span className="entrada-actualizar__otra-motivo">{situacion.motivo}</span>
                {situacion.categoria === 'alumnos' ? <ImpactoAlumnosResumen impacto={situacion.impactoAlumnos} /> : <EstadoActualSeveridad severidad={situacion.severidad} prefijo={false} />}
                <span className="entrada-actualizar__detalle">{t.desdeFecha(desde(situacion.rigeDesde, idioma))}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
