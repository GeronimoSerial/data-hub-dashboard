'use client'

import { localeRegion } from '@/lib/infraestructura/formato-region'
import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { ArrowUpRight, Camera, Plus } from 'lucide-react'
import Image from 'next/image'
import { LightGallery, type GalleryItem } from '@lightgallery/react'
import Thumbnail from '@lightgallery/react/plugins/thumbnail'
import Zoom from '@lightgallery/react/plugins/zoom'
import styles from './galeria-evidencia.module.css'
import { CargaEvidencia } from './carga-evidencia'
import { fetchReportesOfflineFeatures } from '@/lib/infraestructura/parte/feature-flags-client'
import { useTextos } from '@/lib/i18n/idioma-provider'
import type { Diccionario } from '@/lib/i18n'

type Etiquetas = Diccionario['parteGaleria']['etiquetas']
type FotoEvidencia = { attachmentId: string; thumbnailUrl: string }
type MovimientoEvidencia = {
  id: string
  type: string
  createdAt: string
  photos: FotoEvidencia[]
}

function fechaMovimiento(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(localeRegion(), { dateStyle: 'long', timeStyle: 'short' }).format(date)
}

function etiquetaMovimiento(type: string, etiquetas: Etiquetas): string {
  if (type === 'evidencia_fotografica') return etiquetas.evidenciaAdicional
  if (type === 'reporte_inicial') return etiquetas.reporteInicial
  if (type === 'actualizacion') return etiquetas.actualizacion
  return etiquetas.movimiento
}

