'use client'

import { etiquetaClases, etiquetaFuncionamiento } from '@/lib/infraestructura/funcionamiento'
import { ImpactoAlumnosResumen } from '@/components/infraestructura/impacto-alumnos-resumen'

import { useEffect, useRef, type ReactNode } from 'react'
import Link from 'next/link'
import { Clock, MapPinOff, X } from 'lucide-react'
import { ETIQUETA_ESTABLECIMIENTO } from '@/components/infraestructura/estado-actual-textos'
import { CATEGORIA_META, esCategoria } from '@/lib/infraestructura/categorias'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { presentarJustificacionCritica } from '@/lib/infraestructura/justificacion-critica'
import { formatoFechaRegion } from '@/components/mapas/formato-fecha-region'
import { detalleNivelOInstituto, etiquetaDepartamento } from '@/lib/infraestructura/mapa/etiquetas'
import { etiquetaApoyoMapa } from '@/lib/infraestructura/mapa/etiqueta-apoyo'
import type { EscuelaMapaEnriquecida } from '@/lib/infraestructura/mapa/tipos'
import { valorComedor } from '@/lib/infraestructura/comedores/estado'
import { ETIQUETA_POSIBLE_CENTRO, ETIQUETA_POSIBLE_CENTRO_SIN_ANTECEDENTES } from '@/lib/infraestructura/evacuacion/mapa'
import type { ParteMapa } from '@/lib/infraestructura/parte-mapa'
import { SEVERIDADES } from '@/lib/infraestructura/validacion'
import { situacionPrincipal } from '@/lib/infraestructura/relevancia'
import { prioridadEfectiva } from '@/lib/infraestructura/prioridad-alumnos'
import { desde } from '@/components/infraestructura/actualizar/entrada-actualizar'
import { DESCRIPCIONES_AISLAMIENTO } from '@/lib/mapas/accesos-capas'
import { etiquetaKm, etiquetaSuperficie, type SuperficieVia } from '@/lib/infraestructura/mapa/acceso'
import type { NivelAislamientoMapa } from '@/lib/infraestructura/territorio-mapa'
import styles from './vista-previa-escuela.module.css'
import { ObservacionReporte } from './observacion-reporte'
import { useTextos } from '@/lib/i18n/idioma-provider'

export interface VistaPreviaEscuelaProps {
  escuela: EscuelaMapaEnriquecida & {
    parte?: ParteMapa
    ubicacionDisponible?: boolean
  }
  urlFichaCompleta: string
  onCerrarVistaPrevia: () => void
  onQuitarSeleccion: () => void
  onAbrirFichaCompleta?: () => void
  /** True while the school's report is still loading; avoids flashing the category as the reason. */
  cargandoParte?: boolean
  /** Contenido propio de la pestaña (p. ej. el pronóstico en Radar), antes de las acciones. */
  extra?: ReactNode
  /** Static OSM access isolation level; omitted when the school has no row. */
  aislamiento?: NivelAislamientoMapa | null
  /** Road distance to the town the access route ends at; omitted while unknown. */
  distanciaLocalidad?: { nombre: string | null; km: number; superficie?: SuperficieVia | null; desglose?: string | null } | null
}

const FORMATO_NUMERO = new Intl.NumberFormat('es-AR')

function etiquetaCategoria(categoria: string | null): string | null {
  if (!categoria) return null
  return esCategoria(categoria) ? CATEGORIA_META[categoria].label : categoria
}

