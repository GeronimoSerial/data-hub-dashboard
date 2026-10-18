'use client'

import { useEffect, useRef, useState, type JSX } from 'react'
import { prepararFotosFormulario, type FotoPreparada } from '@/lib/infraestructura/fotos/flujo-formulario'
import { descartarSubidaFotoNoDeclarada } from '@/lib/infraestructura/fotos/subida-cola'
import { fetchReportesOfflineFeatures } from '@/lib/infraestructura/parte/feature-flags-client'
import { SelectorFotos, type FotoSeleccionada } from './selector-fotos'

export function SelectorFotosFormulario({
  draftId,
  fotos: fotosControladas,
  onFotosChange,
  onPreparadasChange,
  onCountChange,
  onHabilitadaChange,
}: {
  draftId: string
  /** Lista controlada por el padre; sin ella, el formulario mantiene su propia lista. */
  fotos?: readonly FotoSeleccionada[]
  onFotosChange?: (fotos: readonly FotoSeleccionada[]) => void
  onPreparadasChange: (fotos: readonly FotoPreparada[]) => void
  onCountChange?: (count: number) => void
  /** Informa si las fotos están habilitadas en esta instalación (false: no hay selector). */
  onHabilitadaChange?: (habilitada: boolean) => void
}): JSX.Element {
  useEffect(() => {
    let activo = true
    void fetchReportesOfflineFeatures().then((flags) => {
      if (activo) onHabilitadaChange?.(flags.fotos)
    })
    return () => { activo = false }
  }, [onHabilitadaChange])

  const elegidasRef = useRef<string[]>([])
  const preparadasRef = useRef(new Map<string, FotoPreparada>())
  const enProcesoRef = useRef(new Map<string, Promise<void>>())
  const fallidasRef = useRef(new Map<string, string>())
  const versionRef = useRef(0)
  const [internas, setInternas] = useState<readonly FotoSeleccionada[]>([])
  const fotos = fotosControladas ?? internas
  const [aviso, setAviso] = useState('')
  const [procesando, setProcesando] = useState(false)

  // Las fotos restauradas ya están preparadas: se registran para no procesarlas otra vez.
  useEffect(() => {
    for (const foto of fotos) {
      if (foto.preparada) preparadasRef.current.set(foto.id, foto.preparada)
    }
  }, [fotos])

  function cambiarFotos(siguientes: readonly FotoSeleccionada[]) {
    const idsActuales = new Set(siguientes.map((foto) => foto.id))
    const eliminadas = elegidasRef.current.filter((id) => !idsActuales.has(id))
    elegidasRef.current = siguientes.map((foto) => foto.id)
    if (fotosControladas === undefined) setInternas(siguientes)
    onFotosChange?.(siguientes)
    onCountChange?.(siguientes.length)
    versionRef.current += 1
    if (eliminadas.length) {
      for (const id of eliminadas) {
        preparadasRef.current.delete(id)
        fallidasRef.current.delete(id)
      }
      void Promise.all(eliminadas.map((id) => descartarSubidaFotoNoDeclarada(id))).catch(() => {})
    }
    setAviso('')
    onPreparadasChange([])
    if (siguientes.length === 0) return

    for (const foto of siguientes) {
      if (!foto.original || preparadasRef.current.has(foto.id) || enProcesoRef.current.has(foto.id)
        || fallidasRef.current.has(foto.id)) continue
      const tarea = prepararFotosFormulario(draftId, [{ attachmentId: foto.id, original: foto.original }]).then(({ preparadas, errores }) => {
        if (!elegidasRef.current.includes(foto.id)) {
          void descartarSubidaFotoNoDeclarada(foto.id).catch(() => {})
        } else if (preparadas[0]) {
          preparadasRef.current.set(foto.id, preparadas[0])
        } else {
          fallidasRef.current.set(foto.id, errores[0] ?? 'No se pudo preparar una foto.')
        }
      }).finally(() => {
        enProcesoRef.current.delete(foto.id)
        if (versionRef.current > 0) {
          const activas = elegidasRef.current
          const procesandoAhora = activas.some((id) => enProcesoRef.current.has(id))
          setProcesando(procesandoAhora)
          if (!procesandoAhora) onPreparadasChange(activas.flatMap((id) => {
            const preparada = preparadasRef.current.get(id)
            return preparada ? [preparada] : []
          }))
          const error = activas.map((id) => fallidasRef.current.get(id)).find(Boolean)
          if (error) setAviso(`Una o más fotos no pudieron prepararse. Puede continuar con el reporte. ${error}`)
        }
      })
      enProcesoRef.current.set(foto.id, tarea)
    }
    const pendientes = siguientes.map((foto) => enProcesoRef.current.get(foto.id)).filter((item): item is Promise<void> => !!item)
    setProcesando(pendientes.length > 0)
    if (pendientes.length === 0) {
      onPreparadasChange(siguientes.flatMap((foto) => {
        const preparada = preparadasRef.current.get(foto.id)
        return preparada ? [preparada] : []
      }))
    }
  }

  return (
    <>
      <SelectorFotos onChange={() => {}} fotos={fotos} onFotosChange={cambiarFotos} />
      {procesando ? <p role="status">Preparando fotos en este dispositivo. Puede enviar el reporte mientras tanto.</p> : null}
      {aviso ? <p role="status">{aviso}</p> : null}
    </>
  )
}
