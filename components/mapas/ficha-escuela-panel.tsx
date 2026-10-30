'use client'

import { ImpactoAlumnosResumen } from '@/components/infraestructura/impacto-alumnos-resumen'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { BookMinus, BookX, ChevronDown, Clock, DoorOpen, House, ShieldCheck, Utensils, X } from 'lucide-react'
import { ETIQUETA_COMEDOR } from '@/lib/infraestructura/comedores/estado'
import { ETIQUETA_POSIBLE_CENTRO, ETIQUETA_POSIBLE_CENTRO_SIN_ANTECEDENTES } from '@/lib/infraestructura/evacuacion/mapa'
import { EstadoActualSeveridad, TINTA_POR_SEVERIDAD } from '@/components/infraestructura/estado-actual-severidad'
import { ETIQUETA_ESTABLECIMIENTO, resumirAlcance } from '@/components/infraestructura/estado-actual-textos'
import { formatearMomentoHistorial } from '@/components/infraestructura/historial-formato'
import { CATEGORIA_META, esCategoria } from '@/lib/infraestructura/categorias'
import { contar } from '@/lib/infraestructura/parte/instituto-ui'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { presentarJustificacionCritica } from '@/lib/infraestructura/justificacion-critica'
import { prioridadEfectiva } from '@/lib/infraestructura/prioridad-alumnos'
import { ETIQUETA_ESTADO_CLASES, etiquetaDepartamento } from '@/lib/infraestructura/mapa/etiquetas'
import { etiquetaApoyoMapa, valorApoyoMapa } from '@/lib/infraestructura/mapa/etiqueta-apoyo'
import { tiempoRelativo } from '@/lib/infraestructura/mapa/tiempo-relativo'
import type { EscuelaMapaEnriquecida } from '@/lib/infraestructura/mapa/tipos'
import type { DatosInstitutoMapa } from '@/lib/infraestructura/parte-mapa'
import { SEVERIDADES } from '@/lib/infraestructura/validacion'
import { useFichaParte } from '@/lib/infraestructura/use-ficha-parte'
import { LineaDeTiempo } from '@/components/infraestructura/linea-de-tiempo'
import { FichaTerritorial, type EstadoVistaPeligro } from '@/components/infraestructura/ficha-territorial'
import { RiesgoEscuela } from '@/components/infraestructura/riesgo-escuela'
import type { HorizonteMotor } from '@/lib/infraestructura/mapa/radar'
import { situacionPrincipal } from '@/lib/infraestructura/relevancia'
import { desde } from '@/components/infraestructura/actualizar/entrada-actualizar'
import { BorradoresPendientes } from '@/components/infraestructura/borradores/borradores-pendientes'
import { GaleriaEvidencia } from '@/components/infraestructura/fotos/galeria-evidencia'
import { VistaPreviaEscuela, type VistaPreviaEscuelaProps } from './vista-previa-escuela'
import type { NivelAislamientoMapa } from '@/lib/infraestructura/territorio-mapa'
import { ObservacionReporte } from './observacion-reporte'

