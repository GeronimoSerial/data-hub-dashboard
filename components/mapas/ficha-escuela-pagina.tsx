'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Clock, MapPinOff } from 'lucide-react'
import { EstadoActualSeveridad, TINTA_POR_SEVERIDAD } from '@/components/infraestructura/estado-actual-severidad'
import { ETIQUETA_ESTABLECIMIENTO, resumirAlcance } from '@/components/infraestructura/estado-actual-textos'
import { formatearMomentoHistorial } from '@/components/infraestructura/historial-formato'
import { CATEGORIA_META, esCategoria } from '@/lib/infraestructura/categorias'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
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
  VISTAS_PLANIFICACION,
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

function etiquetaCategoria(categoria: string | null): string | null {
  if (!categoria) return null
  return esCategoria(categoria) ? CATEGORIA_META[categoria].label : categoria
}

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
  const [ahoraMs, setAhoraMs] = useState<number | null>(null)

  useEffect(() => {
    setAhoraMs(Date.now())
  }, [])

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

  const categoria = principal
    ? CATEGORIA_META[principal.categoria].label
    : etiquetaCategoria(escuela.categoriaPrincipal)

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
      VISTAS_PLANIFICACION.map((vista) => ({
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

  return (
    <main className={styles.page} aria-label={`Ficha completa de ${escuela.nombre}`}>
      <div className={styles.topBar}>
        <Link
          href={urlRetornoMapa}
          className={styles.backLink}
          data-testid="volver-al-mapa"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span>{vieneDelMapa ? 'Volver al mapa' : 'Ir al mapa'}</span>
        </Link>
      </div>

      <header id="resumen" className={styles.headerCard}>
        <div className={styles.headerMain}>
          <div className={styles.identity}>
            <h1 className={styles.schoolTitle}>{escuela.nombre}</h1>
            <p className={styles.schoolMeta}>
              CUE {escuela.cueAnexo}
              {ubicacionTexto ? ` · ${ubicacionTexto}` : ''}
              {escuela.niveles.length > 0 ? ` · ${escuela.niveles.join(', ')}` : ''}
              {` · ${FORMATO_NUMERO.format(escuela.alumnos)} ${
                escuela.alumnos === 1 ? 'alumno' : 'alumnos'
              }`}
            </p>
          </div>

          <div className={styles.headerActions}>
            <Link
              href={urlCargarParte}
              className={styles.primaryAction}
              data-testid="accion-actualizar-parte"
            >
              {tieneSituacionActiva ? 'Actualizar el parte' : 'Cargar una situación'}
            </Link>
          </div>
        </div>

        {sinUbicacion && (
          <div className={styles.sinUbicacionBanner} data-testid="ficha-sin-ubicacion">
            <MapPinOff size={16} aria-hidden="true" />
            <span>Ubicación no disponible en el mapa</span>
          </div>
        )}

        <nav className={styles.sectionNav} aria-label="Secciones de la ficha">
          <a href="#resumen" className={styles.sectionNavLink}>
            Resumen
          </a>
          <a href="#situaciones" className={styles.sectionNavLink}>
            Situaciones
          </a>
          <a href="#acceso" className={styles.sectionNavLink}>
            Acceso
          </a>
          <a href="#evidencia" className={styles.sectionNavLink}>
            Evidencia
          </a>
          <a href="#historial" className={styles.sectionNavLink}>
            Historial
          </a>
          <a href="#territorio" className={styles.sectionNavLink}>
            Territorio y clima
          </a>
        </nav>
      </header>

      <section
        className={styles.summaryStrip}
        aria-label="Resumen operativo y exposición"
        data-testid="ficha-resumen-ejecutivo"
      >
        <div className={styles.summaryCard}>
          <p className={styles.summaryLabel}>Situación reportada (parte operativo)</p>
          {severidad ? (
            <>
              <span
                className={styles.severidadPill}
                style={{
                  backgroundColor: colorSeveridad(severidad),
                  color: TINTA_POR_SEVERIDAD[severidad],
                }}
              >
                Gravedad {severidad}
              </span>
              <p className={styles.summarySub}>
                {principal
                  ? `${principal.motivo} · ${categoria} · desde ${desde(principal.rigeDesde)}`
                  : categoria ?? 'Situación activa'}
              </p>
            </>
          ) : tieneParteRegistrado ? (
            <p className={styles.summarySub} data-testid="ficha-sin-situaciones">
              Sin situaciones abiertas reportadas
            </p>
          ) : (
            <p className={styles.summarySub} data-testid="ficha-sin-reporte">
              Sin reporte activo (la ausencia de reporte no confirma normalidad)
            </p>
          )}
        </div>

        <div className={styles.summaryCard}>
          <p className={styles.summaryLabel}>Clases y asistencia pedagógica</p>
          <p className={styles.summaryValue}>{ETIQUETA_ESTADO_CLASES[escuela.clases]}</p>
          <p className={styles.summarySub}>
            Asistencia: {valorApoyoMapa(escuela.clases, escuela.apoyo) ?? 'No corresponde'}
            {(datos?.parte || escuela.parte)
              ? ` · Edificio: ${
                  ETIQUETA_ESTABLECIMIENTO[
                    datos?.parte?.estadoEstablecimiento ??
                      escuela.parte?.estadoEstablecimiento ??
                      'habitual'
                  ]
                }`
              : ''}
          </p>
        </div>

        <div className={styles.summaryCard}>
          <p className={styles.summaryLabel}>Vigencia del parte</p>
          {escuela.sinActualizar ? (
            <span
              className={`${styles.chipVigencia} ${styles.chipAviso}`}
              data-testid="ficha-chip-sin-actualizar"
            >
              <Clock size={13} aria-hidden="true" />
              Sin actualizar (&gt;72 h)
            </span>
          ) : tieneParteRegistrado ? (
            <span
              className={`${styles.chipVigencia} ${styles.chipOk}`}
              data-testid="ficha-chip-vigente"
            >
              Vigente
            </span>
          ) : (
            <p className={styles.summaryValue}>Sin parte registrado</p>
          )}
          <p className={styles.summarySub}>
            {novedadRelativa ? `Última novedad: ${novedadRelativa}` : 'Sin actualizaciones recientes'}
          </p>
        </div>

        <div className={`${styles.summaryCard} ${styles.summaryCardRiesgo}`}>
          <p className={styles.summaryLabel}>Exposición y riesgo estimado</p>
          <p className={styles.summaryValue}>
            {escuela.situacionesHistoricas === 0
              ? 'Sin situaciones históricas'
              : `${FORMATO_NUMERO.format(escuela.situacionesHistoricas)} ${
                  escuela.situacionesHistoricas === 1
                    ? 'situación histórica'
                    : 'situaciones históricas'
                }`}
          </p>
          <p className={styles.summarySub}>
            Estimación territorial e histórica, independiente del reporte del establecimiento
          </p>
        </div>
      </section>

      <div className={styles.mainGrid}>
        <div className={styles.column}>
          {borradoresCount !== null && borradoresCount > 0 && (
            <BorradoresPendientes
              key={escuela.cueAnexo}
              cue={escuela.cueAnexo}
              count={borradoresCount}
            />
          )}

          <section
            id="situaciones"
            className={styles.panelCard}
            aria-labelledby="titulo-situaciones"
          >
            <div className={styles.panelHeader}>
              <h2 id="titulo-situaciones" className={styles.panelTitle}>
                Situaciones reportadas
              </h2>
              {estado.fase === 'listo' && (
                <p className={styles.panelSubtitle}>
                  {afectaciones.length}{' '}
                  {afectaciones.length === 1 ? 'abierta' : 'abiertas'}
                </p>
              )}
            </div>

            {estado.fase === 'cargando' ? (
              <p role="status" className={styles.emptyState}>
                Cargando situaciones del parte…
              </p>
            ) : estado.fase === 'error' ? (
              <p role="alert" className={styles.emptyState}>
                No se pudo cargar la información operativa de la escuela.
              </p>
            ) : afectaciones.length === 0 ? (
              <p className={styles.emptyState}>
                {tieneParteRegistrado
                  ? 'Sin situaciones abiertas reportadas en el parte actual.'
                  : 'Sin reporte activo para este establecimiento (la ausencia de reporte no confirma normalidad).'}
              </p>
            ) : (
              <div className={styles.situacionList}>
                {afectaciones.map((afectacion) => {
                  const causadaPor = afectaciones.find(
                    (otra) => otra.id === afectacion.causadaPorId,
                  )
                  const rigeDesde = formatearMomentoHistorial(afectacion.rigeDesde).replace(
                    /^Hoy/,
                    'hoy',
                  )
                  return (
                    <article className={styles.situacionItem} key={afectacion.id}>
                      <div className={styles.situacionTop}>
                        <h3 className={styles.situacionMotivo}>{afectacion.motivo}</h3>
                        <EstadoActualSeveridad severidad={afectacion.severidad} />
                      </div>
                      <dl className={styles.kvGrid}>
                        <dt>Alcance</dt>
                        <dd>{resumirAlcance(afectacion.totales)}</dd>
                        {rigeDesde && (
                          <>
                            <dt>Desde</dt>
                            <dd>{rigeDesde}</dd>
                          </>
                        )}
                        {causadaPor && (
                          <>
                            <dt>Causada por</dt>
                            <dd>{causadaPor.motivo}</dd>
                          </>
                        )}
                        {afectacion.descripcion && (
                          <>
                            <dt>Descripción</dt>
                            <dd>{afectacion.descripcion}</dd>
                          </>
                        )}
                        <dt>Categoría</dt>
                        <dd>{CATEGORIA_META[afectacion.categoria].label}</dd>
                      </dl>
                      {mostrarEnlaceNominal && (
                        <button
                          type="button"
                          className={styles.nominalBtn}
                          data-testid={`ver-alumnos-${afectacion.id}`}
                          onClick={() => setNominalAfectacionId(afectacion.id)}
                        >
                          Ver alumnos alcanzados
                        </button>
                      )}
                    </article>
                  )
                })}
              </div>
            )}

            {recientes.length > 0 && (
              <>
                <h3 className={styles.subSectionTitle}>
                  Solucionadas recientemente ({recientes.length})
                </h3>
                <div className={styles.situacionList}>
                  {recientes.map((solucionada) => {
                    const retiradaEn = formatearMomentoHistorial(
                      solucionada.retiradaEn,
                    ).replace(/^Hoy/, 'hoy')
                    return (
                      <article className={styles.situacionItem} key={solucionada.id}>
                        <div className={styles.situacionTop}>
                          <h4 className={styles.situacionMotivo}>{solucionada.motivo}</h4>
                          <EstadoActualSeveridad
                            severidad={solucionada.severidad}
                            prefijo={false}
                          />
                        </div>
                        <dl className={styles.kvGrid}>
                          <dt>Solucionada</dt>
                          <dd>{retiradaEn}</dd>
                        </dl>
                      </article>
                    )
                  })}
                </div>
              </>
            )}
          </section>

          <section
            id="evidencia"
            className={styles.panelCard}
            aria-labelledby="titulo-evidencia"
          >
            <div className={styles.panelHeader}>
              <h2 id="titulo-evidencia" className={styles.panelTitle}>
                Evidencia fotográfica
              </h2>
            </div>
            <GaleriaEvidencia cue={escuela.cueAnexo} />
          </section>

          <section
            id="historial"
            className={styles.panelCard}
            aria-labelledby="titulo-historial"
            data-testid="seccion-historial-inline"
          >
            <div className={styles.panelHeader}>
              <h2 id="titulo-historial" className={styles.panelTitle}>
                Historial de movimientos
              </h2>
              <p className={styles.panelSubtitle}>
                {escuela.situacionesHistoricas === 0
                  ? 'Sin situaciones históricas'
                  : `${FORMATO_NUMERO.format(escuela.situacionesHistoricas)} ${
                      escuela.situacionesHistoricas === 1
                        ? 'situación registrada'
                        : 'situaciones registradas'
                    }`}
              </p>
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
              <LineaDeTiempo movimientos={historial.movimientos} limite={10} />
            )}
          </section>
        </div>

        <div className={styles.column}>
          <section
            id="acceso"
            className={styles.panelCard}
            aria-labelledby="titulo-acceso"
          >
            <div className={styles.panelHeader}>
              <h2 id="titulo-acceso" className={styles.panelTitle}>
                Acceso al establecimiento
              </h2>
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

          <section
            id="territorio"
            className={styles.panelCard}
            aria-labelledby="titulo-territorio"
          >
            <div className={styles.panelHeader}>
              <h2 id="titulo-territorio" className={styles.panelTitle}>
                Exposición, riesgo y contexto territorial
              </h2>
            </div>

            <RiesgoEscuela
              cueAnexo={escuela.cueAnexo}
              horizonte={72}
              planificacion={planificacion}
            />

            <div>
              <h3 className={styles.subSectionTitle}>Lluvia y río: datos de apoyo</h3>
              <FichaTerritorial
                cueAnexo={escuela.cueAnexo}
                localidad={escuela.localidad}
              />
            </div>
          </section>
        </div>
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