export function GaleriaEvidencia({
  cue,
  movimientoBaseId,
  urlCargarParte,
  className,
}: {
  cue: string
  /** Latest report movement; when omitted the server resolves it from the CUE. */
  movimientoBaseId?: string | null
  /** Report form, offered when the school has no report yet. */
  urlCargarParte?: string
  className?: string
}) {
  const [movements, setMovements] = useState<MovimientoEvidencia[] | null>(null)
  const [error, setError] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [gallerySlides, setGallerySlides] = useState<GalleryItem[]>([])
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [galleryContainer, setGalleryContainer] = useState<HTMLElement | null>(null)
  const [loadingPhoto, setLoadingPhoto] = useState<string | null>(null)
  const [flag, setFlag] = useState<'pending' | 'on' | 'off'>('pending')
  const [cargando, setCargando] = useState(false)
  const [recarga, setRecarga] = useState(0)
  const [aviso, setAviso] = useState<string | null>(null)
  const openerRef = useRef<HTMLButtonElement | null>(null)
  const t = useTextos().parteGaleria
  const photos = useMemo(() => (movements ?? []).flatMap((movement) =>
    movement.photos.map((photo) => ({ movement, photo })),
  ), [movements])

  useEffect(() => {
    let active = true
    void fetchReportesOfflineFeatures().then((flags) => {
      if (!active) return
      if (!flags.fotos) {
        setFlag('off')
        return
      }
      setFlag('on')
      return fetch(`/api/infraestructura/adjuntos?cue=${encodeURIComponent(cue)}`)
        .then(async (response) => {
          if (!response.ok) throw new Error('Could not load evidence')
          return response.json() as Promise<{ movements: MovimientoEvidencia[] }>
        })
        .then((result) => { if (active) setMovements(result.movements) })
        .catch(() => { if (active) setError(true) })
    })
    return () => { active = false }
  }, [cue, recarga])

  useEffect(() => {
    function updateGalleryContainer() {
      setGalleryContainer(document.fullscreenElement instanceof HTMLElement ? document.fullscreenElement : document.body)
    }

    updateGalleryContainer()
    document.addEventListener('fullscreenchange', updateGalleryContainer)
    return () => document.removeEventListener('fullscreenchange', updateGalleryContainer)
  }, [])

  async function openPhoto(attachmentId: string, opener: HTMLButtonElement) {
    const selectedIndex = photos.findIndex(({ photo }) => photo.attachmentId === attachmentId)
    if (selectedIndex < 0) return

    setLoadingPhoto(attachmentId)
    try {
      const slides = await Promise.all(photos.map(async ({ movement, photo }) => {
        const response = await fetch(`/api/infraestructura/adjuntos?cue=${encodeURIComponent(cue)}&attachmentId=${encodeURIComponent(photo.attachmentId)}&variant=optimizada`)
        if (!response.ok) throw new Error('Could not load evidence')
        const result = await response.json() as { url: string }
        return {
          src: result.url,
          thumb: photo.thumbnailUrl,
          alt: t.galeria.alt,
          caption: t.galeria.caption(etiquetaMovimiento(movement.type, t.etiquetas), fechaMovimiento(movement.createdAt)),
          downloadUrl: false as const,
        }
      }))
      setGallerySlides(slides)
      setGalleryIndex(selectedIndex)
      openerRef.current = opener
      setGalleryOpen(true)
    } catch {
      setError(true)
    } finally {
      setLoadingPhoto(null)
    }
  }

  const total = movements?.reduce((sum, movement) => sum + movement.photos.length, 0) ?? 0
  if (flag === 'pending') return null
  // Without the photo feature the section still shows, as an honest empty state.
  const lista = flag === 'off' ? [] : movements
  // With the photo feature on, photos are always attached right here.
  const adjuntarAqui = flag === 'on'

  function abrirCarga() {
    setAviso(null)
    setCargando(true)
  }

  function accionCarga(clase: string, texto: string, icono: JSX.Element) {
    if (adjuntarAqui) {
      return (
        <button type="button" className={clase} onClick={abrirCarga} aria-expanded={cargando}>
          {clase === styles.attach && icono}
          {texto}
          {clase !== styles.attach && icono}
        </button>
      )
    }
    return null
  }

  return (
    <section className={[styles.gallery, className].filter(Boolean).join(' ')} aria-label={t.galeria.titulo}>
      <div className={styles.header}>
        <div className={styles.heading}>
          <h3>{t.galeria.titulo}</h3>
          {lista && <span className={styles.count}>{total === 1 ? t.galeria.adjunto1 : t.galeria.adjuntos(total)}</span>}
        </div>
        {!cargando && accionCarga(styles.attach, t.galeria.adjuntar, <Plus aria-hidden="true" />)}
      </div>
      {cargando && (
        <CargaEvidencia
          cue={cue}
          movimientoBaseId={movimientoBaseId}
          urlCargarParte={urlCargarParte}
          onCancelar={() => setCargando(false)}
          onGuardado={() => {
            setCargando(false)
            setAviso(t.galeria.guardadas)
            setRecarga((valor) => valor + 1)
          }}
        />
      )}
      {aviso && <p role="status" className={styles.uploadNote}>{aviso}</p>}
      {lista === null && !error && <p role="status">{t.galeria.cargando}</p>}
      {error && <p role="alert">{t.galeria.error}</p>}
      {lista && total === 0 && !cargando && (
        <div className={styles.empty}>
          <span className={styles.emptyIcon} aria-hidden="true"><Camera /></span>
          <div>
            <p className={styles.emptyTitle}>{t.galeria.sinImagenes}</p>
            <p className={styles.emptyText}>{t.galeria.sinImagenesTexto}</p>
          </div>
          {accionCarga(styles.browse, t.galeria.examinar, <ArrowUpRight aria-hidden="true" />)}
        </div>
      )}
      {lista?.map((movement) => (
        <section className={styles.movement} key={movement.id}>
          <h4>{t.galeria.caption(etiquetaMovimiento(movement.type, t.etiquetas), fechaMovimiento(movement.createdAt))}</h4>
          <div className={styles.photos}>
            {movement.photos.map((photo) => (
              <button
                key={photo.attachmentId}
                type="button"
                aria-label={t.galeria.ampliar(fechaMovimiento(movement.createdAt))}
                aria-busy={loadingPhoto === photo.attachmentId}
                onClick={(event) => void openPhoto(photo.attachmentId, event.currentTarget)}
              >
                <Image src={photo.thumbnailUrl} alt="" width={80} height={80} unoptimized loading="lazy" />
              </button>
            ))}
          </div>
        </section>
      ))}
      <LightGallery
        className={styles.viewer}
        slides={gallerySlides}
        open={galleryOpen}
        index={galleryIndex}
        onClose={() => setGalleryOpen(false)}
        onAfterClose={() => {
          if (openerRef.current?.isConnected) openerRef.current.focus({ preventScroll: true })
          openerRef.current = null
        }}
        onIndexChange={setGalleryIndex}
        container={galleryContainer}
        plugins={[Thumbnail, Zoom]}
        closeOnTap
        trapFocus
        strings={{
          closeGallery: t.visor.cerrar,
          toggleMaximize: t.visor.pantallaCompleta,
          previousSlide: t.visor.anterior,
          nextSlide: t.visor.siguiente,
          download: t.visor.descargar,
          playVideo: t.visor.reproducir,
          mediaLoadingFailed: t.visor.errorImagen,
          galleryLabel: t.visor.galeria,
          slideAnnouncement: t.visor.imagen,
          moreOptions: t.visor.masOpciones,
          share: t.visor.compartir,
          toggleThumbnails: t.visor.miniaturas,
          toggleAutoplay: t.visor.presentacion,
          toggleFullscreen: t.visor.pantallaCompleta,
          zoomIn: t.visor.acercar,
          zoomOut: t.visor.alejar,
          viewActualSize: t.visor.tamanoReal,
          rotateLeft: t.visor.girarIzquierda,
          rotateRight: t.visor.girarDerecha,
        }}
      />
    </section>
  )
}
