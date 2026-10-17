'use client'

import { useState, type JSX } from 'react'
import { declararFotosFormulario, type FotoPreparada } from '@/lib/infraestructura/fotos/flujo-formulario'
import { SelectorFotosFormulario } from './selector-fotos-formulario'
import styles from './galeria-evidencia.module.css'

const DRAFT_ID_PREFIX = 'evidencia-ficha:'

// Attaches photos to the latest movement of the school's report, without editing the report itself.
export function CargaEvidencia({
  cue,
  movimientoBaseId,
  onGuardado,
  onCancelar,
}: {
  cue: string
  movimientoBaseId: string
  onGuardado: () => void
  onCancelar: () => void
}): JSX.Element {
  const draftId = `${DRAFT_ID_PREFIX}${cue}`
  const [clave] = useState(() => crypto.randomUUID())
  const [preparadas, setPreparadas] = useState<readonly FotoPreparada[]>([])
  const [cantidad, setCantidad] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const listas = cantidad > 0 && preparadas.length === cantidad

  async function guardar(): Promise<void> {
    if (!listas) return
    setEnviando(true)
    setError(null)
    try {
      await declararFotosFormulario({ draftId, movimientoBaseId, idempotencyKey: clave, fotos: preparadas })
      onGuardado()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudieron guardar las fotos.')
      setEnviando(false)
    }
  }

  return (
    <div className={styles.upload} data-testid="carga-evidencia">
      <SelectorFotosFormulario draftId={draftId} onPreparadasChange={setPreparadas} onCountChange={setCantidad} />
      <p className={styles.uploadNote}>Hasta 3 fotos por actualización del parte.</p>
      {error ? <p role="alert">{error}</p> : null}
      <div className={styles.uploadActions}>
        <button type="button" className={styles.browse} onClick={onCancelar} disabled={enviando}>
          Cancelar
        </button>
        <button type="button" className={styles.save} onClick={() => void guardar()} disabled={!listas || enviando}>
          {enviando ? 'Guardando…' : cantidad > 1 ? `Guardar ${cantidad} fotos` : 'Guardar foto'}
        </button>
      </div>
    </div>
  )
}
