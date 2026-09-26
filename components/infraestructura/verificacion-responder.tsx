'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { formatearCargaCorta } from './historial-formato'

// Forma pública de una verificación del batch E1 tal como la devuelven los
// endpoints del enlace. `tokenHash` nunca llega al navegador: el Route Handler
// lo quita antes de responder.
export interface VerificacionEnlace {
  cueAnexo: string
  estado: 'pendiente' | 'respondida' | 'cancelada'
  resultado: 'sin_afectacion' | 'con_afectacion' | 'no_disponible' | null
  respondidaEn: string | null
  discrepancia: number | boolean
}

interface VerificacionResponderProps {
  verificacionId: string
  token: string
  escuelaNombre?: string
}

type AccionRespuesta = 'sin_afectacion'

// Máquina de estados de la pantalla. Un discriminante único: cada render sabe
// exactamente qué mostrar y qué acciones existen, sin banderas sueltas.
type Maquina =
  | { estado: 'cargando' }
  | { estado: 'error'; mensaje: string }
  | { estado: 'pendiente'; verificacion: VerificacionEnlace; mensaje?: string }
  | { estado: 'confirmar'; verificacion: VerificacionEnlace; accion: AccionRespuesta }
  | {
      estado: 'enviando'
      verificacion: VerificacionEnlace
      accion: AccionRespuesta | 'canjear_sesion'
    }
  | { estado: 'comprobante'; verificacion: VerificacionEnlace }
  | { estado: 'ir_a_parte' }

// La lee la pieza que completa el enlace del movimiento (otra tarea del batch);
// acá sólo se guarda antes de navegar al formulario de parte.
const CLAVE_VINCULO = 'e1-verificacion-vinculo'

const PREGUNTA =
  '¿Su escuela tiene actualmente alguna afectación por la situación hidrometeorológica?'
const CONFIRMACION_SIN_AFECTACION =
  '¿Confirma que la escuela NO tiene afectación en este momento?'
const TEXTO_ERROR_SIN_SALIDA =
  'Si cree que esto es un error, comuníquese con quien le compartió el enlace.'
const NOTA_DISCREPANCIA =
  "Se registró como 'sin afectación', pero el sistema tenía una afectación vigente para esta escuela. Un operador va a revisar esta diferencia."

function nombreEscuela(escuelaNombre: string | undefined, cueAnexo: string): string {
  return escuelaNombre ? `${escuelaNombre} (CUE ${cueAnexo})` : `Escuela ${cueAnexo}`
}

function textoResultado(verificacion: VerificacionEnlace): string {
  if (verificacion.estado === 'cancelada') return 'Cancelada'
  switch (verificacion.resultado) {
    case 'sin_afectacion':
      return 'Sin afectación'
    case 'con_afectacion':
      return 'Con afectación'
    case 'no_disponible':
      return 'No disponible'
    default:
      return 'Sin respuesta'
  }
}

// El mensaje de la API ya viene en español para el director; sólo se cae al
// texto por defecto si el cuerpo no trae uno legible.
async function leerError(respuesta: Response, porDefecto: string): Promise<string> {
  const cuerpo = await respuesta.json().catch(() => null)
  return cuerpo?.error ?? porDefecto
}

