import { fechaArchivo, nombreArchivo, type ArchivoInfo } from '@/lib/archivo-metadata'
import { archivoSrc } from '@/lib/recurso-viewer'

export function ArchivoMetadata({ recurso }: { recurso: ArchivoInfo }) {
  if (!recurso.storageKey || recurso.mime !== 'text/html') return null
  return (
    <div className="archivo-metadata" aria-label="Archivo HTML">
      <span>Nombre original: <span>{nombreArchivo(recurso) ?? 'Nombre original no disponible'}</span></span>
      <span>Fecha de carga: <span>{fechaArchivo(recurso.cargadoEn)}</span></span>
      <a className="ui-button ui-button--ghost" href={archivoSrc(recurso.id, true)}>Descargar archivo</a>
    </div>
  )
}
