export type ArchivoInfo = {
  id: string
  storageKey?: string | null
  mime?: string | null
  nombreOriginal?: string | null
  cargadoEn?: string | null
}

export function nombreArchivo(recurso: Pick<ArchivoInfo, 'nombreOriginal' | 'storageKey'>) {
  if (recurso.nombreOriginal?.trim()) return recurso.nombreOriginal.trim()
  const basename = recurso.storageKey?.split(/[\\/]/).pop()
  return basename && /\.html?$/i.test(basename) ? basename : null
}

export function fechaArchivo(value?: string | null) {
  const date = value ? new Date(value) : null
  return date && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }).format(date)
    : 'Fecha no registrada'
}
