/** Hash the persisted upload bytes, not filenames, sizes or OBS ETags. */
export async function hashFoto(blob: Blob): Promise<string> {
  const bytes = typeof blob.arrayBuffer === 'function'
    ? await blob.arrayBuffer()
    : await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(new Error('No se pudo leer la foto local.'))
      reader.readAsArrayBuffer(blob)
    })
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
