// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NOMBRE_DB_PARTE, STORES_PARTE, VERSION_DB_PARTE } from '@/lib/infraestructura/parte/almacen-indexeddb'
import { PantallaParteOffline } from './pantalla-parte-offline'


vi.mock('@/components/infraestructura/reporte-inicial-form', () => ({
  ReporteInicialForm: ({ cue }: { cue: string }) => <div>Formulario {cue}</div>,
}))

async function guardarBorradores(): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(NOMBRE_DB_PARTE, VERSION_DB_PARTE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORES_PARTE.contextos, STORES_PARTE.borradores], 'readwrite')
      for (const [cue, nombre] of [['1800114-00', 'Escuela solicitada'], ['1800115-00', 'Escuela ajena']]) {
        const draftId = `parte-inicial:${cue}`
        tx.objectStore(STORES_PARTE.contextos).put({ version: 1, draftId, cue, flujo: 'inicial', formulario: { escuela: { nombre }, turnos: [], motivos: [] } })
        tx.objectStore(STORES_PARTE.borradores).put({ draftId, version: 1, datos: {} })
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

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
  window.history.replaceState({}, '', '/')
  await prepararBaseVacia()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('PantallaParteOffline', () => {
  it('retoma solo el CUE de la URL sin mostrar la selección de otras escuelas', async () => {
    await guardarBorradores()
    window.history.replaceState({}, '', '/?cue=1800114-00&flujo=inicial')
    render(<PantallaParteOffline />)
    expect(await screen.findByRole('heading', { name: 'Reporte inicial · Escuela solicitada' })).toBeInTheDocument()
    expect(screen.queryByText('Escuela ajena')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /1800115/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Reportes guardados' })).not.toBeInTheDocument()
  })

  it.each(['', '?cue=1800999-00&flujo=inicial'])('no expone borradores sin coincidencia de CUE (%s)', async (search) => {
    await guardarBorradores()
    window.history.replaceState({}, '', `/${search}`)
    render(<PantallaParteOffline />)
    expect(await screen.findByText(/No hay un reporte guardado/)).toBeInTheDocument()
    expect(screen.queryByText('Escuela solicitada')).not.toBeInTheDocument()
    expect(screen.queryByText('Escuela ajena')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /CUE/ })).not.toBeInTheDocument()
  })

  it('loads the empty state from IndexedDB without issuing authenticated reads', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)

    render(<PantallaParteOffline />)

    expect(await screen.findByText(/No hay un reporte guardado/)).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('explains when no local context is available after the first visit', async () => {
    render(<PantallaParteOffline />)

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Conéctese a internet para abrir el reporte/))
  })
})
