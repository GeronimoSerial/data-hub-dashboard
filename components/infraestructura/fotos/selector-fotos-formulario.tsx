'use client'

import { useRef, useState, type JSX } from 'react'
import { prepararFotosFormulario, type FotoElegida, type FotoPreparada } from '@/lib/infraestructura/fotos/flujo-formulario'
import { descartarSubidaFotoNoDeclarada } from '@/lib/infraestructura/fotos/subida-cola'
import { SelectorFotos } from './selector-fotos'

export function SelectorFotosFormulario({
  draftId,
  onPreparadasChange,
  onCountChange,
}: {
  draftId: string
  onPreparadasChange: (fotos: readonly FotoPreparada[]) => void
  onCountChange?: (count: number) => void
}): JSX.Element {
  const elegidasRef = useRef<FotoElegida[]>([])
  const preparadasRef = useRef(new Map<string, FotoPreparada>())
  const enProcesoRef = useRef(new Map<string, Promise<void>>())
  const fallidasRef = useRef(new Map<string, string>())
  const versionRef = useRef(0)
  const [aviso, setAviso] = useState('')
  const [procesando, setProcesando] = useState(false)

  function cambiarFotos(fotos: readonly { attachmentId: string; original: Blob }[]) {
    const idsActuales = new Set(fotos.map((foto) => foto.attachmentId))
    const eliminadas = elegidasRef.current.filter((foto) => !idsActuales.has(foto.attachmentId))
    elegidasRef.current = fotos.map((foto) => ({ ...foto }))
    onCountChange?.(fotos.length)
    versionRef.current += 1
    if (eliminadas.length) {
      for (const foto of eliminadas) {
        preparadasRef.current.delete(foto.attachmentId)
        fallidasRef.current.delete(foto.attachmentId)
      }
      void Promise.all(eliminadas.map((foto) => descartarSubidaFotoNoDeclarada(foto.attachmentId))).catch(() => {})
    }
    setAviso('')
    onPreparadasChange([])
    if (fotos.length === 0) return

    for (const foto of fotos) {
      if (preparadasRef.current.has(foto.attachmentId) || enProcesoRef.current.has(foto.attachmentId)
        || fallidasRef.current.has(foto.attachmentId)) continue
      const tarea = prepararFotosFormulario(draftId, [foto]).then(({ preparadas, errores }) => {
        if (!elegidasRef.current.some((elegida) => elegida.attachmentId === foto.attachmentId)) {
          void descartarSubidaFotoNoDeclarada(foto.attachmentId).catch(() => {})
        } else if (preparadas[0]) {
          preparadasRef.current.set(foto.attachmentId, preparadas[0])
        } else {
          fallidasRef.current.set(foto.attachmentId, errores[0] ?? 'No se pudo preparar una foto.')
        }
      }).finally(() => {
        enProcesoRef.current.delete(foto.attachmentId)
        if (versionRef.current > 0) {
          const activas = elegidasRef.current
          const procesandoAhora = activas.some((elegida) => enProcesoRef.current.has(elegida.attachmentId))
          setProcesando(procesandoAhora)
          if (!procesandoAhora) onPreparadasChange(activas.flatMap((elegida) => {
            const preparada = preparadasRef.current.get(elegida.attachmentId)
            return preparada ? [preparada] : []
          }))
          const error = activas.map((elegida) => fallidasRef.current.get(elegida.attachmentId)).find(Boolean)
          if (error) setAviso(`Una o más fotos no pudieron prepararse. Puede continuar con el reporte. ${error}`)
        }
      })
      enProcesoRef.current.set(foto.attachmentId, tarea)
    }
    const pendientes = fotos.map((foto) => enProcesoRef.current.get(foto.attachmentId)).filter((item): item is Promise<void> => !!item)
    setProcesando(pendientes.length > 0)
    if (pendientes.length === 0) {
      onPreparadasChange(fotos.flatMap((foto) => {
        const preparada = preparadasRef.current.get(foto.attachmentId)
        return preparada ? [preparada] : []
      }))
    }
  }

  return (
    <>
      <SelectorFotos onChange={() => {}} onItemsChange={cambiarFotos} />
      {procesando ? <p role="status">Preparando fotos en este dispositivo. Puede enviar el reporte mientras tanto.</p> : null}
      {aviso ? <p role="status">{aviso}</p> : null}
    </>
  )
}
