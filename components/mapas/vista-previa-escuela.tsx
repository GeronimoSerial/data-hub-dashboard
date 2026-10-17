'use client'

import { useEffect, useRef } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Clock, MapPinOff, X } from 'lucide-react'
import { TINTA_POR_SEVERIDAD } from '@/components/infraestructura/estado-actual-severidad'
import { ETIQUETA_ESTABLECIMIENTO } from '@/components/infraestructura/estado-actual-textos'
import { CATEGORIA_META, esCategoria } from '@/lib/infraestructura/categorias'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import { ETIQUETA_ESTADO_CLASES, etiquetaDepartamento } from '@/lib/infraestructura/mapa/etiquetas'
import { etiquetaApoyoMapa } from '@/lib/infraestructura/mapa/etiqueta-apoyo'
import type { EscuelaMapaEnriquecida } from '@/lib/infraestructura/mapa/tipos'
import type { ParteMapa } from '@/lib/infraestructura/parte-mapa'
import { SEVERIDADES } from '@/lib/infraestructura/validacion'
import { situacionPrincipal } from '@/lib/infraestructura/relevancia'
import { desde } from '@/components/infraestructura/actualizar/entrada-actualizar'
import styles from './vista-previa-escuela.module.css'

export interface VistaPreviaEscuelaProps {
  escuela: EscuelaMapaEnriquecida & {
    parte?: ParteMapa
    ubicacionDisponible?: boolean
  }
  urlFichaCompleta: string
  planificacion?: { etiquetaVista: string; etiquetaNivel: string }[] | null
  onCerrarVistaPrevia: () => void
  onQuitarSeleccion: () => void
  onAbrirFichaCompleta?: () => void
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
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(fecha)
}

