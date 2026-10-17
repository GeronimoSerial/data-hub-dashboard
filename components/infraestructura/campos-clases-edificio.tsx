'use client'

import { useState, type JSX } from 'react'
import { ETIQUETA_CLASES, ETIQUETA_ESTABLECIMIENTO } from '@/components/infraestructura/estado-actual-textos'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { Opcion } from '@/components/ui/opcion'
import { AvisosConsistencia } from '@/components/infraestructura/afectacion-campos'
import type { EstadoEstablecimiento } from '@/lib/infraestructura/trayectoria-tipos'
import {
  bloqueoOpcion,
  type Regla,
  type RespuestasConsistencia,
} from '@/lib/infraestructura/consistencia-parte'

export interface ValorClasesEdificio {
  servicioEstado: '' | 'normal' | 'suspendido'
  estadoEstablecimiento: '' | EstadoEstablecimiento
}

const INTERRUMPE_TODO: EstadoEstablecimiento[] = ['evacuado', 'centro_evacuados']

// Elegir "evacuado" suspende las clases (ver aplicarEdificio): el bloqueo se
// evalúa con esa consecuencia, no con la respuesta de clases vigente.
function bloqueoEdificio(respuestas: RespuestasConsistencia | undefined, estado: string): Regla | null {
  if (!respuestas) return null
  const implicita = estado === 'evacuado' ? { ...respuestas, clases: 'suspendido' as const } : respuestas
  return bloqueoOpcion(implicita, 'edificio', estado)
}

function bloqueoClases(respuestas: RespuestasConsistencia | undefined, estado: string): Regla | null {
  return respuestas ? bloqueoOpcion(respuestas, 'clases', estado) : null
}

// Motivos de bloqueo distintos (sin repetir mensaje) de las opciones de un grupo.
function motivosDeBloqueo(valores: string[], bloqueo: (valor: string) => Regla | null): string[] {
  const reglas = valores.map(bloqueo).filter((regla): regla is Regla => regla !== null)
  return [...new Set(reglas.map((regla) => regla.mensaje))]
}

export function CamposClasesEdificio({
  valor,
  onCambiar,
  alcanceParcial,
  onInterrumpirTodaLaEscuela,
  respuestas,
  advertencias = [],
  alcanceAlgunas = false,
  disabled = false,
}: {
  valor: ValorClasesEdificio
  onCambiar: (valor: ValorClasesEdificio) => void
  alcanceParcial: boolean
  onInterrumpirTodaLaEscuela: () => void
  /** Sin respuestas no hay reglas que aplicar: las opciones quedan habilitadas. */
  respuestas?: RespuestasConsistencia
  advertencias?: Regla[]
  alcanceAlgunas?: boolean
  disabled?: boolean
}): JSX.Element {
  const [pendiente, setPendiente] = useState<EstadoEstablecimiento | null>(null)
  const evacuado = valor.estadoEstablecimiento === 'evacuado'
  const motivosClases = evacuado ? [] : motivosDeBloqueo(['normal', 'suspendido'], (e) => bloqueoClases(respuestas, e))
  const motivosEdificio = motivosDeBloqueo(Object.keys(ETIQUETA_ESTABLECIMIENTO), (e) => bloqueoEdificio(respuestas, e))

  function aplicarEdificio(estado: EstadoEstablecimiento) {
    // Evacuado ⇒ sin clases: la combinación contraria es imposible.
    onCambiar({ estadoEstablecimiento: estado, servicioEstado: estado === 'evacuado' ? 'suspendido' : valor.servicioEstado })
  }

  function elegirEdificio(estado: EstadoEstablecimiento) {
    if (bloqueoEdificio(respuestas, estado) !== null) return
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
                onChange={() => {
                  if (bloqueoClases(respuestas, estado) === null) onCambiar({ ...valor, servicioEstado: estado })
                }}
                disabled={disabled || evacuado || bloqueoClases(respuestas, estado) !== null}
                label={ETIQUETA_CLASES[estado]}
                compacta
              />
          ))}
        </div>
        {evacuado ? <p className="afectacion-campos__espera">El edificio está evacuado</p> : null}
        {motivosClases.map((mensaje) => (
          <p key={mensaje} className="afectacion-campos__espera">{mensaje}</p>
        ))}
        {alcanceAlgunas && valor.servicioEstado === 'suspendido' ? (
          <p className="afectacion-campos__espera">Se suspenden las clases solo en las secciones seleccionadas</p>
        ) : null}
        <AvisosConsistencia reglas={advertencias} campos={['clases']} />
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
                disabled={disabled || bloqueoEdificio(respuestas, estado) !== null}
                label={ETIQUETA_ESTABLECIMIENTO[estado]}
                compacta
              />
          ))}
        </div>
        {motivosEdificio.map((mensaje) => (
          <p key={mensaje} className="afectacion-campos__espera">{mensaje}</p>
        ))}
        <AvisosConsistencia reglas={advertencias} campos={['edificio']} />
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
