'use client'

import { useEffect, useId, useRef, useState, type ChangeEvent, type JSX } from 'react'
import { MAX_FOTOS_POR_ENVIO } from '@/lib/infraestructura/reportes-offline-contratos'
import { fetchReportesOfflineFeatures } from '@/lib/infraestructura/parte/feature-flags-client'
import { useTextos } from '@/lib/i18n/idioma-provider'
import type { FotoPreparada } from '@/lib/infraestructura/fotos/flujo-formulario'
import styles from './selector-fotos.module.css'

export interface FotoSeleccionada {
  id: string
  nombre: string
  /** Object URL of a thumbnail; the owner of the entry revokes it. */
  vistaPrevia: string
  /** Original picked on this device. Photos restored from a draft have none. */
  original?: Blob
  /** Prepared metadata of a restored photo, so the form does not process it again. */
  preparada?: FotoPreparada
}

export interface SelectorFotosProps {
  /** Selected original files are returned as Blob references; no bytes are copied or uploaded. */
  onChange: (fotos: readonly Blob[]) => void
  /** Lista controlada: el padre es la única fuente de las fotos elegidas. Sin ella, el selector la mantiene. */
  fotos?: readonly FotoSeleccionada[]
  onFotosChange?: (fotos: readonly FotoSeleccionada[]) => void
  disabled?: boolean
}

export function SelectorFotos({ onChange, fotos: fotosControladas, onFotosChange, disabled = false }: SelectorFotosProps): JSX.Element | null {
  const inputId = useId()
  const helpId = useId()
  const objectUrls = useRef(new Set<string>())
  const [internas, setInternas] = useState<readonly FotoSeleccionada[]>([])
  const fotos = fotosControladas ?? internas
  const [mensaje, setMensaje] = useState('')
  const [enabled, setEnabled] = useState(false)
  const disponibles = MAX_FOTOS_POR_ENVIO - fotos.length
  const t = useTextos().parteGaleria.fotos

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

  function emitir(siguientes: readonly FotoSeleccionada[]) {
    if (fotosControladas === undefined) setInternas(siguientes)
    onFotosChange?.(siguientes)
    onChange(siguientes.flatMap((foto) => (foto.original ? [foto.original] : [])))
  }

  function manejarSeleccion(event: ChangeEvent<HTMLInputElement>) {
    const seleccionados = Array.from(event.currentTarget.files ?? [])
    event.currentTarget.value = ''

    const imagenes = seleccionados.filter((archivo) => archivo.type.startsWith('image/'))
    const rechazadosPorFormato = seleccionados.length - imagenes.length
    const agregables = imagenes.slice(0, disponibles)
    const omitidos = seleccionados.length - agregables.length
    emitir([...fotos, ...agregables.map((archivo) => {
      const vistaPrevia = URL.createObjectURL(archivo)
      objectUrls.current.add(vistaPrevia)
      return { id: crypto.randomUUID(), nombre: archivo.name, vistaPrevia, original: archivo }
    })])

    const avisos: string[] = []
    if (omitidos > rechazadosPorFormato) {
      avisos.push(t.omitidasLimite(MAX_FOTOS_POR_ENVIO, omitidos - rechazadosPorFormato))
    }
    if (rechazadosPorFormato > 0) {
      avisos.push(t.omitidasFormato(rechazadosPorFormato))
    }
    setMensaje(avisos.join(' '))
  }

  function quitarFoto(foto: FotoSeleccionada) {
    if (objectUrls.current.delete(foto.vistaPrevia)) URL.revokeObjectURL(foto.vistaPrevia)
    emitir(fotos.filter(({ id }) => id !== foto.id))
    setMensaje('')
  }

  if (!enabled) return null

  return (
    <section className={styles.picker} aria-label={fotos.length > 0 ? t.parte : t.reporte}>
      <div className={styles.encabezado}>
        <label className={styles.etiqueta} htmlFor={inputId}>{fotos.length > 0 ? t.agregarMas : t.agregar}</label>
        <span className={styles.contador}>{t.contador(fotos.length, MAX_FOTOS_POR_ENVIO)}</span>
      </div>
      <p className={styles.ayuda} id={helpId}>{t.ayuda}</p>
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
        {mensaje || t.estado(fotos.length, MAX_FOTOS_POR_ENVIO)}
      </p>
      {fotos.length > 0 ? (
        <ul className={styles.lista} aria-label={t.seleccionadas}>
          {fotos.map((foto) => (
            <li className={styles.foto} key={foto.id}>
              {/* The thumbnail is a local preview; no original bytes are uploaded from here. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.vistaPrevia} src={foto.vistaPrevia} alt={foto.nombre} />
              <span className={styles.nombre} title={foto.nombre}>{foto.nombre}</span>
              <button
                className={styles.quitar}
                type="button"
                disabled={disabled}
                aria-label={t.quitarAria(foto.nombre)}
                onClick={() => quitarFoto(foto)}
              >
                {t.quitar}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
