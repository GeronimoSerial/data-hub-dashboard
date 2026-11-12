'use client'

import { prioridadEfectiva } from '@/lib/infraestructura/prioridad-alumnos'

import { etiquetaClases, etiquetaFuncionamiento, tieneServicioInformado } from '@/lib/infraestructura/funcionamiento'
import { derivarClases } from '@/lib/infraestructura/mapa/enriquecer'
import { ImpactoAlumnosResumen } from '@/components/infraestructura/impacto-alumnos-resumen'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowUpRight, Clock, Cloud, MapPinOff } from 'lucide-react'
import { EstadoActualSeveridad } from '@/components/infraestructura/estado-actual-severidad'
import { ETIQUETA_ESTABLECIMIENTO, resumirAlcance } from '@/components/infraestructura/estado-actual-textos'
import { formatearMomentoHistorial } from '@/components/infraestructura/historial-formato'
import { CATEGORIA_META } from '@/lib/infraestructura/categorias'
import { presentarJustificacionCritica } from '@/lib/infraestructura/justificacion-critica'
import { ObservacionReporte } from './observacion-reporte'
import { useIdioma, useTextos } from '@/lib/i18n/idioma-provider'
import { localeNumero } from '@/lib/i18n/formato-numero'
import { contar } from '@/lib/infraestructura/parte/instituto-ui'
import { etiquetaDepartamento } from '@/lib/infraestructura/mapa/etiquetas'
import { valorApoyoMapa } from '@/lib/infraestructura/mapa/etiqueta-apoyo'
import { valorComedor } from '@/lib/infraestructura/comedores/estado'
import { ETIQUETA_POSIBLE_CENTRO } from '@/lib/infraestructura/evacuacion/mapa'
import { tiempoRelativo } from '@/lib/infraestructura/mapa/tiempo-relativo'
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
import { LlamadasFicha, type LlamadaFicha } from '@/components/call-center/llamadas-ficha'
import { useTerritorioMapa } from '@/lib/infraestructura/use-territorio-mapa'
import { useGeometriaAcceso } from '@/lib/infraestructura/use-geometria-acceso'
import { useExposicionRuta } from '@/lib/infraestructura/use-exposicion-ruta'
import { claseInundacion } from '@/lib/mapas/accesos-capas'
import {
  etiquetaNivelPlan,
  nivelPlanificacion,
  tituloLeyendaVista,
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
  /** Solo se pasa si el usuario tiene callcenter.access; undefined oculta la sección. */
  llamadasCallCenter?: LlamadaFicha[]
  searchParams?: Record<string, string | string[] | undefined>
}


