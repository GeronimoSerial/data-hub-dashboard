'use client'

import { etiquetaClases, etiquetaFuncionamiento, tieneServicioInformado } from '@/lib/infraestructura/funcionamiento'
import { derivarClases } from '@/lib/infraestructura/mapa/enriquecer'
import { ImpactoAlumnosResumen } from '@/components/infraestructura/impacto-alumnos-resumen'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowUpRight, Clock, MapPinOff, PencilLine } from 'lucide-react'
import { EstadoActualSeveridad } from '@/components/infraestructura/estado-actual-severidad'
import { ETIQUETA_ESTABLECIMIENTO } from '@/components/infraestructura/estado-actual-textos'
import { etiquetaDiaHistorial, momentoCortoHistorial } from '@/components/infraestructura/historial-formato'
import { presentarJustificacionCritica } from '@/lib/infraestructura/justificacion-critica'
import { useIdioma, useTextos } from '@/lib/i18n/idioma-provider'
import { localeNumero } from '@/lib/i18n/formato-numero'
import { contar } from '@/lib/infraestructura/parte/instituto-ui'
import { jurisdiccionCorta } from '@/lib/infraestructura/region/publica'
import { etiquetaDepartamento } from '@/lib/infraestructura/mapa/etiquetas'
import { valorApoyoMapa } from '@/lib/infraestructura/mapa/etiqueta-apoyo'
import { valorComedor } from '@/lib/infraestructura/comedores/estado'
import { tiempoRelativo } from '@/lib/infraestructura/mapa/tiempo-relativo'
import { useFichaParte } from '@/lib/infraestructura/use-ficha-parte'
import { FichaTerritorial } from '@/components/infraestructura/ficha-territorial'
import { RiesgoEscuela } from '@/components/infraestructura/riesgo-escuela'
import { situacionPrincipal } from '@/lib/infraestructura/relevancia'
import { BorradoresPendientes } from '@/components/infraestructura/borradores/borradores-pendientes'
import { useDraftCounts } from '@/components/infraestructura/borradores/use-draft-counts'
import { GaleriaEvidencia } from '@/components/infraestructura/fotos/galeria-evidencia'
import { AlcanceNominalModal } from '@/components/infraestructura/alcance-nominal-modal'
import { BloqueAcceso } from '@/components/mapas/bloque-acceso'
import type { LlamadaFicha } from '@/components/call-center/llamadas-ficha'
import { BitacoraFicha, lineasMovimiento } from './bitacora-ficha'
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
  const [pestanaActiva, setPestanaActiva] = useState('situaciones')
  const [altoCabecera, setAltoCabecera] = useState(0)
  const cabeceraRef = useRef<HTMLElement>(null)
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
    const ids = ['situaciones', 'bitacora', 'territorio']
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


  const diccionario = useTextos()
  const idioma = useIdioma()
  const t = diccionario.ficha
  const tp = diccionario.fichaPagina
  const tb = diccionario.fichaBitacora

  const ultimaActualizacionIso =
    datos?.parte?.actualizadaEn ?? escuela.parte?.actualizadaEn ?? escuela.ultimaNovedad
  const novedadRelativa =
    ultimaActualizacionIso && ahoraMs !== null
      ? relativoFicha(ultimaActualizacionIso, ahoraMs, tb.recien)
      : null
  const ahora = ahoraMs === null ? null : new Date(ahoraMs)
  const FORMATO_NUMERO = useMemo(() => new Intl.NumberFormat(localeNumero(idioma)), [idioma])

  const sinUbicacion =
    !escuela.ubicacionDisponible || escuela.lat === null || escuela.lon === null

  const borradoresCount = borradoresMapa.error
    ? null
    : (borradoresMapa.counts.get(escuela.cueAnexo) ?? (borradoresMapa.loading ? null : 0))

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
  const situacionesOrdenadas = incidente
    ? [incidente, ...afectaciones.filter((afectacion) => afectacion.id !== incidente.id)]
    : []
  const estadoEdificioClave = datos
    ? (afectaciones.some((a) => a.categoria === 'establecimiento') ? datos.parte?.estadoEstablecimiento ?? 'habitual' : 'habitual')
    : escuela.parte?.estadoEstablecimiento ?? 'habitual'
  const clasesActuales = datos ? derivarClases(estadoEdificioClave, datos.servicio?.estadoGeneral ?? 'normal') : escuela.clases
  const carrerasActuales = datos && 'carreras' in datos && Array.isArray(datos.carreras) ? datos.carreras.map((c) => c.id as number) : []
  const clasesInformadas = datos
    ? tieneServicioInformado(datos.servicio?.alcanceVigente ?? [], datos.secciones ?? [], carrerasActuales) || ['sin_clases', 'evacuado', 'centro_evacuados'].includes(estadoEdificioClave)
    : escuela.clasesInformadas === true
  const edificioRegistrado = datos?.parte?.estadoEstablecimiento ?? escuela.parte?.estadoEstablecimiento ?? 'habitual'
  const asistencia = valorApoyoMapa(clasesActuales, escuela.apoyo)

  const movimientos = useMemo(
    () => (historial.fase === 'listo' ? historial.movimientos : []),
    [historial],
  )
  // Photos attach to the latest report movement; evidence-only movements cannot be a base.
  const movimientoBaseEvidencia =
    historial.fase === 'listo'
      ? ([...movimientos]
          .filter((movimiento) => (movimiento.tipo as string) !== 'evidencia_fotografica')
          .sort((a, b) => b.creadaEn.localeCompare(a.creadaEn))[0]?.id ?? null)
      : null

  // Each situation's own evolution, oldest first, built from per-situation events.
  const pasosPorSituacion = useMemo(() => {
    const pasos = new Map<string, Array<{ id: string; iso: string; fecha: string; rol: string | null; texto: string }>>()
    const cronologicos = [...movimientos].sort((a, b) => a.creadaEn.localeCompare(b.creadaEn))
    for (const movimiento of cronologicos) {
      for (const [indice, evento] of (movimiento.eventos ?? []).entries()) {
        if (!evento.afectacionId) continue
        const lista = pasos.get(evento.afectacionId) ?? []
        lista.push({
          id: `${movimiento.id}-${indice}`,
          iso: movimiento.creadaEn,
          fecha: etiquetaDiaHistorial(movimiento.creadaEn, ahoraMs === null ? null : new Date(ahoraMs), idioma),
          rol: movimiento.rol === 'supervisor' ? tb.supervisor : null,
          texto: evento.paso,
        })
        pasos.set(evento.afectacionId, lista)
      }
    }
    return pasos
  }, [movimientos, ahoraMs, idioma, tb])

  const ultimoMovimiento = [...movimientos].sort((a, b) => b.creadaEn.localeCompare(a.creadaEn))[0] ?? null
  const lineasUltimo = ultimoMovimiento ? lineasMovimiento(ultimoMovimiento, tb) : []
  const ultimaLlamada = llamadasCallCenter && llamadasCallCenter.length > 0
    ? [...llamadasCallCenter].sort((a, b) => b.creadaEn.localeCompare(a.creadaEn))[0]
    : null

  const etiquetaAlumnos = escuela.alumnos === 1 ? tp.alumno : tp.alumnos
  // Institutos superiores: la ficha cuenta carreras y no muestra nombres de alumnos.
  const esInstituto = escuela.carreras !== undefined

  const verAlumnos = (afectacionId: string, clase: string) =>
    mostrarEnlaceNominal && !esInstituto ? (
      <button
        type="button"
        className={clase}
        data-testid={`ver-alumnos-${afectacionId}`}
        onClick={() => setNominalAfectacionId(afectacionId)}
      >
        {tb.verAlumnos}
      </button>
    ) : null

  // When each open situation was loaded and last changed. Dates order the sheet: newest first everywhere.
  const tiemposSituacion = (afectacion: (typeof afectaciones)[number]) => {
    const pasos = pasosPorSituacion.get(afectacion.id) ?? []
    const ultimo = pasos[pasos.length - 1] ?? null
    // The first recorded step is when it was loaded; the row timestamp can move when a report is re-saved.
    const cargadaIso = pasos[0]?.iso ?? afectacion.rigeDesde
    return {
      cargada: momentoCortoHistorial(cargadaIso, ahora, idioma),
      ultimoIso: ultimo?.iso ?? cargadaIso,
      ultimo: momentoCortoHistorial(ultimo?.iso ?? cargadaIso, ahora, idioma),
    }
  }
  const situacionesPorFecha = situacionesOrdenadas
    .map((afectacion) => ({ afectacion, tiempos: tiemposSituacion(afectacion) }))
    .sort((a, b) => b.tiempos.ultimoIso.localeCompare(a.tiempos.ultimoIso))

  type Afectacion = (typeof afectaciones)[number]
  type Tiempos = ReturnType<typeof tiemposSituacion>

  const observacion = (afectacion: Afectacion) =>
    afectacion.descripcion ? (
      <blockquote className={styles.situacionCita} data-testid="situacion-observacion">
        «{afectacion.descripcion}»
      </blockquote>
    ) : null

  const justificacionDe = (afectacion: Afectacion) => {
    const justificacion = presentarJustificacionCritica(afectacion)
    return justificacion ? (
      <p className={styles.incidenteTexto}>
        <strong>{t.justificacionGravedad}</strong> {justificacion.etiqueta}
        {justificacion.detalle && ` · ${justificacion.detalle}`}
      </p>
    ) : null
  }

  const renderSituacion = (afectacion: Afectacion, tiempos: Tiempos, indice: number) => {
    // Newest step first, as in the log; the first dot is the latest.
    const pasos = (pasosPorSituacion.get(afectacion.id) ?? []).slice(-5).reverse()
    const causadaPor = afectaciones.find((otra) => otra.id === afectacion.causadaPorId)
    const unidades = esInstituto ? (afectacion.totales.carreras ?? 0) : afectacion.totales.secciones
    const accion = verAlumnos(afectacion.id, styles.linkSubrayado)
    const conAlumnos = escuela.alumnos > 0 || afectacion.totales.alumnos > 0
    return (
      <article
        key={afectacion.id}
        className={styles.incidente}
        data-testid={indice === 0 ? 'ficha-incidente' : `ficha-situacion-${afectacion.id}`}
        data-severidad={afectacion.severidad}
      >
        <div className={styles.incidenteEncabezado}>
          <div className={styles.incidenteTituloGrupo}>
            <h2 className={styles.incidenteTitulo}>{afectacion.motivo}</h2>
            {afectacion.impactoAlumnos ? (
              <ImpactoAlumnosResumen impacto={afectacion.impactoAlumnos} />
            ) : (
              <EstadoActualSeveridad severidad={afectacion.severidad} prefijo={false} />
            )}
          </div>
          <p className={styles.fechaCambio}>
            <span>{tb.ultimoCambio}</span>
            <time dateTime={tiempos.ultimoIso}>{tiempos.ultimo}</time>
          </p>
        </div>
        <p className={styles.incidenteTexto}>
          {tb.cargada} {tiempos.cargada}
          {causadaPor && ` · ${tb.por(causadaPor.motivo)}`}
        </p>
        {observacion(afectacion)}
        {justificacionDe(afectacion)}
        {pasos.length > 1 && (
          <div className={styles.evolucionBloque}>
            <p className={styles.evolucionTitulo}>
              {tb.evolucion} · {tb.masRecientePrimero.toLowerCase()}
            </p>
            <ol className={styles.evolucion} aria-label={tb.evolucion}>
              {pasos.map((paso, indicePaso) => (
                <li
                  key={paso.id}
                  className={styles.evolucionPaso}
                  aria-current={indicePaso === 0 ? 'step' : undefined}
                >
                  <time dateTime={paso.iso} className={styles.evolucionFecha}>
                    {momentoCortoHistorial(paso.iso, ahora, idioma)}
                  </time>
                  <span className={styles.evolucionTexto}>
                    {paso.texto}
                    {paso.rol && <span className={styles.evolucionRol}> · {paso.rol}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
        {(conAlumnos || unidades > 0 || accion) && (
          <div className={styles.incidenteMetricas}>
            <div>
              {conAlumnos && (
                <>
                  <p className={styles.metricaValor}>
                    <span className={styles.metricaNumero}>{FORMATO_NUMERO.format(afectacion.totales.alumnos)}</span>
                    {escuela.alumnos > 0 && ` / ${FORMATO_NUMERO.format(escuela.alumnos)}`}
                  </p>
                  <p className={styles.metricaCaption}>{tb.alcanzados}</p>
                </>
              )}
            </div>
            <div className={styles.incidenteDetalle}>
              {unidades > 0 && (
                <p className={styles.incidenteDetalleFuerte}>
                  {esInstituto ? contar(unidades, 'carrera', 'carreras') : tp.secciones(unidades)}
                </p>
              )}
              {accion}
            </div>
          </div>
        )}
      </article>
    )
  }

  const pestanas = [
    {
      id: 'situaciones',
      etiqueta: estado.fase === 'listo' ? t.pestanas.situacionesConteo(afectaciones.length) : t.pestanas.situaciones,
    },
    { id: 'bitacora', etiqueta: tb.pestanaBitacora },
    { id: 'territorio', etiqueta: tb.pestanaTerritorio },
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
      </nav>

      <header className={styles.header}>
        <div className={styles.identity}>
          <h1 className={styles.schoolTitle}>{escuela.nombre}</h1>
          <div className={styles.schoolMeta}>
            <p>{[ubicacionTexto, `CUE ${escuela.cueAnexo}`].filter(Boolean).join(' · ')}</p>
            {(() => {
              const linea = [
                esInstituto
                  ? contar(escuela.carreras ?? 0, 'carrera', 'carreras')
                  : escuela.niveles.length > 0 ? escuela.niveles.join(', ') : null,
                escuela.alumnos > 0 ? t.matriculados(FORMATO_NUMERO.format(escuela.alumnos), etiquetaAlumnos) : null,
              ].filter(Boolean)
              return linea.length > 0 ? <p>{linea.join(' · ')}</p> : null
            })()}
          </div>
          {sinUbicacion && (
            <p className={styles.sinUbicacionBanner} data-testid="ficha-sin-ubicacion">
              <MapPinOff size={14} aria-hidden="true" />
              <span>{t.sinUbicacion}</span>
            </p>
          )}
        </div>
        <Link
          href={urlCargarParte}
          className={styles.primaryAction}
          data-testid="accion-actualizar-parte"
        >
          {tieneSituacionActiva ? t.actualizarParte : t.cargarSituacion}
          <PencilLine size={14} aria-hidden="true" className={styles.primaryActionIcono} />
        </Link>
      </header>

      <div className={styles.estadoRapido} data-testid="ficha-ultimo-movimiento">
        <p className={styles.estadoRapidoPrincipal}>
          {ultimoMovimiento && lineasUltimo.length > 0 ? (
            <>
              <span className={styles.estadoRapidoEtiqueta}>{tb.ultimoMovimiento}</span>
              <span>
                <strong>{momentoCortoHistorial(ultimoMovimiento.creadaEn, ahora, idioma)}</strong>
                {' · '}
                {lineasUltimo[0].sujeto === tb.escuela
                  ? lineasUltimo[0].detalle
                  : `${lineasUltimo[0].sujeto}: ${lineasUltimo[0].detalle}`}
                {lineasUltimo.length > 1 && tb.masCambios(lineasUltimo.length - 1)}
                {ultimoMovimiento.rol === 'supervisor' && ` · ${tb.supervisor}`}
              </span>
            </>
          ) : novedadRelativa ? (
            <span>{tb.ultimaNovedad(novedadRelativa)}</span>
          ) : (
            <span>{tb.sinMovimientos}</span>
          )}
        </p>
        {ultimaLlamada && (
          <p className={styles.estadoRapidoSecundario}>
            {tb.ultimaLlamada(momentoCortoHistorial(ultimaLlamada.creadaEn, ahora, idioma))}
          </p>
        )}
        {escuela.sinActualizar && (
          <p className={styles.chipAviso} data-testid="ficha-chip-sin-actualizar">
            <Clock size={12} aria-hidden="true" />
            {tb.sinActualizar}
          </p>
        )}
      </div>

      <nav ref={cabeceraRef} className={styles.tabs} aria-label={t.seccionesFicha}>
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

      <div className={styles.mainGrid}>
        <div className={styles.column}>
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
                {tb.cargandoSituaciones}
              </p>
            ) : estado.fase === 'error' ? (
              <p role="alert" className={styles.emptyState}>
                {tb.errorSituaciones}
              </p>
            ) : incidente ? (
              <>
                <div className={styles.sectionHeader}>
                  <h3 className={styles.sectionTitleSmall}>{tb.situacionesAbiertas}</h3>
                  {situacionesPorFecha.length > 1 && (
                    <span className={styles.sectionMeta}>{tb.porUltimoCambio}</span>
                  )}
                </div>
                {situacionesPorFecha.map(({ afectacion, tiempos }, indice) => renderSituacion(afectacion, tiempos, indice))}
              </>
            ) : (
              <div className={styles.emptyState}>
                {tieneParteRegistrado ? (
                  <p data-testid="ficha-sin-situaciones">{tb.sinSituacionesAbiertas}</p>
                ) : (
                  <p data-testid="ficha-sin-reporte">{t.vistaPrevia.sinReporte}</p>
                )}
              </div>
            )}
          </section>

          <section className={styles.section} aria-labelledby="titulo-continuidad">
            <h3 id="titulo-continuidad" className={styles.sectionTitle}>
              {tb.continuidad}
            </h3>
            <dl className={styles.continuidad} aria-label={tb.continuidad}>
              <div>
                <dt>{t.vistaPrevia.funcionamiento}</dt>
                <dd>{etiquetaFuncionamiento(situacionesFuncionamiento, diccionario)}</dd>
              </div>
              <div>
                <dt>{t.vistaPrevia.clases}</dt>
                <dd>{etiquetaClases(clasesActuales, clasesInformadas, diccionario)}</dd>
              </div>
              {tieneParteRegistrado && edificioRegistrado !== 'habitual' && (
                <div>
                  <dt>{t.vistaPrevia.edificio}</dt>
                  <dd>{ETIQUETA_ESTABLECIMIENTO[edificioRegistrado]}</dd>
                </div>
              )}
              {asistencia && (
                <div>
                  <dt>{t.vistaPrevia.asistencia}</dt>
                  <dd>{asistencia}</dd>
                </div>
              )}
              {escuela.comedor !== undefined && (
                <div>
                  <dt>{t.vistaPrevia.comedor}</dt>
                  <dd>{valorComedor(escuela.comedor)}</dd>
                </div>
              )}
            </dl>
          </section>

          <section
            id="bitacora"
            className={styles.section}
            aria-labelledby="titulo-bitacora"
            data-testid="seccion-historial-inline"
          >
            <h3 id="titulo-bitacora" className={styles.sectionTitle}>
              {tb.titulo}
            </h3>
            {historial.fase === 'cargando' ? (
              <p role="status" className={styles.emptyState}>
                {tb.cargando}
              </p>
            ) : historial.fase === 'error' ? (
              <p role="alert" className={styles.emptyState}>
                {tb.error}
              </p>
            ) : (
              <BitacoraFicha movimientos={movimientos} llamadas={llamadasCallCenter} ahoraMs={ahoraMs} />
            )}
          </section>

          <div id="evidencia" className={styles.anchor}>
            <GaleriaEvidencia
              cue={escuela.cueAnexo}
              movimientoBaseId={movimientoBaseEvidencia}
              urlCargarParte={urlCargarParte}
            />
          </div>
        </div>

        <aside id="territorio" className={styles.column} aria-label={t.pestanas.territorio}>
          <section className={styles.climaCard} aria-labelledby="titulo-clima">
            <h3 id="titulo-clima" className={styles.sectionTitleSmall}>
              {tp.pronosticoEscuela}
            </h3>
            <p className={styles.sectionMeta}>{tp.condicionesPrevistas}</p>
            <FichaTerritorial cueAnexo={escuela.cueAnexo} localidad={escuela.localidad} />
          </section>

          <section className={styles.section} aria-labelledby="titulo-riesgo">
            <h3 id="titulo-riesgo" className={styles.sectionTitleSmall}>
              {tp.riesgoEscuela}
            </h3>
            <RiesgoEscuela cueAnexo={escuela.cueAnexo} horizonte={72} planificacion={planificacion} />
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
              <p>{etiquetaDepartamento(escuela.departamento)}, {jurisdiccionCorta()}</p>
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

// Under a minute reads as "just now" instead of "0 min ago".
function relativoFicha(iso: string, ahoraMs: number, recien: string): string {
  const fechaMs = Date.parse(iso)
  if (Number.isFinite(fechaMs) && ahoraMs - fechaMs < 60_000) return recien
  return tiempoRelativo(iso, ahoraMs)
}

function suscribirSinCambios(): () => void {
  return () => {}
}
