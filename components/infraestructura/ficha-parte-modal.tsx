'use client'

import { useEffect, useRef, useState, type JSX } from 'react'
import { CircleAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DatosPadronEscuela } from '@/lib/infraestructura/datos-padron-escuela'
import type { ParteMapa } from '@/lib/infraestructura/parte-mapa'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import type {
  Categoria,
  EstadoEstablecimiento,
  EstadoServicioGeneral,
  SeccionEstablecimiento,
  ServicioAlcance,
  Severidad,
} from '@/lib/infraestructura/trayectoria-tipos'
import { CATEGORIA_META } from '@/lib/infraestructura/categorias'
import {
  ETIQUETA_ESTABLECIMIENTO,
  ETIQUETA_SERVICIO,
  formatearMomento,
  resumirAlcance,
  rigeDesdeDelServicio,
} from './estado-actual-textos'
import { HistorialMovimiento, type MovimientoHistorial } from './historial-movimiento'
import { FichaTerritorial } from './ficha-territorial'
import {
  FichaAccesoTerritorial,
  type FichaAccesoTerritorialProps,
} from './ficha-acceso-territorial'

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
  // Secciones del establecimiento (turno + id de sección GE) que devuelve la
  // ruta para CUALQUIER escuela del corte, tenga o no afectación vigente. Es
  // la fuente cruda; el bloque "Datos de la escuela" ya no la recorre (usa
  // `datosPadron`, que es el agregado), pero se conserva en la forma de la
  // respuesta por compatibilidad con la ruta.
  secciones?: SeccionEstablecimiento[]
  // Agregado del padrón GE de la escuela (F3.2/V4): nivel(es), matrícula total
  // del corte vigente, secciones y turnos. `null` = la escuela no tiene
  // ninguna sección en el corte vigente (se dice explícitamente en la ficha);
  // `undefined` = una ruta vieja no lo manda. Nunca trae identidad de alumno.
  datosPadron?: DatosPadronEscuela | null
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
 * Severidad dentro de la ficha del mapa (hallazgo 21). La ficha NO reusa
 * `EstadoActualSeveridad` a propósito: ese componente es compartido con las
 * pantallas del director y codifica el nivel con una forma propia (círculo,
 * cuadrado, triángulo, rombo). Acá, y sólo acá, se usa un ícono fijo para
 * todos los niveles + el color oficial + el texto: la forma no varía por
 * nivel y el nivel sigue siendo legible sin depender del color.
 */