export function FichaEscuelaPagina({
  escuela,
  mostrarEnlaceNominal,
  hazardContextEnabled = false,
  llamadasCallCenter,
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
  const situacionesFuncionamiento = datos ? afectaciones : escuela.parte?.afectaciones ?? []
  const recientes = datos?.recientes ?? []

  const principal =
    afectaciones.length > 0
      ? situacionPrincipal(
          afectaciones.map((afectacion) => ({
            ...afectacion,
            estadoEstablecimiento: datos?.parte?.estadoEstablecimiento ?? 'habitual',
          })),
        )
      : !datos && escuela.parte && escuela.parte.afectaciones.length > 0
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

  const diccionario = useTextos()
  const idioma = useIdioma()
  const FORMATO_NUMERO = useMemo(() => new Intl.NumberFormat(localeNumero(idioma)), [idioma])
  const planificacion = useMemo(
    () =>
      VISTAS_ESTRUCTURALES.map((vista) => ({
        etiquetaVista: tituloLeyendaVista(diccionario, vista),
        etiquetaNivel:
          vista === 'historial'
            ? `${etiquetaNivelPlan(diccionario, nivelPlanificacion(escuela, vista, { territorio }))} (${escuela.situacionesHistoricas})`
            : etiquetaNivelPlan(diccionario, nivelPlanificacion(escuela, vista, { territorio })),
      })),
    [diccionario, escuela, territorio],
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
  const justificacionIncidente = incidente ? presentarJustificacionCritica(incidente) : null
  const edificioActual = datos
    ? (afectaciones.some((a) => a.categoria === 'establecimiento') ? datos.parte?.estadoEstablecimiento ?? 'habitual' : 'habitual')
    : escuela.parte?.estadoEstablecimiento ?? 'habitual'
  const clasesActuales = datos ? derivarClases(edificioActual, datos.servicio?.estadoGeneral ?? 'normal') : escuela.clases
  const carrerasActuales = datos && 'carreras' in datos && Array.isArray(datos.carreras) ? datos.carreras.map((c) => c.id as number) : []
  const clasesInformadas = datos
    ? tieneServicioInformado(datos.servicio?.alcanceVigente ?? [], datos.secciones ?? [], carrerasActuales) || ['sin_clases', 'evacuado', 'centro_evacuados'].includes(edificioActual)
    : escuela.clasesInformadas === true
  const tp = useTextos().fichaPagina
  const estadoEdificio = tieneParteRegistrado
    ? ETIQUETA_ESTABLECIMIENTO[
        datos?.parte?.estadoEstablecimiento ?? escuela.parte?.estadoEstablecimiento ?? 'habitual'
      ]
    : tp.sinParte
  // Photos attach to the latest report movement; evidence-only movements cannot be a base.
  const movimientoBaseEvidencia =
    historial.fase === 'listo'
      ? ([...historial.movimientos]
          .filter((movimiento) => (movimiento.tipo as string) !== 'evidencia_fotografica')
          .sort((a, b) => b.creadaEn.localeCompare(a.creadaEn))[0]?.id ?? null)
      : null
  const etiquetaAlumnos = escuela.alumnos === 1 ? tp.alumno : tp.alumnos
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
        {tp.verAlumnos}
        <ArrowUpRight size={13} aria-hidden="true" />
      </button>
    ) : null

  const t = useTextos().ficha
  const pestanas = [
    { id: 'panorama', etiqueta: t.pestanas.panorama },
    {
      id: 'situaciones',
      etiqueta: estado.fase === 'listo' ? t.pestanas.situacionesConteo(afectaciones.length) : t.pestanas.situaciones,
    },
    { id: 'territorio', etiqueta: t.pestanas.territorio },
    { id: 'historial', etiqueta: t.pestanas.historial },
  ]

  return (
    <main
      className={styles.page}
      aria-label={tp.fichaCompleta(escuela.nombre)}
      style={{ '--ficha-cabecera-h': `${altoCabecera}px` } as CSSProperties}
    >
      <nav className={styles.topBar} aria-label={t.navegacionSuperior}>
        <Link href={urlRetornoMapa} className={styles.backLink} data-testid="volver-al-mapa">
          <ArrowLeft size={14} aria-hidden="true" />
          <span>{vieneDelMapa ? t.volverAlMapa : t.irAlMapa}</span>
        </Link>
        <span className={styles.topBarLabel}>{t.detalleEstablecimiento}</span>
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
                  t.matriculados(FORMATO_NUMERO.format(escuela.alumnos), etiquetaAlumnos),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            {sinUbicacion && (
              <div className={styles.sinUbicacionBanner} data-testid="ficha-sin-ubicacion">
                <MapPinOff size={14} aria-hidden="true" />
                <span>{t.sinUbicacion}</span>
              </div>
            )}
          </div>
          <Link
            href={urlCargarParte}
            className={styles.primaryAction}
            data-testid="accion-actualizar-parte"
          >
            {tieneSituacionActiva ? t.actualizarParte : t.cargarSituacion}
            <ArrowUpRight size={14} aria-hidden="true" className={styles.primaryActionIcono} />
          </Link>
        </header>

        <nav className={styles.tabs} aria-label={t.seccionesFicha}>
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

          <section id="situaciones" className={styles.situaciones} aria-label={t.situacionesSeccion}>
            {estado.fase === 'cargando' ? (
              <p role="status" className={styles.emptyState}>
                {t.cargandoSituaciones}
              </p>
            ) : estado.fase === 'error' ? (
              <p role="alert" className={styles.emptyState}>
                {t.errorSituaciones}
              </p>
            ) : incidente ? (
              <article className={styles.incidente} data-testid="ficha-incidente">
                <span className={styles.incidenteBadge}>
                  <span
                    className={styles.incidenteDot}
                    aria-hidden="true"
                  />
                  {t.vistaPrevia.situacionActiva} · {incidente.impactoAlumnos ? t.vistaPrevia.prioridad : t.vistaPrevia.gravedad} {prioridadEfectiva(incidente)?.toLowerCase() ?? tp.sinDatos}
                </span>
                <h2 className={styles.incidenteTitulo}>{incidente.motivo}</h2>
                {!incidente.descripcion && (
                  <p className={styles.incidenteTexto}>
                    {CATEGORIA_META[incidente.categoria].label}
                  </p>
                )}
                <ObservacionReporte texto={incidente.descripcion} />
                {incidente.impactoAlumnos && <p><ImpactoAlumnosResumen impacto={incidente.impactoAlumnos} /></p>}
                {justificacionIncidente && (
                  <p className={styles.incidenteTexto}>
                    <strong>{t.justificacionGravedad}</strong> {justificacionIncidente.etiqueta}
                    {justificacionIncidente.detalle && ` · ${justificacionIncidente.detalle}`}
                  </p>
                )}
                <div className={styles.incidenteMetricas}>
                  <div>
                    <p className={styles.metricaValor}>
                      <span className={styles.metricaNumero}>
                        {FORMATO_NUMERO.format(incidente.totales.alumnos)}
                      </span>{' '}
                      / {FORMATO_NUMERO.format(escuela.alumnos)} {etiquetaAlumnos}
                    </p>
                    <p className={styles.metricaCaption}>{tp.alcanzadosSituacion}</p>
                    <BarraAlumnos afectados={incidente.totales.alumnos} total={escuela.alumnos} />
                  </div>
                  <div className={styles.incidenteDetalle}>
                    <p className={styles.incidenteDetalleFuerte}>
                      {esInstituto
                        ? contar(incidente.totales.carreras ?? 0, 'carrera', 'carreras')
                        : tp.secciones(incidente.totales.secciones)}
                    </p>
                    <p>{tp.desdeFecha(desde(incidente.rigeDesde))}</p>
                    {verAlumnos(incidente.id, styles.linkSubrayado)}
                  </div>
                </div>
              </article>
            ) : (
              <div className={styles.emptyState}>
                {tieneParteRegistrado ? (
                  <p data-testid="ficha-sin-situaciones">{t.vistaPrevia.sinSituacionesAbiertas}</p>
                ) : (
                  <p data-testid="ficha-sin-reporte">
                    {t.vistaPrevia.sinReporte}
                  </p>
                )}
              </div>
            )}

            {otrasAfectaciones.length > 0 && (
              <div className={styles.listaSecundaria}>
                <h3 className={styles.sectionTitleSmall}>
                  {tp.otrasSituaciones(otrasAfectaciones.length)}
                </h3>
                {otrasAfectaciones.map((afectacion) => {
                  const causadaPor = afectaciones.find((otra) => otra.id === afectacion.causadaPorId)
                  const justificacion = presentarJustificacionCritica(afectacion)
                  return (
                    <article className={styles.itemSecundario} key={afectacion.id}>
                      <div className={styles.itemSecundarioTop}>
                        <h4 className={styles.itemSecundarioTitulo}>{afectacion.motivo}</h4>
                        {afectacion.impactoAlumnos ? <ImpactoAlumnosResumen impacto={afectacion.impactoAlumnos} /> : <EstadoActualSeveridad severidad={afectacion.severidad} />}
                      </div>
                      <p className={styles.itemSecundarioTexto}>
                        {[
                          resumirAlcance(afectacion.totales),
                          t.vistaPrevia.desde(desde(afectacion.rigeDesde)),
                          causadaPor ? tp.causadaPor(causadaPor.motivo) : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      {justificacion && (
                        <p className={styles.itemSecundarioTexto}>
                          <strong>{t.justificacionGravedad}</strong> {justificacion.etiqueta}
                          {justificacion.detalle && ` · ${justificacion.detalle}`}
                        </p>
                      )}
                      <ObservacionReporte texto={afectacion.descripcion} />
                      {afectacion.impactoAlumnos && <ImpactoAlumnosResumen impacto={afectacion.impactoAlumnos} />}
                      {verAlumnos(afectacion.id, styles.linkAccion)}
                    </article>
                  )
                })}
              </div>
            )}

            {recientes.length > 0 && (
              <div className={styles.listaSecundaria}>
                <h3 className={styles.sectionTitleSmall}>
                  {tp.solucionadasRecientes(recientes.length)}
                </h3>
                {recientes.map((solucionada) => (
                  <article className={styles.itemSecundario} key={solucionada.id}>
                    <div className={styles.itemSecundarioTop}>
                      <h4 className={styles.itemSecundarioTitulo}>{solucionada.motivo}</h4>
                      <EstadoActualSeveridad severidad={solucionada.severidad} prefijo={false} />
                    </div>
                    <p className={styles.itemSecundarioTexto}>
                      {tp.solucionada} {formatearMomentoHistorial(solucionada.retiradaEn).replace(/^Hoy/, 'hoy')}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className={styles.section} aria-labelledby="titulo-continuidad">
            <h3 id="titulo-continuidad" className={styles.sectionTitle}>
              {tp.continuidad}
            </h3>
            <dl className={styles.continuidad}>
              <div>
                <dt>{t.vistaPrevia.funcionamiento}</dt>
                <dd>{etiquetaFuncionamiento(situacionesFuncionamiento, diccionario)}</dd>
              </div>
              <div>
                <dt>{t.vistaPrevia.clases}</dt>
                <dd>{etiquetaClases(clasesActuales, clasesInformadas, diccionario)}</dd>
              </div>
              <div>
                <dt>{t.vistaPrevia.edificio}</dt>
                <dd>{estadoEdificio}</dd>
              </div>
              <div>
                <dt>{t.vistaPrevia.asistencia}</dt>
                <dd>{valorApoyoMapa(clasesActuales, escuela.apoyo) ?? tp.noCorresponde}</dd>
              </div>
              {escuela.comedor !== undefined && (
                <div>
                  <dt>{t.vistaPrevia.comedor}</dt>
                  <dd>{valorComedor(escuela.comedor)}</dd>
                </div>
              )}
              {escuela.posibleCentroEvacuados === true && (
                <div>
                  <dt>{ETIQUETA_POSIBLE_CENTRO}</dt>
                  <dd>{escuela.posibleCentroSinAntecedentes === true ? tp.siSinAntecedentes : tp.si}</dd>
                </div>
              )}
            </dl>

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
                {tp.actividadReciente}
              </h3>
              <span className={styles.sectionMeta}>
                {escuela.situacionesHistoricas === 0
                  ? t.vistaPrevia.sinHistoricas
                  : `${FORMATO_NUMERO.format(escuela.situacionesHistoricas)} ${tp.registradas(escuela.situacionesHistoricas)}`}
              </span>
            </div>
            {historial.fase === 'cargando' ? (
              <p role="status" className={styles.emptyState}>
                {tp.cargandoHistorial}
              </p>
            ) : historial.fase === 'error' ? (
              <p role="alert" className={styles.emptyState}>
                {tp.errorHistorial}
              </p>
            ) : historial.movimientos.length === 0 ? (
              <p className={styles.emptyState}>
                {tp.sinMovimientos}
              </p>
            ) : (
              <div className={styles.historial}>
                <LineaDeTiempo movimientos={historial.movimientos} limite={10} />
              </div>
            )}
          </section>

          {llamadasCallCenter && <LlamadasFicha llamadas={llamadasCallCenter} />}
        </div>

        <aside id="territorio" className={styles.column} aria-label={t.pestanas.territorio}>
          <section className={styles.section} aria-labelledby="titulo-riesgo">
            <h3 id="titulo-riesgo" className={styles.sectionTitleSmall}>
              {tp.riesgoEscuela}
            </h3>
            <RiesgoEscuela cueAnexo={escuela.cueAnexo} horizonte={72} planificacion={planificacion} />
          </section>
          <section className={styles.climaCard} aria-labelledby="titulo-clima">
            <div className={styles.sectionHeader}>
              <h3 id="titulo-clima" className={styles.sectionTitleSmall}>
                {tp.pronosticoEscuela}
              </h3>
              <Cloud size={20} strokeWidth={1.6} aria-hidden="true" className={styles.climaIcono} />
            </div>
            <p className={styles.sectionMeta}>{tp.condicionesPrevistas}</p>
            <FichaTerritorial cueAnexo={escuela.cueAnexo} localidad={escuela.localidad} />
          </section>

          <section className={styles.section} aria-labelledby="titulo-ubicacion">
            <div className={styles.sectionHeader}>
              <h3 id="titulo-ubicacion" className={styles.sectionTitleSmall}>
                {tp.ubicacion}
              </h3>
              <Link
                href={`/mapas/infraestructura?cue=${encodeURIComponent(escuela.cueAnexo)}&enfocar=1#actual`}
                className={styles.linkAccion}
                data-testid="abrir-mapa"
              >
                {tp.abrirMapa}
                <ArrowUpRight size={13} aria-hidden="true" />
              </Link>
            </div>
            <div className={styles.direccion}>
              <p className={styles.direccionFuerte}>{escuela.localidad?.trim() || tp.sinLocalidad}</p>
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
              {tp.entorno}
            </h3>
            <dl className={styles.filas}>
              <div>
                <dt>{t.vistaPrevia.antecedentes}</dt>
                <dd>
                  {escuela.situacionesHistoricas === 0
                    ? t.vistaPrevia.sinHistoricas
                    : `${FORMATO_NUMERO.format(escuela.situacionesHistoricas)} ${tp.eventosRegistrados(escuela.situacionesHistoricas)}`}
                </dd>
              </div>
              <div>
                <dt>{tp.vigenciaParte}</dt>
                <dd>
                  {escuela.sinActualizar ? (
                    <span className={styles.chipAviso} data-testid="ficha-chip-sin-actualizar">
                      <Clock size={12} aria-hidden="true" />
                      {t.vistaPrevia.sinActualizar}
                    </span>
                  ) : tieneParteRegistrado ? (
                    <span data-testid="ficha-chip-vigente">{t.vistaPrevia.vigente}</span>
                  ) : (
                    tp.sinParte
                  )}
                </dd>
              </div>
              <div>
                <dt>{tp.ultimaNovedad}</dt>
                <dd>{novedadRelativa ?? tp.sinDatos}</dd>
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
  const tp = useTextos().fichaPagina
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
      aria-label={tp.barraAlumnos(afectados, total)}
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
