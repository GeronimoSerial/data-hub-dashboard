'use client'

import { useState, type JSX } from 'react'
import Link from 'next/link'
import { declararFotosFormulario, SinParteError, type FotoPreparada } from '@/lib/infraestructura/fotos/flujo-formulario'
import { useTextos } from '@/lib/i18n/idioma-provider'
import { SelectorFotosFormulario } from './selector-fotos-formulario'
import styles from './galeria-evidencia.module.css'

const DRAFT_ID_PREFIX = 'evidencia-ficha:'

// Attaches photos to the latest movement of the school's report, without editing the report itself.
export function CargaEvidencia({
  cue,
  movimientoBaseId,
  urlCargarParte,
  onGuardado,
  onCancelar,
}: {
  cue: string
  /** Optional: when unknown the server attaches to the school's latest report movement. */
  movimientoBaseId?: string | null
  /** Report form, offered when the school has no report to attach photos to. */
  urlCargarParte?: string
  onGuardado: () => void
  onCancelar: () => void
}): JSX.Element {
  const draftId = `${DRAFT_ID_PREFIX}${cue}`
  const t = useTextos().parteGaleria.carga
  const [clave] = useState(() => crypto.randomUUID())
  const [preparadas, setPreparadas] = useState<readonly FotoPreparada[]>([])
  const [cantidad, setCantidad] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sinParte, setSinParte] = useState(false)

  const listas = cantidad > 0 && preparadas.length === cantidad

  async function guardar(): Promise<void> {
    if (!listas) return
    setEnviando(true)
    setError(null)
    setSinParte(false)
    try {
      await declararFotosFormulario({
        draftId,
        movimientoBaseId: movimientoBaseId ?? undefined,
        cue,
        idempotencyKey: clave,
        fotos: preparadas,
      })
      onGuardado()
    } catch (reason) {
      setSinParte(reason instanceof SinParteError)
      setError(reason instanceof Error ? reason.message : t.noGuardadas)
      setEnviando(false)
    }
  }

  return (
    <div className={styles.upload} data-testid="carga-evidencia">
      <SelectorFotosFormulario draftId={draftId} onPreparadasChange={setPreparadas} onCountChange={setCantidad} />
      <p className={styles.uploadNote}>{t.ayuda}</p>
      {error ? (
        <p role="alert">
          {error}
          {sinParte && urlCargarParte ? (
            <>
              {' '}
              <Link href={urlCargarParte} className={styles.attach}>
                {t.cargarReporte}
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      <div className={styles.uploadActions}>
        <button type="button" className={styles.browse} onClick={onCancelar} disabled={enviando}>
          Cancelar
        </button>
        <button type="button" className={styles.save} onClick={() => void guardar()} disabled={!listas || enviando}>
          {enviando ? t.guardando : cantidad > 1 ? t.guardarFotos(cantidad) : t.guardarFoto}
        </button>
      </div>
    </div>
  )
}
