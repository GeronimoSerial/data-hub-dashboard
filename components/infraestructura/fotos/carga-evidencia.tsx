'use client'

import { useEffect, useRef, useState, type JSX } from 'react'
import Link from 'next/link'
import { declararFotosFormulario, SinParteError, type FotoPreparada } from '@/lib/infraestructura/fotos/flujo-formulario'
import { SelectorFotosFormulario } from './selector-fotos-formulario'
import styles from './galeria-evidencia.module.css'
import { EVENTO_FOTOS, obtenerOperacionFotos, type OperacionFoto } from '@/lib/infraestructura/fotos/operaciones'
import { iniciarSubidaFotos, drenarColaFotos } from '@/lib/infraestructura/fotos/subida-cola'

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
  const clave = useRef<string | null>(null)
  const [operacion, setOperacion] = useState<OperacionFoto | null>(null)
  const [restaurando, setRestaurando] = useState(true)
  const [preparadas, setPreparadas] = useState<readonly FotoPreparada[]>([])
  const [cantidad, setCantidad] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sinParte, setSinParte] = useState(false)

  useEffect(() => {
    let active = true
    const actualizar = () => {
      void obtenerOperacionFotos(draftId).then((op) => {
        if (!active) return
        setOperacion(op)
        setRestaurando(false)
      }).catch(() => {
        if (active) { setRestaurando(false); setError('No se pudo abrir el almacenamiento local de fotos.') }
      })
    }
    actualizar()
    window.addEventListener(EVENTO_FOTOS, actualizar)
    iniciarSubidaFotos()
    return () => { active = false; window.removeEventListener(EVENTO_FOTOS, actualizar) }
  }, [draftId])

  const listas = cantidad > 0 && preparadas.length === cantidad
  const pendiente = operacion && operacion.estado !== 'confirmada' ? operacion : null

  async function guardar(): Promise<void> {
    if (enviando || (!listas && !pendiente)) return
    setEnviando(true)
    setError(null)
    setSinParte(false)
    try {
      await declararFotosFormulario({
        draftId,
        movimientoBaseId: pendiente?.movimientoBaseId ?? movimientoBaseId ?? undefined,
        cue,
        idempotencyKey: pendiente?.idempotencyKey ?? (clave.current ??= crypto.randomUUID()),
        fotos: pendiente?.fotos ?? preparadas,
      })
      await drenarColaFotos()
      onGuardado()
    } catch (reason) {
      setSinParte(reason instanceof SinParteError)
      setError(reason instanceof Error ? reason.message : 'No se pudieron guardar las fotos.')
      setEnviando(false)
    }
  }

  return (
    <div className={styles.upload} data-testid="carga-evidencia">
      {!restaurando && !pendiente && !enviando && <SelectorFotosFormulario draftId={draftId} onPreparadasChange={setPreparadas} onCountChange={setCantidad} />}
      {restaurando && <p role="status">Recuperando cargas guardadas…</p>}
      {operacion && <p role="status">Carga de fotos: {operacion.estado}. {pendiente ? `${pendiente.fotos.length} fotos conservadas en este dispositivo.` : ''}</p>}
      <p className={styles.uploadNote}>Hasta 3 fotos por actualización del parte.</p>
      {error ? (
        <p role="alert">
          {error}
          {sinParte && urlCargarParte ? (
            <>
              {' '}
              <Link href={urlCargarParte} className={styles.attach}>
                Cargar el reporte
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      <div className={styles.uploadActions}>
        <button type="button" className={styles.browse} onClick={onCancelar} disabled={enviando}>
          Cancelar
        </button>
        <button type="button" className={styles.save} onClick={() => void guardar()} disabled={restaurando || (!listas && !pendiente) || enviando}>
          {enviando ? 'Guardando…' : pendiente ? 'Reintentar carga guardada' : cantidad > 1 ? `Guardar ${cantidad} fotos` : 'Guardar foto'}
        </button>
      </div>
    </div>
  )
}
