'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useIdioma, useTextos } from '@/lib/i18n/idioma-provider'
import type { parteVerificacionesEs } from '@/lib/i18n/diccionarios/grupos/parteVerificaciones.es'
import { formatearCargaCorta } from './historial-formato'
import { CLAVE_VINCULO_VERIFICACION } from './verificacion-vinculo'

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

type Textos = (typeof parteVerificacionesEs)['responder']

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

function nombreEscuela(t: Textos, escuelaNombre: string | undefined, cueAnexo: string): string {
  return escuelaNombre
    ? t.escuelaConNombre(escuelaNombre, cueAnexo)
    : t.escuelaSinNombre(cueAnexo)
}

function textoResultado(t: Textos, verificacion: VerificacionEnlace): string {
  if (verificacion.estado === 'cancelada') return 'Cancelada'
  switch (verificacion.resultado) {
    case 'sin_afectacion':
      return t.resultado.sinAfectacion
    case 'con_afectacion':
      return t.resultado.conAfectacion
    case 'no_disponible':
      return t.resultado.noDisponible
    default:
      return t.resultado.sinRespuesta
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
  const t = useTextos().parteVerificaciones.responder
  const idioma = useIdioma()
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
            mensaje: await leerError(respuesta, t.noSePudoValidar),
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
          setMaquina({ estado: 'error', mensaje: t.noSePudoValidar })
        }
      }
    }

    validar()
    return () => {
      activo = false
    }
  }, [verificacionId, token, t])

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
        const mensaje = await leerError(respuesta, t.noSePudoRegistrar)
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
        mensaje: t.noSePudoRegistrar,
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
          mensaje: await leerError(respuesta, t.noSePudoValidar),
        })
        return
      }
      // Los formularios de parte leen esta clave. Se guarda antes de navegar
      // para que esté disponible al montar el formulario.
      sessionStorage.setItem(CLAVE_VINCULO_VERIFICACION, JSON.stringify({ id: verificacionId, token }))
      setMaquina({ estado: 'ir_a_parte' })
      // La cookie de sesión ya quedó seteada por el fetch anterior; el push de
      // Next la aprovecha en la misma navegación SPA.
      router.push(`/problematicas/parte?cue=${encodeURIComponent(verificacion.cueAnexo)}`)
    } catch {
      setMaquina({ estado: 'error', mensaje: t.noSePudoValidar })
    }
  }

  if (maquina.estado === 'cargando') {
    return (
      <div className="verificacion-pantalla">
        <p className="estado-actual-aviso__texto" role="status">
          {t.verificando}
        </p>
      </div>
    )
  }

  if (maquina.estado === 'enviando') {
    return (
      <div className="verificacion-pantalla">
        <p className="estado-actual-aviso__texto" role="status">
          {maquina.accion === 'canjear_sesion'
            ? t.abriendoFormulario
            : t.registrandoRespuesta}
        </p>
      </div>
    )
  }

  if (maquina.estado === 'ir_a_parte') {
    return (
      <div className="verificacion-pantalla">
        <p className="estado-actual-aviso__texto" role="status">
          {t.abriendoFormulario}
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
          <p className="estado-actual-aviso__texto">{t.errorSinSalida}</p>
        </div>
      </div>
    )
  }

  if (maquina.estado === 'pendiente') {
    return (
      <div className="verificacion-pantalla">
        <h1 className="publico-content__title">
          {nombreEscuela(t, escuelaNombre, maquina.verificacion.cueAnexo)}
        </h1>

        {maquina.mensaje && (
          <div className="estado-actual-aviso">
            <p className="estado-actual-aviso__texto" role="alert">
              {maquina.mensaje}
            </p>
          </div>
        )}

        <p className="verificacion-pregunta">{t.pregunta}</p>

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
            {t.sinAfectacion}
          </Button>
          <Button
            className="verificacion-boton"
            onClick={() => irAlParte(maquina.verificacion)}
          >
            {t.hayAfectacion}
          </Button>
        </div>
      </div>
    )
  }

  if (maquina.estado === 'confirmar') {
    return (
      <div className="verificacion-pantalla">
        <p className="verificacion-pregunta">{t.confirmacionSinAfectacion}</p>

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
            {t.volver}
          </Button>
        </div>
      </div>
    )
  }

  const { verificacion } = maquina
  const fecha = verificacion.respondidaEn
    ? formatearCargaCorta(verificacion.respondidaEn, idioma)
    : ''

  return (
    <div className="verificacion-pantalla">
      <section className="estado-actual-bloque verificacion-comprobante">
        <h2 className="estado-actual-bloque__titulo">{t.comprobanteTitulo}</h2>
        <p className="estado-actual-bloque__valor">{textoResultado(t, verificacion)}</p>
        <p className="estado-actual-bloque__vigencia">
          {nombreEscuela(t, escuelaNombre, verificacion.cueAnexo)}
        </p>

        {verificacion.estado === 'cancelada' && (
          <p className="estado-actual-bloque__vacio">{t.cancelada}</p>
        )}

        {fecha && (
          <p className="estado-actual-bloque__vigencia">{t.respondidaEl(fecha)}</p>
        )}

        {verificacion.discrepancia && (
          <p className="estado-actual-bloque__vacio">{t.notaDiscrepancia}</p>
        )}
      </section>
    </div>
  )
}