function IndicadorSeveridadFicha({ severidad }: { severidad: Severidad }): JSX.Element {
  return (
    <span className="estado-actual-severidad">
      <CircleAlert
        size={16}
        aria-hidden
        style={{ color: colorSeveridad(severidad), flexShrink: 0 }}
      />
      <span className="estado-actual-severidad__texto">Severidad {severidad}</span>
    </span>
  )
}

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

  // Escuela sin afectación vigente: la respuesta llega con `afectaciones: []`
  // o directamente sin el campo y con `parte: null`. En ambos casos hay que
  // decirlo con un texto explícito en vez de dejar la sección vacía, que se
  // lee como una pantalla rota o a medio cargar.
  const sinAfectaciones =
    afectacionesFicha !== null ? afectacionesFicha.length === 0 : datos?.parte === null

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

        {sinAfectaciones ? (
          <p
            className="estado-actual-bloque__vigencia ficha-parte-modal__sin-afectaciones"
            data-testid="ficha-parte-sin-afectaciones"
          >
            Sin afectaciones reportadas para esta escuela.
          </p>
        ) : afectacionesFicha !== null ? (
          <ul className="estado-actual-afectaciones">
            {afectacionesFicha.map((afectacion) => (
              <li key={afectacion.id} className="estado-actual-afectacion">
                <div className="estado-actual-afectacion__encabezado">
                  <span className="estado-actual-afectacion__motivo">{afectacion.motivo}</span>
                  <IndicadorSeveridadFicha severidad={afectacion.severidad} />
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
                    variant="ghost"
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
                  <IndicadorSeveridadFicha severidad={afectacion.severidad as Severidad} />
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
                    variant="ghost"
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

      {/* F3.2/V4: agregado del padrón GE para la escuela que la ruta devuelve
          para cualquier CUE del corte, tenga o no afectación vigente. Muestra
          nivel(es) educativo(s), matrícula total y cantidad de secciones; si
          la escuela no tiene datos en el corte vigente (`datosPadron: null`),
          lo dice explícitamente en vez de inventar ceros. Si una ruta vieja no
          manda el campo, el bloque no se muestra. */}
      {datos !== null && datos.datosPadron !== undefined && (
        <section
          className="estado-actual-bloque estado-actual-bloque--ancho"
          aria-labelledby="ficha-parte-datos-escuela"
        >
          <h3 className="estado-actual-bloque__titulo" id="ficha-parte-datos-escuela">
            Datos de la escuela
          </h3>
          {datos.datosPadron === null ? (
            <p
              className="estado-actual-bloque__vigencia"
              data-testid="ficha-parte-sin-padron"
            >
              Sin datos del padrón para esta escuela.
            </p>
          ) : (
            <>
              <p
                className="estado-actual-bloque__vigencia"
                data-testid="ficha-parte-padron-niveles"
              >
                {datos.datosPadron.niveles.length === 1
                  ? 'Nivel educativo'
                  : 'Niveles educativos'}
                : {datos.datosPadron.niveles.join(', ')}
              </p>
              <p
                className="estado-actual-bloque__vigencia"
                data-testid="ficha-parte-padron-matricula"
              >
                Matrícula total: {datos.datosPadron.matriculaTotal}{' '}
                {datos.datosPadron.matriculaTotal === 1 ? 'alumno' : 'alumnos'}
              </p>
              <p
                className="estado-actual-bloque__vigencia"
                data-testid="ficha-parte-padron-secciones"
              >
                {datos.datosPadron.secciones}{' '}
                {datos.datosPadron.secciones === 1 ? 'sección' : 'secciones'}
              </p>
              {datos.datosPadron.turnos.length > 0 && (
                <p
                  className="estado-actual-bloque__vigencia"
                  data-testid="ficha-parte-padron-turnos"
                >
                  Turnos: {datos.datosPadron.turnos.join(' · ')}
                </p>
              )}
            </>
          )}
        </section>
      )}

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

      {/* Q6e: puente interno para cargar o actualizar el parte de esta escuela.
          `/infraestructura/cargar` resuelve el CUE y confirma de qué escuela se
          trata antes de entrar al recorrido del director (que pide su propia
          contraseña). Se muestra siempre, tenga o no historial. */}
      <div>
        <a
          className="ui-button ui-button--secondary ui-button--sm"
          href={`/infraestructura/cargar?cue=${encodeURIComponent(cueAnexo)}`}
        >
          Cargar o actualizar el parte
        </a>
      </div>
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
  escuela,
  mostrarEnlaceNominal,
  onVerAlumnosAlcanzados,
  onVerHistorialCompleto,
  habilitado = false,
  accesoTerritorial,
}: {
  cueAnexo: string
  open: boolean
  onOpenChange: (open: boolean) => void
  parteResumen: ParteMapa | null
  // Q6a: identidad de la escuela tomada del padrón COMPLETO (afectada o no),
  // independiente de que exista un parte. Es la fuente del nombre/CUE/
  // localidad/departamento del encabezado; `null` sólo si la escuela no está
  // en el padrón cargado.
  escuela: {
    nombre: string
    cueAnexo: string
    localidad: string
    departamento: string
  } | null
  mostrarEnlaceNominal: boolean
  onVerAlumnosAlcanzados: (afectacionId: string) => void
  onVerHistorialCompleto: () => void
  // Flag server-side (E2): el padre decide si la ficha territorial corresponde
  // para esta escuela. Default `false` para no cambiar el comportamiento
  // existente de todo el mapa que ya usa este modal.
  habilitado?: boolean
  // Acceso territorial estático (aislamiento OSM + susceptibilidad physrisk +
  // ruta). Presentacional: el padre resuelve estos datos y su loading/error.
  // Opcional y gateado por `habilitado`; el mapa lo pasa en otra tarea, así
  // que su ausencia no cambia el modal actual.
  accesoTerritorial?: FichaAccesoTerritorialProps
}): JSX.Element | null {
  const cerrarRef = useRef<HTMLButtonElement>(null)

  // Foco accesible: al abrir, el foco entra al panel (al botón de cerrar, que
  // es el primer control). Sin el Dialog de @base-ui no hay focus trap ni
  // autofocus automático, así que se mueve a mano.
  useEffect(() => {
    if (!open) return
    cerrarRef.current?.focus()
  }, [open])

  // Cierre con Esc, sólo mientras el panel está abierto. Se limpia al cerrar
  // o desmontar para no dejar un listener colgado.
  useEffect(() => {
    if (!open) return
    const alPresionarTecla = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', alPresionarTecla)
    return () => window.removeEventListener('keydown', alPresionarTecla)
  }, [open, onOpenChange])

  if (!open) return null

  return (
    <div
      className="map-ficha-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="map-ficha-panel-titulo"
    >
      <div className="map-ficha-panel__encabezado">
        <h2 className="map-ficha-panel__titulo" id="map-ficha-panel-titulo">
          {escuela?.nombre ?? parteResumen?.nombre ?? 'Ficha del parte'}
        </h2>
        <button
          type="button"
          ref={cerrarRef}
          className="map-ficha-panel__cerrar"
          aria-label="Cerrar"
          onClick={() => onOpenChange(false)}
        >
          <X size={18} />
        </button>
      </div>
      <div className="ficha-parte-sheet__body">
        {parteResumen ? (
          <p className="estado-actual-bloque__vigencia">
            {parteResumen.localidad}, {parteResumen.departamento}
          </p>
        ) : escuela ? (
          <p className="estado-actual-bloque__vigencia">
            {escuela.cueAnexo} · {escuela.localidad}, {escuela.departamento}
          </p>
        ) : null}
        <FichaParteModalContenido
          key={cueAnexo}
          cueAnexo={cueAnexo}
          parteResumen={parteResumen}
          mostrarEnlaceNominal={mostrarEnlaceNominal}
          onVerAlumnosAlcanzados={onVerAlumnosAlcanzados}
          onVerHistorialCompleto={onVerHistorialCompleto}
        />
        {/* Ficha territorial compacta (E2). DENTRO del render condicionado a
            `open` a propósito: sus fetches no deben existir con el panel
            cerrado. El flag lo decide el padre; acá sólo se respeta. */}
        {habilitado && <FichaTerritorial cueAnexo={cueAnexo} />}
        {habilitado && accesoTerritorial && (
          <FichaAccesoTerritorial {...accesoTerritorial} />
        )}
      </div>
    </div>
  )
}
