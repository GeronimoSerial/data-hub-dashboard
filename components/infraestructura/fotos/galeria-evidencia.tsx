'use client'

import { useEffect, useState, type JSX } from 'react'
import { ArrowUpRight, Camera, Plus, X } from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import styles from './galeria-evidencia.module.css'
import { CargaEvidencia } from './carga-evidencia'
import { fetchReportesOfflineFeatures } from '@/lib/infraestructura/parte/feature-flags-client'

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
    : new Intl.DateTimeFormat('es-AR', { dateStyle: 'long', timeStyle: 'short' }).format(date)
}

function etiquetaMovimiento(type: string): string {
  if (type === 'evidencia_fotografica') return 'Evidencia adicional'
  if (type === 'reporte_inicial') return 'Reporte inicial'
  if (type === 'actualizacion') return 'Actualización'
  return 'Movimiento'
}

export function GaleriaEvidencia({
  cue,
  accionAdjuntar,
  movimientoBaseId,
  className,
}: {
  cue: string
  /** Report form to open when the school has no report to attach photos to yet. */
  accionAdjuntar?: string
  /** Latest report movement; with it photos are attached right here. */
  movimientoBaseId?: string | null
  className?: string
}) {
  const [movements, setMovements] = useState<MovimientoEvidencia[] | null>(null)
  const [error, setError] = useState(false)
  const [selected, setSelected] = useState<{ id: string; url: string } | null>(null)
  const [loadingPhoto, setLoadingPhoto] = useState<string | null>(null)
  const [flag, setFlag] = useState<'pending' | 'on' | 'off'>('pending')
  const [cargando, setCargando] = useState(false)
  const [recarga, setRecarga] = useState(0)
  const [aviso, setAviso] = useState<string | null>(null)

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

  async function openPhoto(attachmentId: string) {
    setLoadingPhoto(attachmentId)
    try {
      const response = await fetch(`/api/infraestructura/adjuntos?cue=${encodeURIComponent(cue)}&attachmentId=${encodeURIComponent(attachmentId)}&variant=optimizada`)
      if (!response.ok) throw new Error('Could not open evidence')
      const result = await response.json() as { url: string }
      setSelected({ id: attachmentId, url: result.url })
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
  const adjuntarAqui = flag === 'on' && Boolean(movimientoBaseId)
  const adjuntar = flag === 'on' && !movimientoBaseId ? accionAdjuntar : undefined

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
    if (adjuntar) {
      return (
        <Link href={adjuntar} className={clase}>
          {clase === styles.attach && icono}
          {texto}
          {clase !== styles.attach && icono}
        </Link>
      )
    }
    return null
  }

  return (
    <section className={[styles.gallery, className].filter(Boolean).join(' ')} aria-label="Evidencia fotográfica">
      <div className={styles.header}>
        <div className={styles.heading}>
          <h3>Evidencia fotográfica</h3>
          {lista && <span className={styles.count}>{total === 1 ? '1 adjunto' : `${total} adjuntos`}</span>}
        </div>
        {!cargando && accionCarga(styles.attach, 'Adjuntar foto', <Plus aria-hidden="true" />)}
      </div>
      {cargando && movimientoBaseId && (
        <CargaEvidencia
          cue={cue}
          movimientoBaseId={movimientoBaseId}
          onCancelar={() => setCargando(false)}
          onGuardado={() => {
            setCargando(false)
            setAviso('Fotos guardadas. Se suben en segundo plano y aparecen acá cuando terminan.')
            setRecarga((valor) => valor + 1)
          }}
        />
      )}
      {aviso && <p role="status" className={styles.uploadNote}>{aviso}</p>}
      {lista === null && !error && <p role="status">Cargando fotos…</p>}
      {error && <p role="alert">No se pudo cargar la evidencia fotográfica.</p>}
      {lista && total === 0 && !cargando && (
        <div className={styles.empty}>
          <span className={styles.emptyIcon} aria-hidden="true"><Camera /></span>
          <div>
            <p className={styles.emptyTitle}>Sin imágenes registradas</p>
            <p className={styles.emptyText}>Se pueden adjuntar fotografías del estado de caminos, accesos o del predio escolar.</p>
          </div>
          {accionCarga(styles.browse, 'Examinar archivos', <ArrowUpRight aria-hidden="true" />)}
        </div>
      )}
      {lista?.map((movement) => (
        <section className={styles.movement} key={movement.id}>
          <h4>{etiquetaMovimiento(movement.type)} · {fechaMovimiento(movement.createdAt)}</h4>
          <div className={styles.photos}>
            {movement.photos.map((photo) => (
              <button
                key={photo.attachmentId}
                type="button"
                aria-label={`Ampliar foto del ${fechaMovimiento(movement.createdAt)}`}
                aria-busy={loadingPhoto === photo.attachmentId}
                onClick={() => void openPhoto(photo.attachmentId)}
              >
                <Image src={photo.thumbnailUrl} alt="" width={80} height={80} unoptimized loading="lazy" />
              </button>
            ))}
          </div>
        </section>
      ))}
      {selected && (
        <div className={styles.viewer} role="dialog" aria-modal="true" aria-label="Foto ampliada" onClick={() => setSelected(null)}>
          <button type="button" aria-label="Cerrar foto" onClick={() => setSelected(null)}><X aria-hidden="true" /></button>
          <Image src={selected.url} alt="Evidencia fotográfica ampliada" width={1600} height={1200} unoptimized onClick={(event) => event.stopPropagation()} />
        </div>
      )}
    </section>
  )
}
