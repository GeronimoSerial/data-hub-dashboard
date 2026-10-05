'use client'

import { useState, type JSX } from 'react'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { Opcion } from '@/components/ui/opcion'
import { Textarea } from '@/components/ui/textarea'
import { EstadoActualSeveridad } from '@/components/infraestructura/estado-actual-severidad'
import type { CategoriaAfectacion } from '@/lib/infraestructura/categorias'
import {
  ETIQUETA_JUSTIFICACION_CRITICA,
  JUSTIFICACIONES_CRITICA,
  requiereJustificacionCritica,
  type JustificacionCritica,
} from '@/lib/infraestructura/justificacion-critica'
import { criterioSeveridad } from '@/lib/infraestructura/severidad'
import { SEVERIDADES, type Severidad } from '@/lib/infraestructura/validacion'

export interface ValorGravedad {
  severidad: Severidad | ''
  justificacionCritica: JustificacionCritica | ''
  justificacionCriticaDetalle: string
}

export function gravedadCompleta(valor: ValorGravedad, sugerida: Severidad | null): boolean {
  if (valor.severidad === '') return false
  if (!requiereJustificacionCritica(valor.severidad, sugerida)) return true
  if (valor.justificacionCritica === '') return false
  return valor.justificacionCritica !== 'otro' || valor.justificacionCriticaDetalle.trim() !== ''
}

export interface CampoGravedadProps {
  idPrefijo: string
  categoria: CategoriaAfectacion | ''
  sugerida: Severidad | null
  valor: ValorGravedad
  onCambiar: (valor: ValorGravedad) => void
  disabled?: boolean
}

// Los cuatro niveles permanecen visibles: el sugerido orienta, pero la
// gravedad que declara la escuela siempre se elige de forma explícita.
export function CampoGravedad({
  idPrefijo,
  categoria,
  sugerida,
  valor,
  onCambiar,
  disabled = false,
}: CampoGravedadProps): JSX.Element {
  const [pidiendoJustificacion, setPidiendoJustificacion] = useState(false)
  const [razon, setRazon] = useState<JustificacionCritica | ''>('')
  const [detalle, setDetalle] = useState('')
  const categoriaCriterio = categoria === '' ? 'establecimiento' : categoria

  function elegir(severidad: Severidad) {
    if (requiereJustificacionCritica(severidad, sugerida)) {
      setRazon(valor.justificacionCritica)
      setDetalle(valor.justificacionCriticaDetalle)
      setPidiendoJustificacion(true)
      return
    }
    onCambiar({ severidad, justificacionCritica: '', justificacionCriticaDetalle: '' })
  }

  const razonValida = razon !== '' && (razon !== 'otro' || detalle.trim() !== '')

  return (
    <fieldset className="afectacion-campos__grupo" disabled={disabled}>
      <legend className="afectacion-campos__legend">¿Qué tan grave es?</legend>
      <div className="afectacion-campos__opciones">
        {SEVERIDADES.map((severidad) => (
          <Opcion
              key={severidad}
              tipo="radio"
              name={`${idPrefijo}-severidad`}
              value={severidad}
              checked={valor.severidad === severidad}
              onChange={() => elegir(severidad)}
              aria-labelledby={`${idPrefijo}-severidad-${severidad}-nombre`}
              aria-describedby={`${idPrefijo}-severidad-${severidad}-criterio`}
              label={<>
                <span id={`${idPrefijo}-severidad-${severidad}-nombre`}>
                  <EstadoActualSeveridad severidad={severidad} prefijo={false} sugerida={sugerida === severidad} />
                </span>
              </>}
              ayuda={<span id={`${idPrefijo}-severidad-${severidad}-criterio`}>
                {criterioSeveridad(severidad, categoriaCriterio)}
              </span>}
            />
        ))}
      </div>

      <ConfirmSheet
        open={pidiendoJustificacion}
        titulo="¿Por qué es crítica?"
        confirmarLabel="Confirmar"
        confirmarDeshabilitado={!razonValida || disabled}
        onCancelar={() => setPidiendoJustificacion(false)}
        onConfirmar={() => {
          if (!razonValida || disabled) return
          onCambiar({
            severidad: 'Crítica',
            justificacionCritica: razon,
            justificacionCriticaDetalle: razon === 'otro' ? detalle.trim() : '',
          })
          setPidiendoJustificacion(false)
        }}
      >
        <div className="afectacion-campos__opciones">
          {JUSTIFICACIONES_CRITICA.map((justificacion) => (
            <Opcion
                key={justificacion}
                tipo="radio"
                name={`${idPrefijo}-justificacion`}
                checked={razon === justificacion}
                disabled={disabled}
                onChange={() => setRazon(justificacion)}
                label={ETIQUETA_JUSTIFICACION_CRITICA[justificacion]}
                compacta
              />
          ))}
        </div>
        {razon === 'otro' ? (
          <label className="ui-label afectacion-campos__detalle">
            Describa qué pasa
            <Textarea maxLength={300} value={detalle} disabled={disabled} onChange={(e) => setDetalle(e.target.value)} />
          </label>
        ) : null}
      </ConfirmSheet>
    </fieldset>
  )
}
