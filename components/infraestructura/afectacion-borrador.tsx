'use client'

import { useState } from 'react'
import type { JSX } from 'react'
import type { TurnoContexto } from '@/lib/infraestructura/contexto'
import type { MotivoRow } from '@/lib/infraestructura/motivos'
import { EstadoActualSeveridad } from '@/components/infraestructura/estado-actual-severidad'
import { resumirAlcance } from '@/components/infraestructura/estado-actual-textos'
import {
  CamposAQuienAfecta,
  CamposQuePaso,
  esAfectacionLista,
  totalAlumnosDe,
  type AfectacionBorrador,
} from '@/components/infraestructura/afectacion-campos'
import { Button } from '@/components/ui/button'

export type { AfectacionBorrador } from '@/components/infraestructura/afectacion-campos'

export interface AfectacionBorradorCardProps {
  borrador: AfectacionBorrador
  index: number
  motivos: MotivoRow[]
  turnos: TurnoContexto[]
  otrasAfectaciones: AfectacionBorrador[]
  onChange: (siguiente: AfectacionBorrador) => void
  /** Marca el problema como terminado, o descarta uno recién agregado. */
  onResolver: () => void
  /** Vuelve atrás esa marca. */
  onDeshacer?: () => void
  /** Ya fue marcado como terminado y espera el guardado. */
  resuelta?: boolean
  /** Se agregó en esta sesión y todavía no figura en el parte. */
  esNueva?: boolean
  /** Ya figuraba en el parte y el director le cambió algo. */
  modificada?: boolean
  disabled?: boolean
}

/**
 * Una situación del parte, dentro de la lista de la pantalla de
 * actualización.
 *
 * Qué cambió respecto de la versión anterior, y por qué:
 *
 * 1. La fila ERA un disclosure: un chevron y un título que al tocarlos abrían
 *    un formulario. "Abierto" y "cerrado" son estados de software; el director
 *    no tiene cómo saber que esa fila esconde campos, ni qué le va a pasar si
 *    la toca. Ahora la tarjeta no se abre: afirma lo que pasa, y abajo hay
 *    botones que nombran las DOS cosas que pueden haber ocurrido en la
 *    escuela — que la situación cambió, o que ya terminó.
 *
 * 2. "Retirar" nombraba lo que el sistema hace con la fila, no lo que pasó en
 *    la escuela, y su consecuencia era invisible. Ahora es "Ya se resolvió", y
 *    el resultado se ve en el acto: la tarjeta se queda en su lugar, marcada
 *    como resuelta y con "Deshacer". El director ve qué pasó antes de
 *    guardar, y puede volver atrás sin buscar nada.
 *
 * 3. El estado de cada situación está escrito en la tarjeta —sin cambios,
 *    corregida, nueva, se resolvió— para que la lista se lea de un vistazo,
 *    en vez de tener que abrir una por una para recordar qué tocó.
 */
export function AfectacionBorradorCard({
  borrador,
  index,
  motivos,
  turnos,
  otrasAfectaciones,
  onChange,
  onResolver,
  onDeshacer,
  resuelta = false,
  esNueva = false,
  modificada = false,
  disabled = false,
}: AfectacionBorradorCardProps): JSX.Element {
  // Una situación recién agregada nace en edición: todavía no hay nada que
  // leer. Una que ya figura en el parte nace como afirmación.
  const [editando, setEditando] = useState(() => !esAfectacionLista(borrador))
  const idPrefijo = `afectacion-${index}`

  const completa = esAfectacionLista(borrador)
  const titulo = completa && borrador.motivo ? borrador.motivo : `Situación ${index + 1}`
  const alcance = resumirAlcance({
    secciones: borrador.secciones.length,
    alumnos: totalAlumnosDe(borrador, turnos),
  })

  const estado = resuelta
    ? { clave: 'resuelta', texto: 'Se resolvió' }
    : esNueva
      ? { clave: 'nueva', texto: 'Nueva' }
      : modificada
        ? { clave: 'corregida', texto: 'Corregida' }
        : { clave: 'sin-cambios', texto: 'Sin cambios' }

  if (resuelta) {
    return (
      <div className="situacion situacion--resuelta">
        <div className="situacion__encabezado">
          <div className="situacion__identidad">
            <h3 className="situacion__titulo">{titulo}</h3>
            <p className="situacion__detalle">Se va a dar por terminada cuando guarde</p>
          </div>
          <span className="situacion__estado situacion__estado--resuelta">{estado.texto}</span>
        </div>
        <div className="situacion__acciones">
          <Button type="button" variant="secondary" onClick={onDeshacer} disabled={disabled}>
            Deshacer
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={`situacion${editando ? ' situacion--editando' : ''}`}>
      <div className="situacion__encabezado">
        <div className="situacion__identidad">
          <h3 className="situacion__titulo">{titulo}</h3>
          {/* La severidad es el dato que ordena la lista de un vistazo, así
              que se muestra con la misma marca de forma + color que la
              pantalla de estado actual, en vez de quedar como texto suelto.
              El componente ya garantiza que el color nunca sea el único
              canal: lleva la palabra y una forma distinta por nivel. */}
          {completa ? (
            <p className="situacion__detalle">
              <EstadoActualSeveridad severidad={borrador.severidad} />
              <span className="situacion__alcance">{alcance}</span>
            </p>
          ) : (
            <p className="situacion__detalle">Falta completarla</p>
          )}
        </div>
        <span className={`situacion__estado situacion__estado--${estado.clave}`}>{estado.texto}</span>
      </div>

      {editando && (
        <div className="situacion__campos">
          <CamposQuePaso
            borrador={borrador}
            idPrefijo={idPrefijo}
            motivos={motivos}
            otrasAfectaciones={otrasAfectaciones}
            onChange={onChange}
            disabled={disabled}
          />
          <CamposAQuienAfecta
            borrador={borrador}
            idPrefijo={idPrefijo}
            turnos={turnos}
            onChange={onChange}
            disabled={disabled}
          />
        </div>
      )}

      {/*
        Las dos acciones nombran lo que pasó en la escuela, no lo que hace el
        sistema con la fila: son las únicas dos cosas que el director puede
        querer hacer con algo ya informado.
      */}
      <div className="situacion__acciones">
        {editando ? (
          <Button type="button" onClick={() => setEditando(false)} disabled={disabled || !completa}>
            Listo
          </Button>
        ) : (
          <Button type="button" variant="secondary" onClick={() => setEditando(true)} disabled={disabled}>
            Cambió algo
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onResolver} disabled={disabled}>
          {esNueva ? 'Quitar de la lista' : 'Ya se resolvió'}
        </Button>
      </div>
    </div>
  )
}