export function VerificacionResponder({
  verificacionId,
  token,
  escuelaNombre,
}: VerificacionResponderProps) {
  const router = useRouter()
  const [maquina, setMaquina] = useState<Maquina>({ estado: 'cargando' })

  useEffect(() => {
    let activo = true

    async function validar() {
      try {
        const respuesta = await fetch(
          `/api/problematicas/verificaciones/${verificacionId}/validar-token`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          },
        )
        if (!activo) return
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', window.location.pathname)
        }
        if (!respuesta.ok) {
          setMaquina({
            estado: 'error',
            mensaje: await leerError(respuesta, 'No se pudo validar el enlace.'),
          })
          return
        }
        const cuerpo = await respuesta.json()
        if (!activo) return
        const verificacion = cuerpo?.verificacion as VerificacionEnlace
        if (verificacion?.estado === 'pendiente') {
          setMaquina({ estado: 'pendiente', verificacion })
        } else {
          // Ya respondida o cancelada: no hay nada que hacer, se muestra el
          // comprobante/estado final directamente.
          setMaquina({ estado: 'comprobante', verificacion })
        }
      } catch {
        if (activo) {
          if (typeof window !== 'undefined') {
            window.history.replaceState(null, '', window.location.pathname)
          }
          setMaquina({ estado: 'error', mensaje: 'No se pudo validar el enlace.' })
        }
      }
    }

    validar()
    return () => {
      activo = false
    }
  }, [verificacionId, token])

  async function responderSinAfectacion(verificacion: VerificacionEnlace) {
    setMaquina({ estado: 'enviando', verificacion, accion: 'sin_afectacion' })
    try {
      const respuesta = await fetch(
        `/api/problematicas/verificaciones/${verificacionId}/responder`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, resultado: 'sin_afectacion' }),
        },
      )
      if (!respuesta.ok) {
        const mensaje = await leerError(respuesta, 'No se pudo registrar la respuesta.')
        // Credencial dura (revocada/vencida/inexistente): no tiene sentido
        // volver a preguntar. El resto (por ejemplo un 409) sí vuelve a la
        // pantalla principal con el mensaje a la vista.
        if ([403, 404, 410].includes(respuesta.status)) {
          setMaquina({ estado: 'error', mensaje })
        } else {
          setMaquina({ estado: 'pendiente', verificacion, mensaje })
        }
        return
      }
      const cuerpo = await respuesta.json()
      setMaquina({ estado: 'comprobante', verificacion: cuerpo.verificacion })
    } catch {
      setMaquina({
        estado: 'pendiente',
        verificacion,
        mensaje: 'No se pudo registrar la respuesta.',
      })
    }
  }

  async function irAlParte(verificacion: VerificacionEnlace) {
    setMaquina({ estado: 'enviando', verificacion, accion: 'canjear_sesion' })
    try {
      const respuesta = await fetch(
        `/api/problematicas/verificaciones/${verificacionId}/canjear-sesion`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        },
      )
      if (!respuesta.ok) {
        setMaquina({
          estado: 'error',
          mensaje: await leerError(respuesta, 'No se pudo validar el enlace.'),
        })
        return
      }
      // El enlace automático del movimiento (otra tarea) lee esta clave. Se
      // guarda ANTES de navegar para que esté disponible al montar el parte.
      sessionStorage.setItem(CLAVE_VINCULO, JSON.stringify({ id: verificacionId, token }))
      setMaquina({ estado: 'ir_a_parte' })
      // La cookie de sesión ya quedó seteada por el fetch anterior; el push de
      // Next la aprovecha en la misma navegación SPA.
      router.push(`/problematicas/parte?cue=${encodeURIComponent(verificacion.cueAnexo)}`)
    } catch {
      setMaquina({ estado: 'error', mensaje: 'No se pudo validar el enlace.' })
    }
  }

  if (maquina.estado === 'cargando') {
    return (
      <div className="verificacion-pantalla">
        <p className="estado-actual-aviso__texto" role="status">
          Verificando el enlace…
        </p>
      </div>
    )
  }

  if (maquina.estado === 'enviando') {
    return (
      <div className="verificacion-pantalla">
        <p className="estado-actual-aviso__texto" role="status">
          {maquina.accion === 'canjear_sesion'
            ? 'Abriendo el formulario…'
            : 'Registrando la respuesta…'}
        </p>
      </div>
    )
  }

  if (maquina.estado === 'ir_a_parte') {
    return (
      <div className="verificacion-pantalla">
        <p className="estado-actual-aviso__texto" role="status">
          Abriendo el formulario…
        </p>
      </div>
    )
  }

  if (maquina.estado === 'error') {
    return (
      <div className="verificacion-pantalla">
        <div className="estado-actual-aviso">
          <p className="estado-actual-aviso__texto" role="alert">
            {maquina.mensaje}
          </p>
          <p className="estado-actual-aviso__texto">{TEXTO_ERROR_SIN_SALIDA}</p>
        </div>
      </div>
    )
  }

  if (maquina.estado === 'pendiente') {
    return (
      <div className="verificacion-pantalla">
        <h1 className="publico-content__title">
          {nombreEscuela(escuelaNombre, maquina.verificacion.cueAnexo)}
        </h1>

        {maquina.mensaje && (
          <div className="estado-actual-aviso">
            <p className="estado-actual-aviso__texto" role="alert">
              {maquina.mensaje}
            </p>
          </div>
        )}

        <p className="verificacion-pregunta">{PREGUNTA}</p>

        <div className="verificacion-acciones">
          <Button
            className="verificacion-boton"
            onClick={() =>
              setMaquina({
                estado: 'confirmar',
                verificacion: maquina.verificacion,
                accion: 'sin_afectacion',
              })
            }
          >
            Sin afectación
          </Button>
          <Button
            className="verificacion-boton"
            onClick={() => irAlParte(maquina.verificacion)}
          >
            Hay afectación
          </Button>
        </div>
      </div>
    )
  }

  if (maquina.estado === 'confirmar') {
    return (
      <div className="verificacion-pantalla">
        <p className="verificacion-pregunta">{CONFIRMACION_SIN_AFECTACION}</p>

        <div className="verificacion-acciones">
          <Button
            className="verificacion-boton"
            onClick={() => responderSinAfectacion(maquina.verificacion)}
          >
            Confirmar
          </Button>
          <Button
            className="verificacion-boton"
            variant="secondary"
            onClick={() =>
              setMaquina({ estado: 'pendiente', verificacion: maquina.verificacion })
            }
          >
            Volver
          </Button>
        </div>
      </div>
    )
  }

  const { verificacion } = maquina
  const fecha = verificacion.respondidaEn
    ? formatearCargaCorta(verificacion.respondidaEn)
    : ''

  return (
    <div className="verificacion-pantalla">
      <section className="estado-actual-bloque verificacion-comprobante">
        <h2 className="estado-actual-bloque__titulo">Respuesta registrada</h2>
        <p className="estado-actual-bloque__valor">{textoResultado(verificacion)}</p>
        <p className="estado-actual-bloque__vigencia">
          {nombreEscuela(escuelaNombre, verificacion.cueAnexo)}
        </p>

        {verificacion.estado === 'cancelada' && (
          <p className="estado-actual-bloque__vacio">Esta solicitud fue cancelada.</p>
        )}

        {fecha && (
          <p className="estado-actual-bloque__vigencia">Respondida el {fecha}</p>
        )}

        {verificacion.discrepancia && (
          <p className="estado-actual-bloque__vacio">{NOTA_DISCREPANCIA}</p>
        )}
      </section>
    </div>
  )
}
