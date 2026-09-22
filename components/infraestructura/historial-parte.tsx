'use client'

import { useCallback, useEffect, useState, type JSX } from 'react'
import { Button } from '@/components/ui/button'
import { MENSAJE_ACCESO_VENCIDO } from './estado-actual-textos'
import { HistorialMovimiento, type MovimientoHistorial } from './historial-movimiento'

type Estado =
  | { fase: 'cargando' }
  | { fase: 'listo'; movimientos: MovimientoHistorial[] }
  | { fase: 'error'; accesoVencido: boolean }

interface RespuestaHistorial {
  ok?: boolean
  movimientos?: MovimientoHistorial[]
}

/**
 * Historial del parte (spec §15).
 *
 * Pide GET `endpoint` y muestra los movimientos en el orden que devuelve la
 * ruta (cronológico inverso, resuelto server-side). No reordena ni reescribe
 * nada: las líneas de `cambios` llegan ya redactadas por el dominio.
 *
 * `endpoint` está parametrizado (F3.4) porque este mismo componente lo usa
 * tanto el director (`/api/problematicas/parte/historial`, con la cookie de
 * acceso público) como el modal del mapa (`/api/mapas/infraestructura/historial`,
 * con la sesión de usuario del hub) — dos rutas server-side distintas, mismo
 * componente de presentación.
 *
 * Que no haya movimientos no es un error: es el estado "sin situación en
 * seguimiento" (spec §17), con su propia copia y su propia salida.
 */
export function HistorialParte({
  cue,
  endpoint,
  mostrarReingresoCookie = true,
}: {
  cue: string
  endpoint: string
  /**
   * El enlace "Volver a ingresar la contraseña" sólo tiene sentido en el
   * recorrido del director (acceso por cookie temporal). En el mapa el 401
   * viene de la sesión de usuario del hub, no de esa cookie — ese enlace ahí
   * sería una acción que no resuelve nada, así que se apaga con este flag y
   * el 401 cae en el mismo error genérico que cualquier otro fallo de acceso.
   */
  mostrarReingresoCookie?: boolean
}): JSX.Element {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' })

  const cargar = useCallback(async () => {
    try {
      const respuesta = await fetch(endpoint)
      if (!respuesta.ok) {
        setEstado({
          fase: 'error',
          accesoVencido: mostrarReingresoCookie && respuesta.status === 401,
        })
        return
      }
      const datos = (await respuesta.json()) as RespuestaHistorial
      setEstado({ fase: 'listo', movimientos: datos.movimientos ?? [] })
    } catch {
      setEstado({ fase: 'error', accesoVencido: false })
    }
  }, [endpoint, mostrarReingresoCookie])

  useEffect(() => {
    void cargar()
  }, [cargar])

  if (estado.fase === 'cargando') {
    // Nielsen #1: el estado de espera se anuncia, no se deja la pantalla en
    // blanco mientras la red responde.
    return (
      <p className="historial-estado" role="status">
        Buscando los movimientos del parte…
      </p>
    )
  }

  if (estado.fase === 'error') {
    return (
      <div className="historial-estado" role="alert">
        <p className="historial-estado__texto">
          {estado.accesoVencido
            ? MENSAJE_ACCESO_VENCIDO
            : 'No pudimos mostrar el historial. Revise su conexión y vuelva a intentar.'}
        </p>
        {estado.accesoVencido ? (
          <a
            className="ui-button ui-button--default historial-estado__accion"
            href={`/problematicas/parte/historial?cue=${encodeURIComponent(cue)}`}
          >
            Volver a ingresar la contraseña
          </a>
        ) : (
          <Button
            type="button"
            onClick={() => {
              setEstado({ fase: 'cargando' })
              void cargar()
            }}
          >
            Reintentar
          </Button>
        )}
      </div>
    )
  }

  if (estado.movimientos.length === 0) {
    return (
      <div className="historial-estado">
        <p className="historial-estado__texto">
          No hay una situación hidrometeorológica en seguimiento para este establecimiento.
        </p>
        <a className="ui-button ui-button--default historial-estado__accion" href={`/problematicas/parte/nuevo?cue=${encodeURIComponent(cue)}`}>
          Iniciar un reporte
        </a>
      </div>
    )
  }

  return (
    <ol className="historial-lista">
      {estado.movimientos.map((movimiento) => (
        <HistorialMovimiento key={movimiento.id} movimiento={movimiento} />
      ))}
    </ol>
  )
}
