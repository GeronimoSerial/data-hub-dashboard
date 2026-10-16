// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NOMBRE_DB_PARTE, STORES_PARTE, VERSION_DB_PARTE } from '@/lib/infraestructura/parte/almacen-indexeddb'
import { PantallaParteOffline } from './pantalla-parte-offline'

async function prepararBaseVacia(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const deletion = indexedDB.deleteDatabase(NOMBRE_DB_PARTE)
    deletion.onsuccess = () => resolve()
    deletion.onerror = () => reject(deletion.error)
  })
  await new Promise<void>((resolve, reject) => {
    const opening = indexedDB.open(NOMBRE_DB_PARTE, VERSION_DB_PARTE)
    opening.onupgradeneeded = () => {
      const db = opening.result
      db.createObjectStore(STORES_PARTE.kv)
      db.createObjectStore(STORES_PARTE.contextos, { keyPath: 'draftId' })
      db.createObjectStore(STORES_PARTE.borradores, { keyPath: 'draftId' })
      db.createObjectStore(STORES_PARTE.trabajosEnvio, { keyPath: 'idempotencyKey' })
      db.createObjectStore(STORES_PARTE.confirmaciones, { keyPath: 'idempotencyKey' })
      db.createObjectStore(STORES_PARTE.archivos)
      db.createObjectStore(STORES_PARTE.descartes, { keyPath: 'draftId' })
    }
    opening.onsuccess = () => {
      opening.result.close()
      resolve()
    }
    opening.onerror = () => reject(opening.error)
  })
}

beforeEach(async () => {
  await prepararBaseVacia()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('PantallaParteOffline', () => {
  it('loads the empty state from IndexedDB without issuing authenticated reads', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)

    render(<PantallaParteOffline />)

    expect(await screen.findByText(/No hay un reporte guardado/)).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('explains when no local context is available after the first visit', async () => {
    render(<PantallaParteOffline />)

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Abra el recorrido con conexión/))
  })
})
