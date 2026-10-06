'use client'

import { useState, type JSX } from 'react'
import { ETIQUETA_CLASES, ETIQUETA_ESTABLECIMIENTO } from '@/components/infraestructura/estado-actual-textos'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { Opcion } from '@/components/ui/opcion'
import type { EstadoEstablecimiento } from '@/lib/infraestructura/trayectoria-tipos'

export interface ValorClasesEdificio {
  servicioEstado: '' | 'normal' | 'suspendido'
  estadoEstablecimiento: '' | EstadoEstablecimiento
}

const INTERRUMPE_TODO: EstadoEstablecimiento[] = ['evacuado', 'centro_evacuados']

export function CamposClasesEdificio({
  valor,
  onCambiar,
  alcanceParcial,
  onInterrumpirTodaLaEscuela,
  disabled = false,
}: {
  valor: ValorClasesEdificio
  onCambiar: (valor: ValorClasesEdificio) => void
  alcanceParcial: boolean
  onInterrumpirTodaLaEscuela: () => void
  disabled?: boolean
}): JSX.Element {
  const [pendiente, setPendiente] = useState<EstadoEstablecimiento | null>(null)
  const evacuado = valor.estadoEstablecimiento === 'evacuado'

  function aplicarEdificio(estado: EstadoEstablecimiento) {
    // Evacuado ⇒ sin clases: la combinación contraria es imposible.
    onCambiar({ estadoEstablecimiento: estado, servicioEstado: estado === 'evacuado' ? 'suspendido' : valor.servicioEstado })
  }

  function elegirEdificio(estado: EstadoEstablecimiento) {
    if (INTERRUMPE_TODO.includes(estado) && alcanceParcial) {
      setPendiente(estado)
      return
    }
    aplicarEdificio(estado)
  }

  return (
    <>
      <fieldset className="afectacion-campos__grupo" disabled={disabled} aria-label="¿Hay clases?">
        <p className="afectacion-campos__legend">¿Hay clases?</p>
        <div className="afectacion-campos__opciones">
          {(['normal', 'suspendido'] as const).map((estado) => (
            <Opcion
                key={estado}
                tipo="radio"
                name="servicio-educativo"
                value={estado}
                checked={valor.servicioEstado === estado}
                onChange={() => onCambiar({ ...valor, servicioEstado: estado })}
                disabled={disabled || evacuado}
                label={ETIQUETA_CLASES[estado]}
                compacta
              />
          ))}
        </div>
        {evacuado ? <p className="afectacion-campos__espera">El edificio está evacuado</p> : null}
      </fieldset>

      <fieldset className="afectacion-campos__grupo" disabled={disabled} aria-label="¿Cómo está el edificio?">
        <p className="afectacion-campos__legend">¿Cómo está el edificio?</p>
        <div className="afectacion-campos__opciones">
          {(Object.keys(ETIQUETA_ESTABLECIMIENTO) as EstadoEstablecimiento[]).map((estado) => (
            <Opcion
                key={estado}
                tipo="radio"
                name="estado-establecimiento"
                value={estado}
                checked={valor.estadoEstablecimiento === estado}
                onChange={() => elegirEdificio(estado)}
                disabled={disabled}
                label={ETIQUETA_ESTABLECIMIENTO[estado]}
                compacta
              />
          ))}
        </div>
      </fieldset>

      <ConfirmSheet
        open={pendiente !== null}
        titulo="¿Pasamos el alcance a toda la escuela?"
        confirmarLabel="Sí, toda la escuela"
        onCancelar={() => setPendiente(null)}
        onConfirmar={() => {
          if (pendiente) {
            aplicarEdificio(pendiente)
            onInterrumpirTodaLaEscuela()
          }
          setPendiente(null)
        }}
      >
        <p>Esto interrumpe toda la escuela, pero marcó sólo algunas secciones.</p>
      </ConfirmSheet>
    </>
  )
}
