'use client'

import { useEffect, useState, type JSX } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { ParteMapa } from '@/lib/infraestructura/parte-mapa'
import type {
  Categoria,
  EstadoEstablecimiento,
  EstadoServicioGeneral,
  ServicioAlcance,
  Severidad,
} from '@/lib/infraestructura/trayectoria-tipos'
import { CATEGORIA_META } from '@/lib/infraestructura/categorias'
import { EstadoActualSeveridad } from './estado-actual-severidad'
import {
  ETIQUETA_ESTABLECIMIENTO,
  ETIQUETA_SERVICIO,
  formatearMomento,
  resumirAlcance,
  rigeDesdeDelServicio,
} from './estado-actual-textos'
import { HistorialMovimiento, type MovimientoHistorial } from './historial-movimiento'

// --- Forma de GET /api/mapas/infraestructura/parte (ver app/api/mapas/infraestructura/parte/route.ts) ---
//
// Deliberadamente SIN nombres de alumnos ni `secciones` por afectación: a
// diferencia de la ruta del director (`/api/problematicas/parte`), acá
// `totales` es lo único que viaja por afectación. Por eso este archivo NO
// reusa `AfectacionVigente`/`EstadoActualAfectacion` (esos tipos exigen
// `secciones: SeccionAfectada[]`, con nombres, que este endpoint nunca envía).
interface AfectacionFicha {
  id: string
  motivo: string
  categoria: Categoria
  severidad: Severidad
  descripcion: string | null
  rigeDesde: string
  totales: { secciones: number; alumnos: number }
}

interface ParteFicha {
  id: string
  cueAnexo: string
  estadoEstablecimiento: EstadoEstablecimiento
  estadoEstablecimientoRigeDesde: string
  actualizadaEn: string
}

interface RespuestaParteMapa {
  ok: true
  periodo: { id: string; nombre: string } | null
  parte: ParteFicha | null
  servicio?: { estadoGeneral: EstadoServicioGeneral; alcanceVigente: ServicioAlcance[] }
  afectaciones?: AfectacionFicha[]
  ultimaActualizacion?: string | null
}

interface RespuestaHistorialMapa {
  ok?: boolean
  movimientos?: MovimientoHistorial[]
}

type EstadoFicha =
  | { fase: 'cargando' }
  | { fase: 'listo'; datos: RespuestaParteMapa }
  | { fase: 'error' }

type EstadoHistorial =
  | { fase: 'cargando' }
  | { fase: 'listo'; movimientos: MovimientoHistorial[] }
  | { fase: 'error' }

// Cantidad de movimientos del historial que se adelantan en la ficha (F3.5):
// "los primeros 3", el resto queda detrás de "Ver historial completo".
const MOVIMIENTOS_ADELANTADOS = 3

/**
 * Contenido del modal de la ficha del parte (F3.2 + F3.5). Componente aparte
 * de `FichaParteModal` para que, igual que el resto de los modales del mapa,
 * el fetch sólo exista mientras el modal está abierto (`{open ? <...> : null}`
 * en el padre, patrón `RecursoDialog`) — acá no hay nada auditado como en el
 * nominal, pero tampoco hace falta pedir la ficha de una escuela que no se
 * está mirando.
 */
