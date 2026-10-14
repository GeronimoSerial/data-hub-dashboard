'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BookMinus, BookX, ChevronDown, Clock, DoorOpen, House, X } from 'lucide-react'
import { EstadoActualSeveridad, TINTA_POR_SEVERIDAD } from '@/components/infraestructura/estado-actual-severidad'
import { ETIQUETA_ESTABLECIMIENTO, resumirAlcance } from '@/components/infraestructura/estado-actual-textos'
import { formatearMomentoHistorial } from '@/components/infraestructura/historial-formato'
import { CATEGORIA_META, esCategoria } from '@/lib/infraestructura/categorias'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { ETIQUETA_ESTADO_CLASES, etiquetaDepartamento } from '@/lib/infraestructura/mapa/etiquetas'
import { etiquetaApoyoMapa, valorApoyoMapa } from '@/lib/infraestructura/mapa/etiqueta-apoyo'
import { tiempoRelativo } from '@/lib/infraestructura/mapa/tiempo-relativo'
import type { EscuelaMapaEnriquecida } from '@/lib/infraestructura/mapa/tipos'
import { SEVERIDADES } from '@/lib/infraestructura/validacion'
import { useFichaParte } from '@/lib/infraestructura/use-ficha-parte'
import { LineaDeTiempo } from '@/components/infraestructura/linea-de-tiempo'
import { FichaTerritorial, type EstadoVistaPeligro } from '@/components/infraestructura/ficha-territorial'
import { RiesgoEscuela } from '@/components/infraestructura/riesgo-escuela'
import type { HorizonteMotor } from '@/lib/infraestructura/mapa/radar'
import { situacionPrincipal } from '@/lib/infraestructura/relevancia'
import { desde } from '@/components/infraestructura/actualizar/entrada-actualizar'

interface FichaEscuelaPanelProps {
  escuela: EscuelaMapaEnriquecida
  acceso: ReactNode
  mostrarEnlaceNominal: boolean
  onCerrar: () => void
  onVerAlumnosAlcanzados: (afectacionId: string) => void
  onVerHistorialCompleto: () => void
  /** Mismo horizonte que la lista y los marcadores del Radar. */
  horizonteRiesgo?: HorizonteMotor
  /** Mismo nivel que la lista de Planificación para la vista activa. */
  planificacion?: { etiquetaVista: string; etiquetaNivel: string }[] | null
}

const FORMATO_NUMERO = new Intl.NumberFormat('es-AR')

function IconoClases({ estado }: { estado: EscuelaMapaEnriquecida['clases'] }) {
  if (estado === 'sin') return <BookX aria-hidden="true" />
  if (estado === 'parcial') return <BookMinus aria-hidden="true" />
  if (estado === 'evacuado') return <DoorOpen aria-hidden="true" />
  if (estado === 'centro') return <House aria-hidden="true" />
  return null
}

function etiquetaCategoria(categoria: string | null): string | null {
  if (!categoria) return null
  return esCategoria(categoria) ? CATEGORIA_META[categoria].label : categoria
}

function FilaEstado({ escuela }: { escuela: EscuelaMapaEnriquecida }) {
  const etiquetaApoyo = etiquetaApoyoMapa(escuela.clases, escuela.apoyo)
  return (
    <div className="map-sitact__chips map-ficha-escuela__chips" aria-label="Estado de la escuela">
      {escuela.clases === 'normal' ? (
        <span className="map-sitact__pill map-sitact__pill--ok">{ETIQUETA_ESTADO_CLASES.normal}</span>
      ) : (
        <span className="map-sitact__pill map-sitact__pill--clases">
          <IconoClases estado={escuela.clases} />{ETIQUETA_ESTADO_CLASES[escuela.clases]}
        </span>
      )}
      {etiquetaApoyo && (
        <span className={`map-sitact__pill ${escuela.apoyo === 'no' ? 'map-sitact__pill--aviso' : escuela.apoyo === 'sin_dato' ? 'map-sitact__pill--neutro' : 'map-sitact__pill--apoyo'}`}>
          {etiquetaApoyo}
        </span>
      )}
      {escuela.sinActualizar && (
        <span className="map-sitact__pill map-sitact__pill--neutro"><Clock aria-hidden="true" />Sin actualizar</span>
      )}
    </div>
  )
}

function Desplegable({
  children,
  titulo,
  abierto = false,
}: {
  children: ReactNode
  titulo: string
  abierto?: boolean
}) {
  return (
    <details className="map-ficha-escuela__fold" open={abierto || undefined}>
      <summary>{titulo}<ChevronDown aria-hidden="true" /></summary>
      <div className="map-ficha-escuela__fold-body">{children}</div>
    </details>
  )
}

