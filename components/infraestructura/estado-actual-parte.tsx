'use client'

import { useEffect, useState, type JSX } from 'react'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { HistorialParte } from './historial-parte'
import { EstadoActualAfectacion } from './estado-actual-afectacion'
import { etiquetaClases, etiquetaFuncionamiento, tieneServicioInformado } from '@/lib/infraestructura/funcionamiento'
import { derivarClases } from '@/lib/infraestructura/mapa/enriquecer'
import {
  ETIQUETA_ESTABLECIMIENTO,
  MENSAJE_ACCESO_VENCIDO,
  MENSAJE_ERROR_LECTURA,
  MENSAJE_SIN_CORTE,
  MENSAJE_SIN_SITUACION,
  formatearMomento,
  rigeDesdeDelServicio,
  sinSituacionEnSeguimiento,
  type EstadoActualRespuesta,
} from './estado-actual-textos'

type Estado =
  | { fase: 'cargando' }
  | { fase: 'listo'; datos: EstadoActualRespuesta }
  | { fase: 'error'; mensaje: string; reintentable: boolean }

function enlaceCon(ruta: string, cue: string, foco?: string): string {
  const base = `${ruta}?cue=${encodeURIComponent(cue)}`
  return foco ? `${base}&foco=${foco}` : base
}

// Pide el estado actual y lo traduce a la fase que corresponde. Nunca lanza y
// nunca toca estado de React: así el efecto de abajo sólo tiene que aplicar el
// resultado en un callback, sin encadenar renders.
async function obtenerEstado(cue: string): Promise<Estado> {
  try {
    const respuesta = await fetch(`/api/problematicas/parte?cue=${encodeURIComponent(cue)}`)
    if (!respuesta.ok) {
      // Un acceso vencido no se arregla reintentando: se arregla volviendo a
      // ingresar la contraseña. Ofrecer "Reintentar" ahí sería mentirle al
      // director (Nielsen #9).
      if (respuesta.status === 401) {
        return { fase: 'error', mensaje: MENSAJE_ACCESO_VENCIDO, reintentable: false }
      }
      if (respuesta.status === 503) {
        return { fase: 'error', mensaje: MENSAJE_SIN_CORTE, reintentable: true }
      }
      return { fase: 'error', mensaje: MENSAJE_ERROR_LECTURA, reintentable: true }
    }
    return { fase: 'listo', datos: (await respuesta.json()) as EstadoActualRespuesta }
  } catch {
    return { fase: 'error', mensaje: MENSAJE_ERROR_LECTURA, reintentable: true }
  }
}

/**
 * Pantalla "estado actual" del director (spec §6 y §17).
 *
 * Pide GET /api/problematicas/parte y muestra, en el orden de la
 * especificación: estado del servicio educativo, situación del
 * establecimiento, situación hidrometeorológica en seguimiento con sus
 * afectaciones vigentes, última actualización y acciones. La identificación
 * del establecimiento (punto 1 de §6) la resuelve la página del servidor, que
 * ya la conoce: así el director la reconoce sin esperar a la red.
 *
 * Dos reglas que este componente no puede romper:
 *  - `servicio.estadoGeneral` llega derivado del servidor (spec §3.4). Acá no
 *    se recalcula ni se ofrece "parcialmente suspendidas" como algo elegible.
 *  - El director no puede cerrar ni resolver la situación (spec §18.9). No
 *    existe ninguna acción de ese tipo en esta pantalla, ni deshabilitada.
 */