function FichaParteModalContenido({
  cueAnexo,
  parteResumen,
  mostrarEnlaceNominal,
  onVerAlumnosAlcanzados,
  onVerHistorialCompleto,
}: {
  cueAnexo: string
  parteResumen: ParteMapa | null
  mostrarEnlaceNominal: boolean
  onVerAlumnosAlcanzados: (afectacionId: string) => void
  onVerHistorialCompleto: () => void
}): JSX.Element {
  const [estado, setEstado] = useState<EstadoFicha>({ fase: 'cargando' })
  const [historial, setHistorial] = useState<EstadoHistorial>({ fase: 'cargando' })

  useEffect(() => {
    let vigente = true
    fetch(`/api/mapas/infraestructura/parte?cue=${encodeURIComponent(cueAnexo)}`)
      .then(async (respuesta) => {
        if (!respuesta.ok) throw new Error('fallo de acceso o de red')
        return (await respuesta.json()) as RespuestaParteMapa
      })
      .then((datos) => {
        if (vigente) setEstado({ fase: 'listo', datos })
      })
      .catch(() => {
        if (vigente) setEstado({ fase: 'error' })
      })
    return () => {
      vigente = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- un fetch por apertura, cueAnexo va en la key del padre
  }, [])

  // Segundo fetch, mismo trigger (F3.5): un solo request extra, no una
  // segunda ronda de aperturas. Independiente del de arriba porque un fallo
  // de uno no tiene por qué tapar al otro (la ficha puede mostrarse sin el
  // bloque "qué cambió", y viceversa).
  useEffect(() => {
    let vigente = true
    fetch(`/api/mapas/infraestructura/historial?cue=${encodeURIComponent(cueAnexo)}`)
      .then(async (respuesta) => {
        if (!respuesta.ok) throw new Error('fallo de acceso o de red')
        return (await respuesta.json()) as RespuestaHistorialMapa
      })
      .then((datos) => {
        if (vigente) setHistorial({ fase: 'listo', movimientos: datos.movimientos ?? [] })
      })
      .catch(() => {
        if (vigente) setHistorial({ fase: 'error' })
      })
    return () => {
      vigente = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const datos = estado.fase === 'listo' ? estado.datos : null

  // Mientras no llegó la respuesta real (o si falló), se muestra lo que el
  // mapa ya tiene en memoria (parteResumen) como placeholder — nunca una
  // pantalla en blanco. Los totales por afectación son el único dato que
  // parteResumen no trae (el mapa sólo agrega a nivel de parte), así que se
  // omiten hasta que responda la ruta.
  const usandoPlaceholder = datos === null && parteResumen !== null

  if (datos === null && parteResumen === null) {
    return (
      <p className="historial-estado" role="status">
        Buscando la ficha del parte…
      </p>
    )
  }

  const servicioGeneral = datos?.servicio?.estadoGeneral ?? parteResumen?.servicio ?? null
  const estadoEstablecimiento =
    datos?.parte?.estadoEstablecimiento ?? parteResumen?.estadoEstablecimiento ?? null
  const rigeServicio = formatearMomento(rigeDesdeDelServicio(datos?.servicio?.alcanceVigente))
  const ultimaActualizacion = formatearMomento(
    datos?.ultimaActualizacion ?? parteResumen?.actualizadaEn ?? null,
  )
  const afectacionesFicha: AfectacionFicha[] | null = datos?.afectaciones ?? null
  const afectacionesPlaceholder = parteResumen?.afectaciones ?? []

  return (
    <div className="ficha-parte-modal">
      {estado.fase === 'error' && (
        <p className="ficha-parte-modal__aviso" role="alert">
          No pudimos actualizar la ficha del parte. Mostramos el último dato conocido en el mapa.
        </p>
      )}

      {servicioGeneral && (
        <section className="estado-actual-bloque" aria-labelledby="ficha-parte-servicio">
          <h3 className="estado-actual-bloque__titulo" id="ficha-parte-servicio">
            Estado del servicio educativo
          </h3>
          <p className="estado-actual-bloque__valor">{ETIQUETA_SERVICIO[servicioGeneral]}</p>
          {rigeServicio && <p className="estado-actual-bloque__vigencia">Rige desde el {rigeServicio}</p>}
        </section>
      )}

      {estadoEstablecimiento && (
        <section className="estado-actual-bloque" aria-labelledby="ficha-parte-establecimiento">
          <h3 className="estado-actual-bloque__titulo" id="ficha-parte-establecimiento">
            Situación del establecimiento
          </h3>
          <p className="estado-actual-bloque__valor">
            {ETIQUETA_ESTABLECIMIENTO[estadoEstablecimiento]}
          </p>
        </section>
      )}

      <section className="estado-actual-bloque estado-actual-bloque--ancho" aria-labelledby="ficha-parte-afectaciones">
        <h3 className="estado-actual-bloque__titulo" id="ficha-parte-afectaciones">
          Situación hidrometeorológica en seguimiento
        </h3>

        {afectacionesFicha !== null ? (
          <ul className="estado-actual-afectaciones">
            {afectacionesFicha.map((afectacion) => (
              <li key={afectacion.id} className="estado-actual-afectacion">
                <div className="estado-actual-afectacion__encabezado">
                  <span className="estado-actual-afectacion__motivo">{afectacion.motivo}</span>
                  <EstadoActualSeveridad severidad={afectacion.severidad} />
                </div>
                <p className="estado-actual-afectacion__alcance">
                  {CATEGORIA_META[afectacion.categoria].label} · desde{' '}
                  {formatearMomento(afectacion.rigeDesde)}
                </p>
                <p className="estado-actual-afectacion__alcance">{resumirAlcance(afectacion.totales)}</p>
                {afectacion.descripcion && (
                  <p className="estado-actual-afectacion__descripcion">{afectacion.descripcion}</p>
                )}
                {mostrarEnlaceNominal && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => onVerAlumnosAlcanzados(afectacion.id)}
                  >
                    Ver alumnos alcanzados
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <ul className="estado-actual-afectaciones">
            {afectacionesPlaceholder.map((afectacion) => (
              <li key={afectacion.id} className="estado-actual-afectacion">
                <div className="estado-actual-afectacion__encabezado">
                  <span className="estado-actual-afectacion__motivo">{afectacion.motivo}</span>
                  {/* AfectacionMapa.severidad (parte-mapa.ts) viaja como
                      `string` sin el union — el mismo dato que ya devuelve el
                      servidor validado contra SEVERIDADES, así que el cast es
                      seguro acá. */}
                  <EstadoActualSeveridad severidad={afectacion.severidad as Severidad} />
                </div>
                <p className="estado-actual-afectacion__alcance">
                  {CATEGORIA_META[afectacion.categoria].label} · desde{' '}
                  {formatearMomento(afectacion.rigeDesde)}
                </p>
                {/* Sin totales todavía: usandoPlaceholder los está esperando
                    del fetch en curso, ver aviso más abajo. */}
                {afectacion.descripcion && (
                  <p className="estado-actual-afectacion__descripcion">{afectacion.descripcion}</p>
                )}
                {mostrarEnlaceNominal && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => onVerAlumnosAlcanzados(afectacion.id)}
                  >
                    Ver alumnos alcanzados
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {usandoPlaceholder && estado.fase === 'cargando' && (
          <p className="ficha-parte-modal__aviso" role="status">
            Actualizando los totales de secciones y alumnos…
          </p>
        )}
      </section>

      {ultimaActualizacion && (
        <p className="estado-actual-pie__actualizacion">Última actualización: {ultimaActualizacion}</p>
      )}

      {/* F3.5: qué cambió, adelantado dentro de la misma ficha. */}
      {historial.fase === 'listo' && historial.movimientos.length > 0 && (
        <section className="ficha-parte-modal__historial" aria-labelledby="ficha-parte-historial">
          <h3 className="estado-actual-bloque__titulo" id="ficha-parte-historial">
            Qué cambió
          </h3>
          <ol className="historial-lista">
            {historial.movimientos.slice(0, MOVIMIENTOS_ADELANTADOS).map((movimiento) => (
              <HistorialMovimiento key={movimiento.id} movimiento={movimiento} />
            ))}
          </ol>
          <Button type="button" variant="ghost" size="sm" onClick={onVerHistorialCompleto}>
            Ver historial completo
          </Button>
        </section>
      )}
    </div>
  )
}

/**
 * Modal de la ficha del parte (F3.2), reemplazo del `Popup` de MapLibre con
 * `FichaAlerta`. `parteResumen` es lo que `useAlertas` ya tiene en memoria
 * (sin re-fetch): sirve de placeholder mientras se resuelve el fetch propio
 * de este modal, que trae los totales POR AFECTACIÓN que el mapa no agrega.
 *
 * El contenido (y sus dos fetches) sólo se monta con `open === true`, patrón
 * `RecursoDialog` (components/admin-page.tsx): cerrar y reabrir vuelve a
 * pedir todo, que es lo correcto para datos de sólo lectura sin efectos
 * secundarios.
 */
export function FichaParteModal({
  cueAnexo,
  open,
  onOpenChange,
  parteResumen,
  mostrarEnlaceNominal,
  onVerAlumnosAlcanzados,
  onVerHistorialCompleto,
}: {
  cueAnexo: string
  open: boolean
  onOpenChange: (open: boolean) => void
  parteResumen: ParteMapa | null
  mostrarEnlaceNominal: boolean
  onVerAlumnosAlcanzados: (afectacionId: string) => void
  onVerHistorialCompleto: () => void
}): JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="map-detail-dialog">
        <DialogTitle>{parteResumen?.nombre ?? 'Ficha del parte'}</DialogTitle>
        {parteResumen && (
          <p className="estado-actual-bloque__vigencia">
            {parteResumen.localidad}, {parteResumen.departamento}
          </p>
        )}
        {open ? (
          <FichaParteModalContenido
            key={cueAnexo}
            cueAnexo={cueAnexo}
            parteResumen={parteResumen}
            mostrarEnlaceNominal={mostrarEnlaceNominal}
            onVerAlumnosAlcanzados={onVerAlumnosAlcanzados}
            onVerHistorialCompleto={onVerHistorialCompleto}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
