'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowUpRight, Clock, Cloud, MapPinOff } from 'lucide-react'
import { EstadoActualSeveridad } from '@/components/infraestructura/estado-actual-severidad'
import { ETIQUETA_ESTABLECIMIENTO, resumirAlcance } from '@/components/infraestructura/estado-actual-textos'
import { formatearMomentoHistorial } from '@/components/infraestructura/historial-formato'
import { CATEGORIA_META } from '@/lib/infraestructura/categorias'
import { contar } from '@/lib/infraestructura/parte/instituto-ui'
import { ETIQUETA_ESTADO_CLASES, etiquetaDepartamento } from '@/lib/infraestructura/mapa/etiquetas'
import { valorApoyoMapa } from '@/lib/infraestructura/mapa/etiqueta-apoyo'
import { tiempoRelativo } from '@/lib/infraestructura/mapa/tiempo-relativo'
import { SEVERIDADES } from '@/lib/infraestructura/validacion'
import { useFichaParte } from '@/lib/infraestructura/use-ficha-parte'
import { LineaDeTiempo } from '@/components/infraestructura/linea-de-tiempo'
import { FichaTerritorial } from '@/components/infraestructura/ficha-territorial'
import { RiesgoEscuela } from '@/components/infraestructura/riesgo-escuela'
import { situacionPrincipal } from '@/lib/infraestructura/relevancia'
import { desde } from '@/components/infraestructura/actualizar/entrada-actualizar'
import { BorradoresPendientes } from '@/components/infraestructura/borradores/borradores-pendientes'
import { useDraftCounts } from '@/components/infraestructura/borradores/use-draft-counts'
import { GaleriaEvidencia } from '@/components/infraestructura/fotos/galeria-evidencia'
import { AlcanceNominalModal } from '@/components/infraestructura/alcance-nominal-modal'
import { BloqueAcceso } from '@/components/mapas/bloque-acceso'
import { useTerritorioMapa } from '@/lib/infraestructura/use-territorio-mapa'
import { useGeometriaAcceso } from '@/lib/infraestructura/use-geometria-acceso'
import { useExposicionRuta } from '@/lib/infraestructura/use-exposicion-ruta'
import { claseInundacion } from '@/lib/mapas/accesos-capas'
import {
  ETIQUETA_NIVEL_PLAN,
  nivelPlanificacion,
  TITULO_LEYENDA_VISTA,
  VISTAS_ESTRUCTURALES,
} from '@/lib/infraestructura/mapa/planificacion'
import type { EscuelaFichaEnriquecida } from '@/lib/infraestructura/parte-mapa'
import { FILTROS_MAPA_VACIOS, type FiltrosMapa, type PestanaMapa } from '@/lib/infraestructura/mapa/tipos'
import {
  construirUrlFichaEscuela,
  construirUrlRetornoMapa,
  leerSnapshotRetornoMapa,
  parsearContextoMapaDeQuery,
} from '@/lib/infraestructura/mapa/estado-retorno'
import styles from './ficha-escuela-pagina.module.css'

export interface FichaEscuelaPaginaProps {
  escuela: EscuelaFichaEnriquecida
  mostrarEnlaceNominal: boolean
  hazardContextEnabled?: boolean
  searchParams?: Record<string, string | string[] | undefined>
}

const FORMATO_NUMERO = new Intl.NumberFormat('es-AR')