export function EstadoActualParte({ cue }: { cue: string }): JSX.Element {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' })
  const [intento, setIntento] = useState(0)
  const [historialAbierto, setHistorialAbierto] = useState(false)

  useEffect(() => {
    let vigente = true
    void obtenerEstado(cue).then((siguiente) => {
      if (vigente) setEstado(siguiente)
    })
    return () => {
      vigente = false
    }
  }, [cue, intento])

  function reintentar() {
    setEstado({ fase: 'cargando' })
    setIntento((n) => n + 1)
  }

  if (estado.fase === 'cargando') {
    // Nielsen #1: la espera se anuncia en vez de dejar la pantalla en blanco.
    return (
      <p className="estado-actual-aviso" role="status">
        Buscando el estado actual del establecimiento…
      </p>
    )
  }

  if (estado.fase === 'error') {
    return (
      <div className="estado-actual-aviso" role="alert">
        <p className="estado-actual-aviso__texto">{estado.mensaje}</p>
        {estado.reintentable && (
          <Button type="button" onClick={reintentar}>
            Reintentar
          </Button>
        )}
        {estado.mensaje === MENSAJE_ACCESO_VENCIDO && (
          <a
            className="ui-button ui-button--default"
            href={enlaceCon('/problematicas/parte', cue)}
          >
            Volver a ingresar la contraseña
          </a>
        )}
      </div>
    )
  }

  const { datos } = estado
  const sinSituacion = sinSituacionEnSeguimiento(datos)
  const afectaciones = datos.afectaciones ?? []
  const estadoEdificio = afectaciones.some((a) => a.categoria === 'establecimiento')
    ? datos.parte?.estadoEstablecimiento ?? 'habitual' : 'habitual'
  const clases = derivarClases(estadoEdificio, datos.servicio?.estadoGeneral ?? 'normal')
  const carreras = 'carreras' in datos && Array.isArray(datos.carreras) ? datos.carreras.map((c) => c.id as number) : []
  const clasesInformadas = tieneServicioInformado(datos.servicio?.alcanceVigente ?? [], datos.secciones ?? [], carreras) ||
    ['sin_clases', 'evacuado', 'centro_evacuados'].includes(estadoEdificio)
  const rigeServicio = formatearMomento(rigeDesdeDelServicio(datos.servicio?.alcanceVigente))
  const rigeEstablecimiento = formatearMomento(datos.parte?.estadoEstablecimientoRigeDesde)
  const ultimaActualizacion = formatearMomento(datos.ultimaActualizacion)
  // El historial pertenece al parte: sigue disponible aunque ya no haya situación en seguimiento.
  const hayParte = Boolean(datos.periodo && datos.parte)

  return (
    <div className="estado-actual">
      <section className="estado-actual-bloque" aria-labelledby="estado-actual-servicio">
          <h2 className="estado-actual-bloque__titulo" id="estado-actual-servicio">
            Funcionamiento
          </h2>
          <p className="estado-actual-bloque__valor">{etiquetaFuncionamiento(afectaciones)}</p>
      </section>
      <section className="estado-actual-bloque" aria-labelledby="estado-actual-clases">
        <h2 className="estado-actual-bloque__titulo" id="estado-actual-clases">Clases</h2>
        <p className="estado-actual-bloque__valor">{etiquetaClases(clases, clasesInformadas)}</p>
        {clasesInformadas && rigeServicio && <p className="estado-actual-bloque__vigencia">Rige desde el {rigeServicio}</p>}
      </section>

      {datos.parte && (
        <section className="estado-actual-bloque" aria-labelledby="estado-actual-establecimiento">
          <h2 className="estado-actual-bloque__titulo" id="estado-actual-establecimiento">
            Edificio
          </h2>
          <p className="estado-actual-bloque__valor">
            {ETIQUETA_ESTABLECIMIENTO[datos.parte.estadoEstablecimiento]}
          </p>
          {rigeEstablecimiento && (
            <p className="estado-actual-bloque__vigencia">Rige desde el {rigeEstablecimiento}</p>
          )}
        </section>
      )}

      <section
        className="estado-actual-bloque estado-actual-bloque--ancho"
        aria-labelledby="estado-actual-situacion"
      >
        <h2 className="estado-actual-bloque__titulo" id="estado-actual-situacion">
          En seguimiento
        </h2>

        {sinSituacion ? (
          <>
            <p className="estado-actual-bloque__vacio">{MENSAJE_SIN_SITUACION}</p>
            <a
              className="ui-button ui-button--default estado-actual-acciones__principal"
              href={enlaceCon('/problematicas/parte/nuevo', cue)}
            >
              Cargar una situación
            </a>
          </>
        ) : (
          <ul className="estado-actual-afectaciones">
            {afectaciones.map((afectacion) => (
              <EstadoActualAfectacion key={afectacion.id} afectacion={afectacion} />
            ))}
          </ul>
        )}
      </section>

      {(ultimaActualizacion || !sinSituacion || hayParte) && (
        <footer className="estado-actual-pie">
          {ultimaActualizacion && (
            <p className="estado-actual-pie__actualizacion">Última actualización: {ultimaActualizacion}</p>
          )}
          {(!sinSituacion || hayParte) && (
            <div className="estado-actual-acciones">
              {!sinSituacion && (
                <a
                  className="ui-button ui-button--default estado-actual-acciones__principal"
                  href={enlaceCon('/problematicas/parte/actualizar', cue)}
                >
                  Actualizar el parte
                </a>
              )}
              {hayParte && (
                <Button type="button" variant="secondary" aria-haspopup="dialog" onClick={() => setHistorialAbierto(true)}>
                  Ver historial
                </Button>
              )}
            </div>
          )}
        </footer>
      )}
      <BottomSheet open={historialAbierto} titulo="Historial" onCerrar={() => setHistorialAbierto(false)}>
        {historialAbierto ? (
          <HistorialParte cue={cue} endpoint={`/api/problematicas/parte/historial?cue=${encodeURIComponent(cue)}`} />
        ) : null}
      </BottomSheet>
    </div>
  )
}