interface FichaEscuelaPanelProps {
  escuela: EscuelaMapaEnriquecida & Partial<DatosInstitutoMapa>
  acceso: ReactNode
  /** Botón del camino al centro de evacuados: visible en la vista previa y en la ficha, fuera del pliegue Acceso. */
  centroEvacuados?: ReactNode
  mostrarEnlaceNominal: boolean
  onCerrar: () => void
  onVerAlumnosAlcanzados: (afectacionId: string) => void
  onVerHistorialCompleto: () => void
  /** Mismo horizonte que la lista y los marcadores del Radar. */
  horizonteRiesgo?: HorizonteMotor
  /** Mismo nivel que la lista de Planificación para la vista activa. */
  planificacion?: { etiquetaVista: string; etiquetaNivel: string }[] | null
  borradoresServerCount?: number | null
  urlFichaCompleta?: string
  onAbrirFichaCompleta?: () => void
  onQuitarSeleccion?: () => void
  extraVistaPrevia?: ReactNode
  aislamiento?: NivelAislamientoMapa | null
  distanciaLocalidad?: VistaPreviaEscuelaProps['distanciaLocalidad']
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
      {escuela.posibleCentroEvacuados === true && (
        <span className="map-sitact__pill map-sitact__pill--posible-centro"><ShieldCheck aria-hidden="true" />{escuela.posibleCentroSinAntecedentes === true ? ETIQUETA_POSIBLE_CENTRO_SIN_ANTECEDENTES : ETIQUETA_POSIBLE_CENTRO}</span>
      )}
      {escuela.comedor !== undefined && (
        <span className={`map-sitact__pill ${escuela.comedor === 'sin_servicio' ? 'map-sitact__pill--neutro' : 'map-sitact__pill--apoyo'}`}>
          <Utensils aria-hidden="true" />{ETIQUETA_COMEDOR[escuela.comedor]}
        </span>
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
  centroEvacuados = null,
  mostrarEnlaceNominal,
  onCerrar,
  onVerAlumnosAlcanzados,
  onVerHistorialCompleto,
  horizonteRiesgo = 72,
  planificacion = null,
  borradoresServerCount = null,
  urlFichaCompleta,
  onAbrirFichaCompleta,
  onQuitarSeleccion,
  extraVistaPrevia = null,
  aislamiento = null,
  distanciaLocalidad = null,
}: FichaEscuelaPanelProps) {
  const { estado, historial } = useFichaParte(escuela.cueAnexo)
  const tituloRef = useRef<HTMLHeadingElement>(null)
  const [ahoraMs] = useState(() => Date.now())
  const datos = estado.fase === 'listo' ? estado.datos : null
  const afectaciones = datos?.afectaciones ?? []
  const recientes = datos?.recientes ?? []
  const principal = situacionPrincipal(afectaciones.map((afectacion) => ({
    ...afectacion,
    estadoEstablecimiento: datos?.parte?.estadoEstablecimiento ?? 'habitual',
  })))
  const categoria = principal
    ? CATEGORIA_META[principal.categoria].label
    : etiquetaCategoria(escuela.categoriaPrincipal)
  const severidad = datos
    ? (principal ? prioridadEfectiva(principal) : null)
    : escuela.gravedad === 0 ? null : SEVERIDADES[escuela.gravedad - 1]
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

  if (urlFichaCompleta) {
    return (
      <VistaPreviaEscuela
        escuela={{
          ...escuela,
          parte: datos?.parte
            ? {
                parteId: datos.parte.id,
                cueAnexo: escuela.cueAnexo,
                nombre: escuela.nombre,
                departamento: escuela.departamento,
                localidad: escuela.localidad,
                lat: escuela.lat,
                lon: escuela.lon,
                servicio:
                  datos?.servicio?.estadoGeneral ??
                  escuela.parte?.servicio ??
                  (escuela.clases === 'normal'
                    ? 'normal'
                    : escuela.clases === 'parcial'
                    ? 'parcial'
                    : 'suspendido'),
                estadoEstablecimiento: datos.parte.estadoEstablecimiento,
                peorSeveridad: severidad ?? '',
                categorias: Array.from(
                  new Set(afectaciones.map((a) => a.categoria)),
                ) as import('@/lib/infraestructura/categorias').CategoriaAfectacion[],
                afectaciones: afectaciones.map((a) => ({
                  id: a.id,
                  motivo: a.motivo,
                  categoria: a.categoria,
                  severidad: a.severidad,
                  ...(a.justificacionCritica
                    ? {
                        justificacionCritica: a.justificacionCritica,
                        ...(a.justificacionCritica === 'otro' && a.justificacionCriticaDetalle
                          ? { justificacionCriticaDetalle: a.justificacionCriticaDetalle }
                          : {}),
                      }
                    : {}),
                  impactoAlumnos: a.impactoAlumnos,
                  descripcion: a.descripcion,
                  rigeDesde: a.rigeDesde,
                  creadaEn: a.creadaEn,
                })),
                seccionesAlcanzadas: afectaciones.reduce((acc, a) => acc + (a.totales.secciones ?? 0), 0),
                alumnosDelHecho: afectaciones.reduce((acc, a) => acc + (a.totales.alumnos ?? 0), 0),
                alumnosAlcanzados: escuela.alumnos,
                rigeDesde: datos.parte.actualizadaEn,
                actualizadaEn: datos.parte.actualizadaEn,
              }
            : undefined,
          ubicacionDisponible: escuela.lat !== null && escuela.lon !== null,
        }}
        urlFichaCompleta={urlFichaCompleta}
        onCerrarVistaPrevia={onCerrar}
        onQuitarSeleccion={onQuitarSeleccion ?? (() => {})}
        extra={<>{extraVistaPrevia}{centroEvacuados}</>}
        aislamiento={aislamiento}
        distanciaLocalidad={distanciaLocalidad}
        onAbrirFichaCompleta={onAbrirFichaCompleta}
        cargandoParte={estado.fase === 'cargando'}
      />
    )
  }

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
            {escuela.carreras !== undefined
              ? ` · ${contar(escuela.carreras, 'carrera', 'carreras')}`
              : escuela.niveles.length > 0 && ` · ${escuela.niveles.join(', ')}`}
            {escuela.alumnos > 0 && ` · ${FORMATO_NUMERO.format(escuela.alumnos)} alumnos`}
          </p>
        </header>
      </div>

      {severidad ? (
        <div
          className="map-ficha-escuela__gravedad"
          style={{ backgroundColor: colorSeveridad(severidad), color: TINTA_POR_SEVERIDAD[severidad] }}
        >
          <strong>{(principal?.categoria ?? escuela.categoriaPrincipal) === 'alumnos' ? 'Prioridad' : 'Gravedad'} {severidad}</strong>
          <span>{principal ? `${categoria} · desde ${desde(principal.rigeDesde)}` : categoria}</span>
        </div>
      ) : (
        <p className="map-ficha-escuela__sin-reportes">{afectaciones.length ? 'Sin datos para calcular la prioridad' : 'Sin situaciones abiertas'}</p>
      )}

      <FilaEstado escuela={escuela} />

      <GaleriaEvidencia cue={escuela.cueAnexo} />

      <RiesgoEscuela cueAnexo={escuela.cueAnexo} horizonte={horizonteRiesgo} planificacion={planificacion} />

      {centroEvacuados}

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
                  const justificacionCritica = presentarJustificacionCritica(afectacion)
                return (
                  <div className="map-ficha-escuela__situacion" key={afectacion.id}>
                    <h3>{afectacion.motivo}</h3>
                    {afectacion.categoria === 'alumnos' ? <ImpactoAlumnosResumen impacto={afectacion.impactoAlumnos} /> : <EstadoActualSeveridad severidad={afectacion.severidad} />}
                    <dl className="map-ficha-escuela__kv">
                      <dt>Alcance</dt><dd>{resumirAlcance(afectacion.totales)}</dd>
                      {rigeDesde && <><dt>Desde</dt><dd>{rigeDesde}</dd></>}
                      {causadaPor && <><dt>Causada por</dt><dd>{causadaPor.motivo}</dd></>}
                      {justificacionCritica && <><dt>Justificación de gravedad</dt><dd>{justificacionCritica.etiqueta}</dd></>}
                      {justificacionCritica?.detalle && <><dt>Detalle de la justificación</dt><dd>{justificacionCritica.detalle}</dd></>}
                      <dt>Categoría</dt><dd>{CATEGORIA_META[afectacion.categoria].label}</dd>
                      {mostrarEnlaceNominal && escuela.carreras === undefined && (
                        <dd className="map-ficha-escuela__accion">
                          <button type="button" className="map-ficha-escuela__link" onClick={() => onVerAlumnosAlcanzados(afectacion.id)}>
                            Ver alumnos alcanzados
                          </button>
                        </dd>
                      )}
                    </dl>
                    <ObservacionReporte texto={afectacion.descripcion} />
                  </div>
                )
              })}
            </>
          )}
          {datos?.parte && novedad && <p><strong>Última novedad:</strong> {novedad}</p>}
          <button type="button" className="map-ficha-escuela__link" onClick={onVerHistorialCompleto}>Ver historial</button>
        </Desplegable>

        {borradoresServerCount !== null && borradoresServerCount > 0 && (
          <BorradoresPendientes key={escuela.cueAnexo} cue={escuela.cueAnexo} count={borradoresServerCount} />
        )}

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

      {urlFichaCompleta && (
        <Link
          className="ui-button ui-button--default ui-button--sm"
          href={urlFichaCompleta}
          onClick={onAbrirFichaCompleta}
          data-testid="abrir-ficha-completa"
        >
          Abrir ficha completa
        </Link>
      )}

      <a className="ui-button ui-button--secondary ui-button--sm" href={`/infraestructura/cargar?cue=${encodeURIComponent(escuela.cueAnexo)}`}>
        {escuela.gravedad > 0 || afectaciones.length > 0 ? 'Actualizar el parte' : 'Cargar una situación'}
      </a>

      {onQuitarSeleccion && (
        <button
          type="button"
          className="map-ficha-escuela__link"
          onClick={onQuitarSeleccion}
          data-testid="preview-quitar-seleccion"
        >
          Quitar selección
        </button>
      )}
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