function formatearFechaCorta(iso: string | null): string | null {
  if (!iso) return null
  const fecha = new Date(iso)
  if (Number.isNaN(fecha.getTime())) return null
  return formatoFechaRegion({
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(fecha)
}

export function VistaPreviaEscuela({
  escuela,
  urlFichaCompleta,
  onCerrarVistaPrevia,
  onQuitarSeleccion,
  onAbrirFichaCompleta,
  cargandoParte = false,
  extra = null,
  aislamiento = null,
  distanciaLocalidad = null,
}: VistaPreviaEscuelaProps) {
  const tituloRef = useRef<HTMLHeadingElement>(null)
  const dic = useTextos()
  const t = dic.ficha
  const tr = dic.residuos
  const sinUbicacion =
    escuela.ubicacionDisponible === false ||
    escuela.lat === null ||
    escuela.lon === null

  const afectaciones = escuela.parte?.afectaciones ?? []
  const principal =
    afectaciones.length > 0 && escuela.parte
      ? situacionPrincipal(
          afectaciones.map((afectacion) => ({
            ...afectacion,
            estadoEstablecimiento: escuela.parte?.estadoEstablecimiento ?? 'habitual',
          })),
        )
      : null
  const justificacionPrincipal = principal ? presentarJustificacionCritica(principal) : null

  const severidad = principal
    ? prioridadEfectiva(principal)
    : escuela.parte ? null : escuela.gravedad === 0 ? null : SEVERIDADES[escuela.gravedad - 1]
  const categoriaLabel = principal
    ? CATEGORIA_META[principal.categoria].label
    : etiquetaCategoria(escuela.categoriaPrincipal)

  const etiquetaApoyo = etiquetaApoyoMapa(escuela.clases, escuela.apoyo, dic)
  // Per-situation totals can overlap, so the affected count never exceeds enrolment.
  const alumnosAfectados = Math.min(
    escuela.alumnos,
    Math.max(escuela.parte?.alumnosDelHecho ?? 0, escuela.alumnosSinClases),
  )
  const porcentajeAfectados = escuela.alumnos > 0
    ? Math.round((alumnosAfectados / escuela.alumnos) * 100)
    : 0
  const seccionesAfectadas = escuela.parte?.seccionesAlcanzadas ?? 0
  const fechaActualizacion = formatearFechaCorta(
    escuela.parte?.actualizadaEn ?? escuela.ultimaNovedad,
  )

  useEffect(() => {
    tituloRef.current?.focus()
    const alPresionarTecla = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCerrarVistaPrevia()
    }
    window.addEventListener('keydown', alPresionarTecla)
    return () => window.removeEventListener('keydown', alPresionarTecla)
  }, [onCerrarVistaPrevia])

  const ubicacionTexto = [
    escuela.localidad ? escuela.localidad.trim() : null,
    etiquetaDepartamento(escuela.departamento),
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <section
      className={styles.card}
      aria-label={tr.vistaPrevia.ariaTitulo(escuela.nombre)}
      data-testid="vista-previa-escuela"
    >
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <h2 ref={tituloRef} tabIndex={-1} className={styles.title} data-testid="preview-nombre">
            {escuela.nombre}
          </h2>
          <p className={styles.meta} data-testid="preview-cue">
            CUE {escuela.cueAnexo}
            {ubicacionTexto ? ` · ${ubicacionTexto}` : ''}
            {detalleNivelOInstituto(escuela, dic) ? ` · ${detalleNivelOInstituto(escuela, dic)}` : ''}
          </p>
        </div>
        <button
          type="button"
          className={styles.closeIconBtn}
          aria-label={t.vistaPrevia.cerrar}
          data-testid="cerrar-preview"
          onClick={onCerrarVistaPrevia}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      {sinUbicacion && (
        <p className={styles.sinUbicacion} data-testid="badge-sin-ubicacion">
          <MapPinOff size={14} aria-hidden="true" />
          <span>{t.sinUbicacion}</span>
        </p>
      )}

      <div className={styles.situacion} data-testid="preview-bloque-situacion">
        {severidad && (principal || escuela.gravedad > 0) ? (
          <>
            <span
              className={styles.franja}
              style={{ backgroundColor: colorSeveridad(severidad) }}
              aria-hidden="true"
            />
            <div className={styles.situacionCuerpo}>
              <p className={styles.gravedad}>
                {principal?.categoria === 'alumnos' || escuela.categoriaPrincipal === 'alumnos' ? t.vistaPrevia.prioridad : t.vistaPrevia.gravedad} {severidad}
              </p>
              {cargandoParte && !principal ? (
                <p className={styles.situacionMeta} role="status">{t.vistaPrevia.cargandoSituacion}</p>
              ) : (
                <>
              <p className={styles.motivo}>
                {principal ? principal.motivo : (categoriaLabel ?? t.vistaPrevia.situacionActiva)}
              </p>
              {principal?.categoria === 'alumnos' && <p><ImpactoAlumnosResumen impacto={principal.impactoAlumnos} /></p>}
              <p className={styles.situacionMeta}>
                {afectaciones.length > 0
                  ? t.vistaPrevia.situacionesAbiertas(afectaciones.length)
                  : t.vistaPrevia.situacionReportada}
                {categoriaLabel ? ` · ${categoriaLabel}` : ''}
                {principal ? ` · ${t.vistaPrevia.desde(desde(principal.rigeDesde))}` : ''}
              </p>
              {justificacionPrincipal && (
                <p className={styles.situacionMeta} data-testid="preview-justificacion-critica">
                  <strong>{t.justificacionGravedad}</strong> {justificacionPrincipal.etiqueta}
                  {justificacionPrincipal.detalle && ` · ${justificacionPrincipal.detalle}`}
                </p>
              )}
              {principal && <ObservacionReporte texto={principal.descripcion} />}
                </>
              )}
            </div>
          </>
        ) : principal ? (
          <p><strong>{principal.motivo}</strong> · <ImpactoAlumnosResumen impacto={principal.impactoAlumnos} /></p>
        ) : escuela.parte ? (
          <p className={styles.sinReporte} data-testid="preview-sin-situaciones">
            {t.vistaPrevia.sinSituacionesAbiertas}
          </p>
        ) : (
          <p className={styles.sinReporte} data-testid="preview-sin-reporte">
            {t.vistaPrevia.sinReporte}
          </p>
        )}
      </div>

      {escuela.alumnos > 0 && (
        <div className={styles.impacto} data-testid="preview-bloque-impacto">
          <p className={styles.impactoCifra}>
            <strong>{FORMATO_NUMERO.format(alumnosAfectados)}</strong>
            <span>{t.vistaPrevia.alumnosAfectados(alumnosAfectados)}</span>
          </p>
          <p className={styles.impactoContexto}>
            {t.vistaPrevia.contextoImpacto(porcentajeAfectados, FORMATO_NUMERO.format(escuela.alumnos), escuela.alumnos === 1)}
          </p>
          <div
            className={styles.proporcion}
            role="img"
            aria-label={t.vistaPrevia.proporcionAfectada(porcentajeAfectados)}
          >
            <span style={{ width: `${porcentajeAfectados}%` }} />
          </div>
        </div>
      )}

      <dl className={styles.datos} data-testid="preview-bloque-clases">
        <div><dt>{t.vistaPrevia.funcionamiento}</dt><dd>{etiquetaFuncionamiento(afectaciones, dic)}</dd></div>
        {seccionesAfectadas > 0 && (
          <div>
            <dt>{t.vistaPrevia.seccionesAfectadas}</dt>
            <dd>{FORMATO_NUMERO.format(seccionesAfectadas)}</dd>
          </div>
        )}
        <div>
          <dt>{t.vistaPrevia.clases}</dt>
          <dd className={escuela.clases === 'normal' ? undefined : escuela.clases === 'parcial' ? styles.aviso : styles.alerta}>
            {etiquetaClases(escuela.clases, escuela.clasesInformadas === true, dic)}
            {escuela.alumnosSinClases > 0 && (
              <span className={styles.atenuado}>
                {t.vistaPrevia.sinClases(FORMATO_NUMERO.format(escuela.alumnosSinClases))}
              </span>
            )}
          </dd>
        </div>
        {etiquetaApoyo && (
          <div>
            <dt>{t.vistaPrevia.asistencia}</dt>
            <dd>{etiquetaApoyo}</dd>
          </div>
        )}
        {escuela.parte && (
          <div>
            <dt>{t.vistaPrevia.edificio}</dt>
            <dd>{ETIQUETA_ESTABLECIMIENTO[escuela.parte.estadoEstablecimiento]}</dd>
          </div>
        )}
        {(escuela.sinActualizar || escuela.parte || escuela.ultimaNovedad || fechaActualizacion) && (
          <div>
            <dt>{t.vistaPrevia.ultimoParte}</dt>
            <dd>
              {fechaActualizacion}
              {escuela.sinActualizar ? (
                <span className={styles.aviso} data-testid="chip-sin-actualizar">
                  <Clock size={12} aria-hidden="true" />
                  {t.vistaPrevia.sinActualizar}
                </span>
              ) : (escuela.parte || escuela.ultimaNovedad) ? (
                <span className={styles.atenuado} data-testid="chip-vigente">{t.vistaPrevia.vigente}</span>
              ) : null}
            </dd>
          </div>
        )}
        {escuela.comedor !== undefined && (
          <div data-testid="preview-comedor">
            <dt>{t.vistaPrevia.comedor}</dt>
            <dd>{valorComedor(escuela.comedor)}</dd>
          </div>
        )}
        {escuela.posibleCentroEvacuados === true && (
          <div data-testid="preview-posible-centro">
            <dt>{t.vistaPrevia.evacuacion}</dt>
            <dd>{escuela.posibleCentroSinAntecedentes === true ? ETIQUETA_POSIBLE_CENTRO_SIN_ANTECEDENTES : ETIQUETA_POSIBLE_CENTRO}</dd>
          </div>
        )}
        {aislamiento !== null && (
          <div data-testid="preview-aislamiento">
            <dt>{t.vistaPrevia.aislamiento}</dt>
            <dd
              className={aislamiento === 3 ? styles.alerta : aislamiento === 2 ? styles.aviso : undefined}
              title={DESCRIPCIONES_AISLAMIENTO[aislamiento].detalle}
            >
              {DESCRIPCIONES_AISLAMIENTO[aislamiento].nombre}
            </dd>
          </div>
        )}
        {distanciaLocalidad && (
          <div data-testid="preview-distancia-localidad">
            <dt>{t.vistaPrevia.hastaLocalidad}</dt>
            <dd>
              {etiquetaKm(distanciaLocalidad.km)} {t.vistaPrevia.porCamino}
              {!distanciaLocalidad.desglose && distanciaLocalidad.superficie ? ` ${etiquetaSuperficie(distanciaLocalidad.superficie)}` : ''}
              {distanciaLocalidad.nombre && <span className={styles.atenuado}>{distanciaLocalidad.nombre}</span>}
              {distanciaLocalidad.desglose && <span className={styles.desglose}>{distanciaLocalidad.desglose}</span>}
            </dd>
          </div>
        )}
        <div data-testid="preview-bloque-riesgo">
          <dt>{t.vistaPrevia.antecedentes}</dt>
          <dd>
            {escuela.situacionesHistoricas === 0
              ? t.vistaPrevia.sinHistoricas
              : t.vistaPrevia.situacionesHistoricas(
                  FORMATO_NUMERO.format(escuela.situacionesHistoricas),
                  escuela.situacionesHistoricas === 1,
                )}
            {escuela.solucionadasRecientes > 0 && (
              <span className={styles.atenuado}>
                {t.vistaPrevia.solucionadas(FORMATO_NUMERO.format(escuela.solucionadasRecientes))}
              </span>
            )}
          </dd>
        </div>
      </dl>

      {extra}

      <div className={styles.actions}>
        <Link
          href={urlFichaCompleta}
          onClick={onAbrirFichaCompleta}
          className={styles.primaryCta}
          data-testid="abrir-ficha-completa"
        >
          {t.vistaPrevia.abrirFichaCompleta}
        </Link>
        <button
          type="button"
          className={styles.ghostBtn}
          data-testid="preview-quitar-seleccion"
          onClick={onQuitarSeleccion}
        >
          {t.vistaPrevia.quitarSeleccion}
        </button>
      </div>
    </section>
  )
}
