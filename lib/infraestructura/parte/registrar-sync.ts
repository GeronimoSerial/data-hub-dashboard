export const TAG_SYNC_PARTE = 'parte-envio'

interface RegistroConSync extends ServiceWorkerRegistration {
  sync?: { register(tag: string): Promise<void> }
}

export async function registrarServiceWorkerParte(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.register('/sw-parte.js', { scope: '/problematicas/parte' })
  } catch {
    return null
  }
}

export async function pedirSyncParte(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false
  try {
    const registro = (await navigator.serviceWorker.ready) as RegistroConSync
    if (!registro.sync) return false
    await registro.sync.register(TAG_SYNC_PARTE)
    return true
  } catch {
    return false
  }
}

export function alEnviarEnSegundoPlano(callback: (clave: string) => void): () => void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return () => {}
  const manejar = (evento: MessageEvent) => {
    const datos = evento.data as { tipo?: string; clave?: string } | null
    if (datos?.tipo === 'parte-enviado' && typeof datos.clave === 'string') callback(datos.clave)
  }
  navigator.serviceWorker.addEventListener('message', manejar)
  return () => navigator.serviceWorker.removeEventListener('message', manejar)
}
