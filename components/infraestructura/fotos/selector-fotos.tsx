'use client'

import { useEffect, useId, useRef, useState, type ChangeEvent, type JSX } from 'react'
import { MAX_FOTOS_POR_ENVIO } from '@/lib/infraestructura/reportes-offline-contratos'
import { fetchReportesOfflineFeatures } from '@/lib/infraestructura/parte/feature-flags-client'
import styles from './selector-fotos.module.css'

interface FotoSeleccionada {
  id: string
  archivo: File
  vistaPrevia: string
}

export interface SelectorFotosProps {
  /** Selected original files are returned as Blob references; no bytes are copied or uploaded. */
  onChange: (fotos: readonly Blob[]) => void
  onItemsChange?: (fotos: readonly { attachmentId: string; original: Blob }[]) => void
  disabled?: boolean
}

export function SelectorFotos({ onChange, onItemsChange, disabled = false }: SelectorFotosProps): JSX.Element | null {
  const inputId = useId()
  const helpId = useId()
  const fotosRef = useRef<FotoSeleccionada[]>([])
  const objectUrls = useRef(new Set<string>())
  const [fotos, setFotos] = useState<FotoSeleccionada[]>([])
  const [mensaje, setMensaje] = useState('')
  const [enabled, setEnabled] = useState(false)
  const disponibles = MAX_FOTOS_POR_ENVIO - fotos.length

  useEffect(() => () => {
    for (const url of objectUrls.current) URL.revokeObjectURL(url)
    objectUrls.current.clear()
  }, [])

  useEffect(() => {
    let active = true
    void fetchReportesOfflineFeatures().then((flags) => {
      if (active) setEnabled(flags.fotos)
    })
    return () => { active = false }
  }, [])

  function manejarSeleccion(event: ChangeEvent<HTMLInputElement>) {
    const seleccionados = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ''

    const imagenes = seleccionados.filter((archivo) => archivo.type.startsWith('image/'))
    const rechazadosPorFormato = seleccionados.length - imagenes.length
    const agregables = imagenes.slice(0, disponibles)
    const omitidos = seleccionados.length - agregables.length
    const siguientes = [...fotos, ...agregables.map((archivo) => {
      const vistaPrevia = URL.createObjectURL(archivo)
      objectUrls.current.add(vistaPrevia)
      return { id: crypto.randomUUID(), archivo, vistaPrevia }
    })]

    fotosRef.current = siguientes
    setFotos(siguientes)
    onChange(siguientes.map(({ archivo }) => archivo))
    onItemsChange?.(siguientes.map(({ id, archivo }) => ({ attachmentId: id, original: archivo })))

    const avisos: string[] = []
    if (omitidos > rechazadosPorFormato) {
      avisos.push(`Se pueden agregar hasta ${MAX_FOTOS_POR_ENVIO} fotos. Se omitieron ${omitidos - rechazadosPorFormato}.`)
    }
    if (rechazadosPorFormato > 0) {
      avisos.push(`Se omitieron ${rechazadosPorFormato} archivos que no son imágenes.`)
    }
    setMensaje(avisos.join(' '))
  }

  function quitarFoto(foto: FotoSeleccionada) {
    const siguientes = fotosRef.current.filter(({ id }) => id !== foto.id)
    URL.revokeObjectURL(foto.vistaPrevia)
    objectUrls.current.delete(foto.vistaPrevia)
    fotosRef.current = siguientes
    setFotos(siguientes)
    onChange(siguientes.map(({ archivo }) => archivo))
    onItemsChange?.(siguientes.map(({ id, archivo }) => ({ attachmentId: id, original: archivo })))
    setMensaje('')
  }

  if (!enabled) return null

  return (
    <section className={styles.picker} aria-label="Fotos del reporte">
      <div className={styles.encabezado}>
        <label className={styles.etiqueta} htmlFor={inputId}>Agregar fotos</label>
        <span className={styles.contador}>{fotos.length} de {MAX_FOTOS_POR_ENVIO} fotos</span>
      </div>
      <p className={styles.ayuda} id={helpId}>Elegí hasta tres imágenes para adjuntar al reporte.</p>
      <input
        className={styles.entrada}
        id={inputId}
        type="file"
        accept="image/*"
        multiple
        disabled={disabled || disponibles === 0}
        aria-describedby={`${helpId} ${inputId}-estado`}
        onChange={manejarSeleccion}
      />
      <p className={styles.estado} id={`${inputId}-estado`} role="status" aria-live="polite">
        {mensaje || `${fotos.length} de ${MAX_FOTOS_POR_ENVIO} fotos seleccionadas.`}
      </p>
      {fotos.length > 0 ? (
        <ul className={styles.lista} aria-label="Fotos seleccionadas">
          {fotos.map((foto) => (
            <li className={styles.foto} key={foto.id}>
              {/* The original File is used only to make a local preview. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.vistaPrevia} src={foto.vistaPrevia} alt={foto.archivo.name} />
              <span className={styles.nombre} title={foto.archivo.name}>{foto.archivo.name}</span>
              <button
                className={styles.quitar}
                type="button"
                disabled={disabled}
                aria-label={`Quitar ${foto.archivo.name}`}
                onClick={() => quitarFoto(foto)}
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