export function FichaEscuelaPanel({
  escuela,
  acceso,
  mostrarEnlaceNominal,
  onCerrar,
  onVerAlumnosAlcanzados,
  onVerHistorialCompleto,
  horizonteRiesgo = 72,
  planificacion = null,
}: FichaEscuelaPanelProps) {
  const { estado, historial } = useFichaParte(escuela.cueAnexo)
  const tituloRef = useRef<HTMLHeadingElement>(null)
  const [ahoraMs] = useState(() => Date.now())
  const datos = estado.fase === 'listo' ? estado.datos : null
  const afectaciones = datos?.afectaciones ?? []
  const recientes = datos?.recientes ?? []
  const severidad = escuela.gravedad === 0 ? null : SEVERIDADES[escuela.gravedad - 1]
  const principal = situacionPrincipal(afectaciones.map((afectacion) => ({
    ...afectacion,
    estadoEstablecimiento: datos?.parte?.estadoEstablecimiento ?? 'habitual',
  })))
  const categoria = principal
    ? CATEGORIA_META[principal.categoria].label
    : etiquetaCategoria(escuela.categoriaPrincipal)
  const novedad = datos?.parte?.actualizadaEn
    ? tiempoRelativo(datos.parte.actualizadaEn, ahoraMs)
    : ''
  useEffect(() => {
    tituloRef.current?.focus()
    const alPresionarTecla = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCerrar()
    }
    window.addEventListener('keydown', alPresionarTecla)
    return () => window.removeEventListener('keydown', alPresionarTecla)
  }, [onCerrar])

  return (
    <section className="map-ficha-escuela" aria-label={`Ficha de ${escuela.nombre}`}>
      <div className="map-ficha-escuela__encabezado-fijo">
        <button className="map-cerrar map-ficha-escuela__cerrar" type="button" aria-label="Cerrar ficha" onClick={onCerrar}>
          <X aria-hidden="true" />
        </button>

        <header className="map-ficha-escuela__head">
          <h2 ref={tituloRef} tabIndex={-1}>{escuela.nombre}</h2>
          <p>
            CUE {escuela.cueAnexo} · {etiquetaDepartamento(escuela.departamento)}
            {escuela.niveles.length > 0 && ` · ${escuela.niveles.join(', ')}`}
            {escuela.alumnos > 0 && ` · ${FORMATO_NUMERO.format(escuela.alumnos)} alumnos`}
          </p>
        </header>
      </div>

      {severidad ? (
        <div
          className="map-ficha-escuela__gravedad"
          style={{ backgroundColor: colorSeveridad(severidad), color: TINTA_POR_SEVERIDAD[severidad] }}
        >
          <strong>Gravedad {severidad}</strong>
          <span>{principal ? `${categoria} · desde ${desde(principal.rigeDesde)}` : categoria}</span>
        </div>
      ) : (
        <p className="map-ficha-escuela__sin-reportes">Sin situaciones abiertas</p>
      )}

      <FilaEstado escuela={escuela} />

      <RiesgoEscuela cueAnexo={escuela.cueAnexo} horizonte={horizonteRiesgo} planificacion={planificacion} />

      <div>
        <Desplegable titulo="Acceso" abierto>
          {acceso}
        </Desplegable>

        <Desplegable titulo="Clases y asistencia pedagógica" abierto={escuela.clases !== 'normal'}>
          <dl className="map-ficha-escuela__kv">
            <dt>Clases</dt><dd>{ETIQUETA_ESTADO_CLASES[escuela.clases]}</dd>
            <dt>Asistencia pedagógica</dt><dd>{valorApoyoMapa(escuela.clases, escuela.apoyo) ?? 'No corresponde'}</dd>
            <dt>Alumnos</dt><dd>{FORMATO_NUMERO.format(escuela.alumnos)}</dd>
            {datos?.parte && afectaciones.some((afectacion) => afectacion.categoria === 'establecimiento') && <><dt>Edificio</dt><dd>{ETIQUETA_ESTABLECIMIENTO[datos.parte.estadoEstablecimiento]}</dd></>}
          </dl>
        </Desplegable>

        <Desplegable titulo={estado.fase === 'listo' ? `Situaciones (${afectaciones.length} ${afectaciones.length === 1 ? 'abierta' : 'abiertas'})` : 'Situaciones'}>
          {estado.fase === 'cargando' ? (
            <p role="status">Cargando…</p>
          ) : estado.fase === 'error' ? (
            <p role="alert">No se pudo cargar la información de la escuela.</p>
          ) : afectaciones.length === 0 ? (
            <p>Sin situaciones abiertas.</p>
          ) : (
            <>
              {afectaciones.map((afectacion) => {
                const causadaPor = afectaciones.find((otra) => otra.id === afectacion.causadaPorId)
                const rigeDesde = formatearMomentoHistorial(afectacion.rigeDesde).replace(/^Hoy/, 'hoy')
                return (
                  <div className="map-ficha-escuela__situacion" key={afectacion.id}>
                    <h3>{afectacion.motivo}</h3>
                    <EstadoActualSeveridad severidad={afectacion.severidad} />
                    <dl className="map-ficha-escuela__kv">
                      <dt>Alcance</dt><dd>{resumirAlcance(afectacion.totales)}</dd>
                      {rigeDesde && <><dt>Desde</dt><dd>{rigeDesde}</dd></>}
                      {causadaPor && <><dt>Causada por</dt><dd>{causadaPor.motivo}</dd></>}
                      {afectacion.descripcion && <><dt>Descripción</dt><dd>{afectacion.descripcion}</dd></>}
                      <dt>Categoría</dt><dd>{CATEGORIA_META[afectacion.categoria].label}</dd>
                      {mostrarEnlaceNominal && (
                        <dd className="map-ficha-escuela__accion">
                          <button type="button" className="map-ficha-escuela__link" onClick={() => onVerAlumnosAlcanzados(afectacion.id)}>
                            Ver alumnos alcanzados
                          </button>
                        </dd>
                      )}
                    </dl>
                  </div>
                )
              })}
            </>
          )}
          {datos?.parte && novedad && <p><strong>Última novedad:</strong> {novedad}</p>}
          <button type="button" className="map-ficha-escuela__link" onClick={onVerHistorialCompleto}>Ver historial</button>
        </Desplegable>

        {recientes.length > 0 && (
          <Desplegable titulo={`Solucionadas recientemente (${recientes.length})`} abierto={afectaciones.length === 0}>
            {recientes.map((solucionada) => {
              const retiradaEn = formatearMomentoHistorial(solucionada.retiradaEn).replace(/^Hoy/, 'hoy')
              return (
                <div className="map-ficha-escuela__situacion" key={solucionada.id}>
                  <h3>{solucionada.motivo}</h3>
                  <dl className="map-ficha-escuela__kv">
                    <dt>Gravedad que tenía</dt><dd><EstadoActualSeveridad severidad={solucionada.severidad} prefijo={false} /></dd>
                    <dt>Solucionada</dt><dd>{retiradaEn}</dd>
                  </dl>
                </div>
              )
            })}
          </Desplegable>
        )}

        <Desplegable titulo="Historial">
          {historial.fase === 'cargando' ? (
            <p role="status">Cargando…</p>
          ) : historial.fase === 'error' ? (
            <p role="alert">No se pudo cargar la información de la escuela.</p>
          ) : (
            <>
              <p>{escuela.situacionesHistoricas === 0
                ? 'Sin situaciones registradas'
                : `${escuela.situacionesHistoricas} ${escuela.situacionesHistoricas === 1 ? 'situación registrada' : 'situaciones registradas'}`}</p>
              {historial.movimientos.length > 0 && <LineaDeTiempo movimientos={historial.movimientos} limite={5} />}
            </>
          )}
        </Desplegable>

        <SeccionPeligro cueAnexo={escuela.cueAnexo} localidad={escuela.localidad} />
      </div>

      <a className="ui-button ui-button--secondary ui-button--sm" href={`/infraestructura/cargar?cue=${encodeURIComponent(escuela.cueAnexo)}`}>
        {escuela.gravedad > 0 ? 'Actualizar el parte' : 'Cargar una situación'}
      </a>
    </section>
  )
}

function SeccionPeligro({ cueAnexo, localidad }: { cueAnexo: string; localidad: string }) {
  const [estadoPeligro, setEstadoPeligro] = useState<EstadoVistaPeligro>('cargando')
  return (
    <section className="map-ficha-escuela__situacion">
      <details open={estadoPeligro !== 'sin_datos'}>
        <summary>
          <h3>Lluvia y río: datos de apoyo</h3>
        </summary>
        <FichaTerritorial cueAnexo={cueAnexo} localidad={localidad} onEstado={setEstadoPeligro} />
      </details>
    </section>
  )
}
