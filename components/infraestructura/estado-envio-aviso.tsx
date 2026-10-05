'use client'

import { useEffect, useRef, type JSX } from 'react'
import { CircleAlert, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MENSAJES_ESTADO } from '@/lib/infraestructura/parte/envio-offline'

export function EstadoEnvioAviso({
  estado,
  onRetry,
  mensaje,
  disabled = false,
}: {
  estado: 'pendiente-envio' | 'error-servidor' | 'sesion-vencida'
  onRetry?: () => void
  mensaje?: string
  disabled?: boolean
}): JSX.Element {
  const desconectado = estado === 'pendiente-envio'
  const Icono = desconectado ? WifiOff : CircleAlert
  const ref = useRef<HTMLDivElement>(null)

  // El aviso aparece encima de la barra fija: se trae a la vista para que ni
  // la barra ni el borde de la pantalla tapen el mensaje o "Reintentar ahora".
  useEffect(() => {
    const el = ref.current
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [estado])

  return (
    <div ref={ref} className="estado-envio-aviso" role={desconectado ? 'status' : 'alert'}>
      <Icono className="estado-envio-aviso__icono" aria-hidden="true" />
      <p>{mensaje ?? MENSAJES_ESTADO[estado]}</p>
      {!desconectado && onRetry ? (
        <Button type="button" variant="secondary" onClick={onRetry} disabled={disabled}>
          Reintentar ahora
        </Button>
      ) : null}
    </div>
  )
}