export function FichaEscuelaPagina({
  escuela,
  mostrarEnlaceNominal,
  hazardContextEnabled = false,
  searchParams = {},
}: FichaEscuelaPaginaProps) {
  const { estado, historial } = useFichaParte(escuela.cueAnexo)
  const borradoresMapa = useDraftCounts()
  const { data: territorio } = useTerritorioMapa(hazardContextEnabled)
  const {
    data: geometria,
    loading: geometriaLoading,
    error: geometriaError,
  } = useGeometriaAcceso(escuela.cueAnexo, hazardContextEnabled)
  const {
    data: exposicion,
    loading: exposicionLoading,
  } = useExposicionRuta(escuela.cueAnexo, hazardContextEnabled)

  const [nominalAfectacionId, setNominalAfectacionId] = useState<string | null>(null)
  // El "ahora" se fija en el cliente; en SSR/hidratación queda en null para no desfasar el HTML.
  const montado = useSyncExternalStore(suscribirSinCambios, () => true, () => false)
  const [ahoraClienteMs] = useState(() => Date.now())
  const ahoraMs = montado ? ahoraClienteMs : null
  const [pestanaActiva, setPestanaActiva] = useState('panorama')
  const [altoCabecera, setAltoCabecera] = useState(0)
  const cabeceraRef = useRef<HTMLDivElement>(null)
  // While a tab-triggered smooth scroll runs, the scroll spy must not override the clicked tab.
  const scrollPorClickRef = useRef<number | null>(null)

  useEffect(() => {
    const cabecera = cabeceraRef.current
    if (!cabecera || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setAltoCabecera(cabecera.offsetHeight))
    observer.observe(cabecera)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const ids = ['panorama', 'situaciones', 'territorio', 'historial']
    function alScroll() {
      if (scrollPorClickRef.current !== null) return
      const limite = (cabeceraRef.current?.getBoundingClientRect().bottom ?? 0) + 24
      let activa = ids[0]
      let mejorTop = -Infinity
      for (const id of ids) {
        const top = document.getElementById(id)?.getBoundingClientRect().top
        if (top === undefined || top > limite) continue
        if (top > mejorTop + 1) {
          mejorTop = top
          activa = id
        }
      }
      setPestanaActiva(activa)
    }
    document.addEventListener('scroll', alScroll, { capture: true, passive: true })
    return () => document.removeEventListener('scroll', alScroll, { capture: true })
  }, [])

  function irASeccion(evento: MouseEvent<HTMLAnchorElement>, id: string) {
    const destino = document.getElementById(id)
    if (!destino) return
    evento.preventDefault()
    setPestanaActiva(id)
    const reducido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    destino.scrollIntoView({ behavior: reducido ? 'auto' : 'smooth', block: 'start' })
    window.history.replaceState(null, '', `#${id}`)
    if (scrollPorClickRef.current !== null) window.clearTimeout(scrollPorClickRef.current)
    scrollPorClickRef.current = window.setTimeout(() => {
      scrollPorClickRef.current = null
    }, 800)
  }

  const contextoQuery = useMemo(
    () => parsearContextoMapaDeQuery(searchParams),
    [searchParams],
  )

  const contextoEfectivo = useMemo(() => {
    const filtrosDeQuery: FiltrosMapa = {
      ...FILTROS_MAPA_VACIOS,
      ...contextoQuery.filtrosParciales,
    }
    if (contextoQuery.origen === 'mapa') {
      return {
        desdeMapa: true,
        tab: (contextoQuery.tab ?? 'actual') as PestanaMapa,
        filtros: filtrosDeQuery,
        horizonte: contextoQuery.horizonte ?? undefined,
        variable: contextoQuery.variable ?? undefined,
        vista: contextoQuery.vista ?? undefined,
      }
    }
    const snapshot = leerSnapshotRetornoMapa()
    if (snapshot && snapshot.seleccionCue === escuela.cueAnexo) {
      return {
        desdeMapa: true,
        tab: snapshot.tab,
        filtros: snapshot.filtros,
        horizonte: snapshot.horizonteSeleccionado,
        variable: snapshot.variableRadar,
        vista: snapshot.vistaPlanificacion,
      }
    }
    return {
      desdeMapa: false,
      tab: (contextoQuery.tab ?? 'actual') as PestanaMapa,
      filtros: filtrosDeQuery,
      horizonte: contextoQuery.horizonte ?? undefined,
      variable: contextoQuery.variable ?? undefined,
      vista: contextoQuery.vista ?? undefined,
    }
  }, [contextoQuery, escuela.cueAnexo])

  const vieneDelMapa = contextoEfectivo.desdeMapa

  const urlRetornoMapa = useMemo(
    () =>
      construirUrlRetornoMapa({
        cueAnexo: escuela.cueAnexo,
        tab: contextoEfectivo.tab,
        filtros: contextoEfectivo.filtros,
        horizonte: contextoEfectivo.horizonte,
        variable: contextoEfectivo.variable,
        vista: contextoEfectivo.vista,
      }),
    [escuela.cueAnexo, contextoEfectivo],
  )

  const urlActualFicha = useMemo(
    () =>
      construirUrlFichaEscuela(
        escuela.cueAnexo,
        vieneDelMapa
          ? {
              tab: contextoEfectivo.tab,
              filtros: contextoEfectivo.filtros,
              horizonte: contextoEfectivo.horizonte,
              variable: contextoEfectivo.variable,
              vista: contextoEfectivo.vista,
              desdeMapa: true,
            }
          : undefined,
      ),
    [escuela.cueAnexo, vieneDelMapa, contextoEfectivo],
  )

  const urlCargarParte = `/infraestructura/cargar?cue=${encodeURIComponent(
    escuela.cueAnexo,
  )}&volver=${encodeURIComponent(urlActualFicha)}`

  const datos = estado.fase === 'listo' ? estado.datos : null
  const afectaciones = datos?.afectaciones ?? []
  const recientes = datos?.recientes ?? []
  const severidad = escuela.gravedad === 0 ? null : SEVERIDADES[escuela.gravedad - 1]

  const principal =
    afectaciones.length > 0
      ? situacionPrincipal(
          afectaciones.map((afectacion) => ({
            ...afectacion,
            estadoEstablecimiento: datos?.parte?.estadoEstablecimiento ?? 'habitual',
          })),
        )
      : escuela.parte && escuela.parte.afectaciones.length > 0
        ? situacionPrincipal(
            escuela.parte.afectaciones.map((afectacion) => ({
              ...afectacion,
              estadoEstablecimiento: escuela.parte?.estadoEstablecimiento ?? 'habitual',
            })),
          )
        : null


  const ultimaActualizacionIso =
    datos?.parte?.actualizadaEn ?? escuela.parte?.actualizadaEn ?? escuela.ultimaNovedad
  const novedadRelativa =
    ultimaActualizacionIso && ahoraMs !== null
      ? tiempoRelativo(ultimaActualizacionIso, ahoraMs)
      : null

  const sinUbicacion =
    !escuela.ubicacionDisponible || escuela.lat === null || escuela.lon === null

  const borradoresCount = borradoresMapa.error
    ? null
    : (borradoresMapa.counts.get(escuela.cueAnexo) ?? (borradoresMapa.loading ? null : 0))

  const planificacion = useMemo(
    () =>
      VISTAS_ESTRUCTURALES.map((vista) => ({
        etiquetaVista: TITULO_LEYENDA_VISTA[vista],
        etiquetaNivel:
          vista === 'historial'
            ? `${ETIQUETA_NIVEL_PLAN[nivelPlanificacion(escuela, vista, { territorio })]} (${escuela.situacionesHistoricas})`
            : ETIQUETA_NIVEL_PLAN[nivelPlanificacion(escuela, vista, { territorio })],
      })),
    [escuela, territorio],
  )

  const ubicacionTexto = [
    escuela.localidad ? escuela.localidad.trim() : null,
    etiquetaDepartamento(escuela.departamento),
  ]
    .filter(Boolean)
    .join(', ')

  const tieneSituacionActiva = escuela.gravedad > 0 || afectaciones.length > 0
  const tieneParteRegistrado = Boolean(escuela.parte || datos?.parte)

  const incidente =
    afectaciones.length > 0
      ? (afectaciones.find((afectacion) => afectacion.id === principal?.id) ?? afectaciones[0])
      : null
  const otrasAfectaciones = afectaciones.filter((afectacion) => afectacion.id !== incidente?.id)
  const severidadIncidente = incidente?.severidad ?? severidad
  const estadoEdificio = tieneParteRegistrado
    ? ETIQUETA_ESTABLECIMIENTO[
        datos?.parte?.estadoEstablecimiento ?? escuela.parte?.estadoEstablecimiento ?? 'habitual'
      ]
    : 'Sin parte registrado'
  // Photos attach to the latest report movement; evidence-only movements cannot be a base.
  const movimientoBaseEvidencia =
    historial.fase === 'listo'
      ? ([...historial.movimientos]
          .filter((movimiento) => (movimiento.tipo as string) !== 'evidencia_fotografica')
          .sort((a, b) => b.creadaEn.localeCompare(a.creadaEn))[0]?.id ?? null)
      : null
  const etiquetaAlumnos = escuela.alumnos === 1 ? 'alumno' : 'alumnos'
  // Institutos superiores: la ficha cuenta carreras y no muestra nombres de alumnos.
  const esInstituto = escuela.carreras !== undefined

  const verAlumnos = (afectacionId: string, className: string) =>
    mostrarEnlaceNominal && !esInstituto ? (
      <button
        type="button"
        className={className}
        data-testid={`ver-alumnos-${afectacionId}`}
        onClick={() => setNominalAfectacionId(afectacionId)}
      >
        Ver alumnos alcanzados
        <ArrowUpRight size={13} aria-hidden="true" />
      </button>
    ) : null

  const pestanas = [
    { id: 'panorama', etiqueta: 'Panorama' },
    {
      id: 'situaciones',
      etiqueta: estado.fase === 'listo' ? `Situaciones (${afectaciones.length})` : 'Situaciones',
    },
    { id: 'territorio', etiqueta: 'Territorio y clima' },
    { id: 'historial', etiqueta: 'Historial' },
  ]

  return (
    <main
      className={styles.page}
      aria-label={`Ficha completa de ${escuela.nombre}`}
      style={{ '--ficha-cabecera-h': `${altoCabecera}px` } as CSSProperties}
    >
      <nav className={styles.topBar} aria-label="Navegación superior">
        <Link href={urlRetornoMapa} className={styles.backLink} data-testid="volver-al-mapa">
          <ArrowLeft size={14} aria-hidden="true" />
          <span>{vieneDelMapa ? 'Volver al mapa' : 'Ir al mapa'}</span>
        </Link>
        <span className={styles.topBarLabel}>Detalle del establecimiento</span>
      </nav>

      <div ref={cabeceraRef} className={styles.cabecera}>
        <header className={styles.header}>
          <div className={styles.identity}>
            <h1 className={styles.schoolTitle}>{escuela.nombre}</h1>
            <div className={styles.schoolMeta}>
              <p>
                {[ubicacionTexto, `CUE ${escuela.cueAnexo}`].filter(Boolean).join(' · ')}
              </p>
              <p>
                {[
                  esInstituto
                    ? contar(escuela.carreras ?? 0, 'carrera', 'carreras')
                    : escuela.niveles.length > 0 ? escuela.niveles.join(', ') : null,
                  `${FORMATO_NUMERO.format(escuela.alumnos)} ${etiquetaAlumnos} matriculados`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            {sinUbicacion && (
              <div className={styles.sinUbicacionBanner} data-testid="ficha-sin-ubicacion">
                <MapPinOff size={14} aria-hidden="true" />
                <span>Ubicación no disponible en el mapa</span>
              </div>
            )}
          </div>
          <Link
            href={urlCargarParte}
            className={styles.primaryAction}
            data-testid="accion-actualizar-parte"
          >
            {tieneSituacionActiva ? 'Actualizar el parte' : 'Cargar una situación'}
            <ArrowUpRight size={14} aria-hidden="true" className={styles.primaryActionIcono} />
          </Link>
        </header>

        <nav className={styles.tabs} aria-label="Secciones de la ficha">
          {pestanas.map((pestana) => (
            <a
              key={pestana.id}
              href={`#${pestana.id}`}
              className={styles.tab}
              aria-current={pestanaActiva === pestana.id ? 'true' : undefined}
              onClick={(evento) => irASeccion(evento, pestana.id)}
            >
              {pestana.etiqueta}
            </a>
          ))}
        </nav>
      </div>

      <div className={styles.mainGrid}>
        <div id="panorama" className={styles.column}>
          {borradoresCount !== null && borradoresCount > 0 && (
            <BorradoresPendientes
              key={escuela.cueAnexo}
              cue={escuela.cueAnexo}
              count={borradoresCount}
            />
          )}

          <section id="situaciones" className={styles.situaciones} aria-label="Situaciones">
            {estado.fase === 'cargando' ? (
              <p role="status" className={styles.emptyState}>
                Cargando situaciones del parte…
              </p>
            ) : estado.fase === 'error' ? (
              <p role="alert" className={styles.emptyState}>
                No se pudo cargar la información operativa de la escuela.
              </p>
            ) : incidente ? (
              <article className={styles.incidente} data-testid="ficha-incidente">
                <span className={styles.incidenteBadge}>
                  <span
                    className={styles.incidenteDot}
                    aria-hidden="true"
                  />
                  Situación activa · Gravedad {incidente.severidad.toLowerCase()}
                </span>
                <h2 className={styles.incidenteTitulo}>{incidente.motivo}</h2>
                <p className={styles.incidenteTexto}>
                  {incidente.descripcion ?? CATEGORIA_META[incidente.categoria].label}
                </p>
                <div className={styles.incidenteMetricas}>
                  <div>
                    <p className={styles.metricaValor}>
                      <span className={styles.metricaNumero}>
                        {FORMATO_NUMERO.format(incidente.totales.alumnos)}
                      </span>{' '}
                      / {FORMATO_NUMERO.format(escuela.alumnos)} {etiquetaAlumnos}
                    </p>
                    <p className={styles.metricaCaption}>Alcanzados por la situación</p>
                    <BarraAlumnos afectados={incidente.totales.alumnos} total={escuela.alumnos} />
                  </div>
                  <div className={styles.incidenteDetalle}>
                    <p className={styles.incidenteDetalleFuerte}>
                      {esInstituto
                        ? contar(incidente.totales.carreras ?? 0, 'carrera', 'carreras')
                        : incidente.totales.secciones === 1
                          ? '1 sección'
                          : `${incidente.totales.secciones} secciones`}
                    </p>
                    <p>Desde {desde(incidente.rigeDesde)}</p>
                    {verAlumnos(incidente.id, styles.linkSubrayado)}
                  </div>
                </div>
              </article>
            ) : (
              <div className={styles.emptyState}>
                {tieneParteRegistrado ? (
                  <p data-testid="ficha-sin-situaciones">Sin situaciones abiertas reportadas</p>
                ) : (
                  <p data-testid="ficha-sin-reporte">
                    Sin reporte activo (la ausencia de reporte no confirma normalidad)
                  </p>
                )}
              </div>
            )}

            {otrasAfectaciones.length > 0 && (
              <div className={styles.listaSecundaria}>
                <h3 className={styles.sectionTitleSmall}>
                  Otras situaciones abiertas ({otrasAfectaciones.length})
                </h3>
                {otrasAfectaciones.map((afectacion) => {
                  const causadaPor = afectaciones.find((otra) => otra.id === afectacion.causadaPorId)
                  return (
                    <article className={styles.itemSecundario} key={afectacion.id}>
                      <div className={styles.itemSecundarioTop}>
                        <h4 className={styles.itemSecundarioTitulo}>{afectacion.motivo}</h4>
                        <EstadoActualSeveridad severidad={afectacion.severidad} />
                      </div>
                      <p className={styles.itemSecundarioTexto}>
                        {[
                          resumirAlcance(afectacion.totales),
                          `desde ${desde(afectacion.rigeDesde)}`,
                          causadaPor ? `causada por ${causadaPor.motivo}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      {verAlumnos(afectacion.id, styles.linkAccion)}
                    </article>
                  )
                })}
              </div>
            )}

            {recientes.length > 0 && (
              <div className={styles.listaSecundaria}>
                <h3 className={styles.sectionTitleSmall}>
                  Solucionadas recientemente ({recientes.length})
                </h3>
                {recientes.map((solucionada) => (
                  <article className={styles.itemSecundario} key={solucionada.id}>
                    <div className={styles.itemSecundarioTop}>
                      <h4 className={styles.itemSecundarioTitulo}>{solucionada.motivo}</h4>
                      <EstadoActualSeveridad severidad={solucionada.severidad} prefijo={false} />
                    </div>
                    <p className={styles.itemSecundarioTexto}>
                      Solucionada {formatearMomentoHistorial(solucionada.retiradaEn).replace(/^Hoy/, 'hoy')}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className={styles.section} aria-labelledby="titulo-continuidad">
            <h3 id="titulo-continuidad" className={styles.sectionTitle}>
              Continuidad educativa
            </h3>
            <dl className={styles.continuidad}>
              <div>
                <dt>Clases</dt>
                <dd>{ETIQUETA_ESTADO_CLASES[escuela.clases]}</dd>
              </div>
              <div>
                <dt>Edificio</dt>
                <dd>{estadoEdificio}</dd>
              </div>
              <div>
                <dt>Asistencia</dt>
                <dd>{valorApoyoMapa(escuela.clases, escuela.apoyo) ?? 'No corresponde'}</dd>
              </div>
            </dl>
            {severidadIncidente && escuela.clases === 'normal' && (
              <p className={styles.notaPie}>
                El funcionamiento habitual corresponde al estado informado en el parte. Las
                situaciones activas se registran por separado.
              </p>
            )}
          </section>

          <div id="evidencia" className={styles.anchor}>
            <GaleriaEvidencia
              cue={escuela.cueAnexo}
              movimientoBaseId={movimientoBaseEvidencia}
              urlCargarParte={urlCargarParte}
            />
          </div>

          <section
            id="historial"
            className={styles.section}
            aria-labelledby="titulo-historial"
            data-testid="seccion-historial-inline"
          >
            <div className={styles.sectionHeader}>
              <h3 id="titulo-historial" className={styles.sectionTitle}>
                Actividad reciente
              </h3>
              <span className={styles.sectionMeta}>
                {escuela.situacionesHistoricas === 0
                  ? 'Sin situaciones históricas'
                  : `${FORMATO_NUMERO.format(escuela.situacionesHistoricas)} ${
                      escuela.situacionesHistoricas === 1
                        ? 'situación registrada'
                        : 'situaciones registradas'
                    }`}
              </span>
            </div>
            {historial.fase === 'cargando' ? (
              <p role="status" className={styles.emptyState}>
                Cargando historial…
              </p>
            ) : historial.fase === 'error' ? (
              <p role="alert" className={styles.emptyState}>
                No se pudo cargar el historial de movimientos.
              </p>
            ) : historial.movimientos.length === 0 ? (
              <p className={styles.emptyState}>
                No hay movimientos registrados para este establecimiento.
              </p>
            ) : (
              <div className={styles.historial}>
                <LineaDeTiempo movimientos={historial.movimientos} limite={10} />
              </div>
            )}
          </section>
        </div>

        <aside id="territorio" className={styles.column} aria-label="Territorio y clima">
          <section className={styles.section} aria-labelledby="titulo-riesgo">
            <h3 id="titulo-riesgo" className={styles.sectionTitleSmall}>
              Riesgo de la escuela
            </h3>
            <RiesgoEscuela cueAnexo={escuela.cueAnexo} horizonte={72} planificacion={planificacion} />
          </section>
          <section className={styles.climaCard} aria-labelledby="titulo-clima">
            <div className={styles.sectionHeader}>
              <h3 id="titulo-clima" className={styles.sectionTitleSmall}>
                Pronóstico en la escuela
              </h3>
              <Cloud size={20} strokeWidth={1.6} aria-hidden="true" className={styles.climaIcono} />
            </div>
            <p className={styles.sectionMeta}>Condiciones previstas · 72 horas</p>
            <FichaTerritorial cueAnexo={escuela.cueAnexo} localidad={escuela.localidad} />
          </section>

          <section className={styles.section} aria-labelledby="titulo-ubicacion">
            <div className={styles.sectionHeader}>
              <h3 id="titulo-ubicacion" className={styles.sectionTitleSmall}>
                Ubicación
              </h3>
              <Link
                href={`/mapas/infraestructura?cue=${encodeURIComponent(escuela.cueAnexo)}&enfocar=1#actual`}
                className={styles.linkAccion}
                data-testid="abrir-mapa"
              >
                Abrir mapa
                <ArrowUpRight size={13} aria-hidden="true" />
              </Link>
            </div>
            <div className={styles.direccion}>
              <p className={styles.direccionFuerte}>{escuela.localidad?.trim() || 'Sin localidad'}</p>
              <p>{etiquetaDepartamento(escuela.departamento)}, Corrientes</p>
              {!sinUbicacion && (
                <p className={styles.coordenadas}>
                  {escuela.lat?.toFixed(4)}, {escuela.lon?.toFixed(4)}
                </p>
              )}
            </div>
            <BloqueAcceso
              geometria={geometria}
              exposicion={exposicion}
              claseEscuela={claseInundacion(
                territorio?.susceptibilidad?.escuelas[escuela.cueAnexo]?.claseRio,
              )}
              juntoLaguna={
                territorio?.susceptibilidad?.escuelas[escuela.cueAnexo]?.juntoLaguna === true
              }
              cargando={geometriaLoading || exposicionLoading}
              error={Boolean(geometriaError)}
            />
          </section>

          <section className={styles.section} aria-labelledby="titulo-entorno">
            <h3 id="titulo-entorno" className={styles.sectionTitleSmall}>
              Entorno y accesibilidad
            </h3>
            <dl className={styles.filas}>
              <div>
                <dt>Antecedentes</dt>
                <dd>
                  {escuela.situacionesHistoricas === 0
                    ? 'Sin situaciones históricas'
                    : `${FORMATO_NUMERO.format(escuela.situacionesHistoricas)} ${
                        escuela.situacionesHistoricas === 1 ? 'evento registrado' : 'eventos registrados'
                      }`}
                </dd>
              </div>
              <div>
                <dt>Vigencia del parte</dt>
                <dd>
                  {escuela.sinActualizar ? (
                    <span className={styles.chipAviso} data-testid="ficha-chip-sin-actualizar">
                      <Clock size={12} aria-hidden="true" />
                      Sin actualizar (&gt;72 h)
                    </span>
                  ) : tieneParteRegistrado ? (
                    <span data-testid="ficha-chip-vigente">Vigente</span>
                  ) : (
                    'Sin parte registrado'
                  )}
                </dd>
              </div>
              <div>
                <dt>Última novedad</dt>
                <dd>{novedadRelativa ?? 'Sin datos'}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>

      {mostrarEnlaceNominal && (
        <AlcanceNominalModal
          afectacionId={nominalAfectacionId}
          onOpenChange={(open) => !open && setNominalAfectacionId(null)}
        />
      )}
    </main>
  )
}

const MAX_BARRAS = 30

function BarraAlumnos({ afectados, total }: { afectados: number; total: number }) {
  if (total <= 0) return null
  const barras = Math.min(total, MAX_BARRAS)
  const marcadas = Math.min(
    barras,
    afectados > 0 ? Math.max(1, Math.round((afectados / total) * barras)) : 0,
  )
  return (
    <div
      className={styles.barra}
      role="img"
      aria-label={`${afectados} de ${total} alumnos alcanzados`}
    >
      {Array.from({ length: barras }, (_, indice) => (
        <span
          key={indice}
          className={indice < marcadas ? styles.barraAfectada : styles.barraLibre}
        />
      ))}
    </div>
  )
}

function suscribirSinCambios(): () => void {
  return () => {}
}