export function VistaPreviaEscuela({
  escuela,
  urlFichaCompleta,
  planificacion = null,
  onCerrarVistaPrevia,
  onQuitarSeleccion,
  onAbrirFichaCompleta,
}: VistaPreviaEscuelaProps) {
  const tituloRef = useRef<HTMLHeadingElement>(null)
  const sinUbicacion =
    escuela.ubicacionDisponible === false ||
    escuela.lat === null ||
    escuela.lon === null

  const afectaciones = escuela.parte?.afectaciones ?? []
  const severidad = escuela.gravedad === 0 ? null : SEVERIDADES[escuela.gravedad - 1]
  const principal =
    afectaciones.length > 0 && escuela.parte
      ? situacionPrincipal(
          afectaciones.map((afectacion) => ({
            ...afectacion,
            estadoEstablecimiento: escuela.parte?.estadoEstablecimiento ?? 'habitual',
          })),
        )
      : null

  const categoriaLabel = principal
    ? CATEGORIA_META[principal.categoria].label
    : etiquetaCategoria(escuela.categoriaPrincipal)

  const etiquetaApoyo = etiquetaApoyoMapa(escuela.clases, escuela.apoyo)
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
      aria-label={`Vista previa de ${escuela.nombre}`}
      data-testid="vista-previa-escuela"
    >
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <h2 ref={tituloRef} tabIndex={-1} className={styles.title}>
            {escuela.nombre}
          </h2>
          <p className={styles.meta}>
            CUE {escuela.cueAnexo}
            {ubicacionTexto ? ` · ${ubicacionTexto}` : ''}
            {escuela.niveles.length > 0 ? ` · ${escuela.niveles.join(', ')}` : ''}
            {` · ${FORMATO_NUMERO.format(escuela.alumnos)} ${escuela.alumnos === 1 ? 'alumno' : 'alumnos'}`}
          </p>
        </div>
        <button
          type="button"
          className={styles.closeIconBtn}
          aria-label="Cerrar vista previa"
          data-testid="cerrar-preview"
          onClick={onCerrarVistaPrevia}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      {sinUbicacion && (
        <div className={styles.badgeSinUbicacion} data-testid="badge-sin-ubicacion">
          <MapPinOff size={14} aria-hidden="true" />
          <span>Ubicación no disponible en el mapa</span>
        </div>
      )}

      <div className={styles.section} data-testid="preview-bloque-situacion">
        <div className={styles.sectionHeader}>
          <p className={styles.sectionLabel}>Situación reportada (parte operativo)</p>
        </div>

        {severidad && (principal || escuela.gravedad > 0) ? (
          <div className={styles.situacionActiva}>
            <div className={styles.situacionHead}>
              <span className={styles.motivoPrincipal}>
                {principal ? principal.motivo : (categoriaLabel ?? 'Situación activa')}
              </span>
              <span
                className={styles.severidadBadge}
                style={{
                  backgroundColor: colorSeveridad(severidad),
                  color: TINTA_POR_SEVERIDAD[severidad],
                }}
              >
                Gravedad {severidad}
              </span>
            </div>
            <p className={styles.situacionMeta}>
              {afectaciones.length > 0
                ? `${afectaciones.length} ${afectaciones.length === 1 ? 'situación abierta' : 'situaciones abiertas'}`
                : 'Situación reportada'}
              {categoriaLabel ? ` · ${categoriaLabel}` : ''}
              {principal ? ` · desde ${desde(principal.rigeDesde)}` : ''}
              {escuela.parte
                ? ` · Edificio: ${ETIQUETA_ESTABLECIMIENTO[escuela.parte.estadoEstablecimiento]}`
                : ''}
            </p>
          </div>
        ) : escuela.parte ? (
          <p className={styles.sinReporteNotice} data-testid="preview-sin-situaciones">
            Sin situaciones abiertas reportadas
          </p>
        ) : (
          <p className={styles.sinReporteNotice} data-testid="preview-sin-reporte">
            Sin reporte activo (la ausencia de reporte no confirma normalidad)
          </p>
        )}
      </div>

      <div className={styles.section} data-testid="preview-bloque-clases">
        <p className={styles.sectionLabel}>Clases y vigencia</p>
        <div className={styles.chipsRow}>
          <span
            className={`${styles.chip} ${
              escuela.clases === 'normal'
                ? styles.chipOk
                : escuela.clases === 'parcial'
                  ? styles.chipAviso
                  : styles.chipAlerta
            }`}
          >
            {ETIQUETA_ESTADO_CLASES[escuela.clases]}
          </span>

          {etiquetaApoyo && <span className={styles.chip}>{etiquetaApoyo}</span>}

          {escuela.sinActualizar ? (
            <span
              className={`${styles.chip} ${styles.chipAviso}`}
              data-testid="chip-sin-actualizar"
            >
              <Clock size={12} aria-hidden="true" />
              Sin actualizar (&gt;72 h)
            </span>
          ) : (escuela.parte || escuela.ultimaNovedad) ? (
            <span className={`${styles.chip} ${styles.chipOk}`} data-testid="chip-vigente">
              Vigente
            </span>
          ) : null}

          {fechaActualizacion && (
            <span className={styles.chip}>Actualizado: {fechaActualizacion}</span>
          )}
        </div>
      </div>

      <div className={styles.section} data-testid="preview-bloque-riesgo">
        <p className={styles.sectionLabel}>Exposición y riesgo estimado</p>
        <div className={styles.riesgoBox}>
          <p className={styles.riesgoItem}>
            Antecedentes registrados:{' '}
            {escuela.situacionesHistoricas === 0
              ? 'Sin situaciones históricas'
              : `${FORMATO_NUMERO.format(escuela.situacionesHistoricas)} ${
                  escuela.situacionesHistoricas === 1 ? 'situación histórica' : 'situaciones históricas'
                }`}
            {escuela.solucionadasRecientes > 0
              ? ` · ${FORMATO_NUMERO.format(escuela.solucionadasRecientes)} solucionada(s) recientemente`
              : ''}
          </p>
          {planificacion && planificacion.length > 0 && (
            <p className={styles.riesgoItem}>
              {planificacion.map((item) => `${item.etiquetaVista}: ${item.etiquetaNivel}`).join(' · ')}
            </p>
          )}
        </div>
      </div>

      <div className={styles.actions}>
        <Link
          href={urlFichaCompleta}
          onClick={onAbrirFichaCompleta}
          className={styles.primaryCta}
          data-testid="abrir-ficha-completa"
        >
          <span>Abrir ficha completa</span>
          <ArrowUpRight size={15} aria-hidden="true" />
        </Link>

        <div className={styles.secondaryActions}>
          <button
            type="button"
            className={styles.secondaryBtn}
            data-testid="cerrar-vista-previa-btn"
            onClick={onCerrarVistaPrevia}
          >
            Cerrar vista previa
          </button>
          <button
            type="button"
            className={styles.ghostBtn}
            data-testid="preview-quitar-seleccion"
            onClick={onQuitarSeleccion}
          >
            Quitar selección
          </button>
        </div>
      </div>
    </section>
  )
}
