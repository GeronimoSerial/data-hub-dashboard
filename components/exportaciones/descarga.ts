const MENSAJE_RED = 'No se pudo conectar con el servidor. Intentá de nuevo.'

/** Nombre de archivo de `Content-Disposition: attachment; filename="…"`, o null. */
export function nombreDesdeDisposition(cabecera: string | null): string | null {
  const coincidencia = cabecera?.match(/filename="([^"]+)"/)
  return coincidencia ? coincidencia[1] : null
}

async function mensajeDeRespuesta(respuesta: Response): Promise<string> {
  try {
    const cuerpo = (await respuesta.json()) as { error?: unknown }
    if (typeof cuerpo.error === 'string' && cuerpo.error.trim()) return cuerpo.error
  } catch {
    // Sin cuerpo JSON: se usa el mensaje genérico con el código HTTP.
  }
  return `No se pudo generar el archivo (HTTP ${respuesta.status}).`
}

/** Descarga el .xlsx del servidor. Lanza un Error con el mensaje del servidor si la respuesta no es 2xx. */
export async function descargarExportacion(url: string, nombreRespaldo: string): Promise<void> {
  let respuesta: Response
  try {
    respuesta = await fetch(url, { cache: 'no-store' })
  } catch {
    throw new Error(MENSAJE_RED)
  }
  if (!respuesta.ok) throw new Error(await mensajeDeRespuesta(respuesta))

  const blob = await respuesta.blob()
  const nombre = nombreDesdeDisposition(respuesta.headers.get('Content-Disposition')) ?? nombreRespaldo
  const objectUrl = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = objectUrl
  enlace.download = nombre
  document.body.append(enlace)
  enlace.click()
  enlace.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
}
