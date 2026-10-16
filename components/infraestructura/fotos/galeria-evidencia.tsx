'use client'

import { useEffect, useState } from 'react'
import { Images, X } from 'lucide-react'
import Image from 'next/image'
import styles from './galeria-evidencia.module.css'
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

export function GaleriaEvidencia({ cue }: { cue: string }) {
  const [movements, setMovements] = useState<MovimientoEvidencia[] | null>(null)
  const [error, setError] = useState(false)
  const [selected, setSelected] = useState<{ id: string; url: string } | null>(null)
  const [loadingPhoto, setLoadingPhoto] = useState<string | null>(null)
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    let active = true
    void fetchReportesOfflineFeatures().then((flags) => {
      if (!active || !flags.fotos) return
      setEnabled(true)
      return fetch(`/api/infraestructura/adjuntos?cue=${encodeURIComponent(cue)}`)
        .then(async (response) => {
          if (!response.ok) throw new Error('Could not load evidence')
          return response.json() as Promise<{ movements: MovimientoEvidencia[] }>
        })
        .then((result) => { if (active) setMovements(result.movements) })
        .catch(() => { if (active) setError(true) })
    })
    return () => { active = false }
  }, [cue])

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
  if (!enabled) return null

  return (
    <section className={styles.gallery} aria-label="Evidencia fotográfica">
      <h3><Images aria-hidden="true" /> Evidencia fotográfica{movements && total > 0 ? ` (${total})` : ''}</h3>
      {movements === null && !error && <p role="status">Cargando fotos…</p>}
      {error && <p role="alert">No se pudo cargar la evidencia fotográfica.</p>}
      {movements && total === 0 && <p>Sin fotos registradas.</p>}
      {movements?.map((movement) => (
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
