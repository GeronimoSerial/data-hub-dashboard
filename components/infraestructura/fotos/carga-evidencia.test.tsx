// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CargaEvidencia } from './carga-evidencia'
import { obtenerOperacionFotos } from '@/lib/infraestructura/fotos/operaciones'
import { declararFotosFormulario } from '@/lib/infraestructura/fotos/flujo-formulario'

vi.mock('@/lib/infraestructura/fotos/operaciones', () => ({
  EVENTO_FOTOS: 'parte:fotos-actualizadas', obtenerOperacionFotos: vi.fn(),
}))
vi.mock('@/lib/infraestructura/fotos/flujo-formulario', () => ({
  declararFotosFormulario: vi.fn(async () => undefined), SinParteError: class extends Error {},
}))
vi.mock('@/lib/infraestructura/fotos/subida-cola', () => ({
  iniciarSubidaFotos: vi.fn(), drenarColaFotos: vi.fn(async () => undefined),
}))
vi.mock('./selector-fotos-formulario', () => ({ SelectorFotosFormulario: () => <p>Selector nuevo</p> }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

it('restores an operation after remount and retries the same key, base and attachment IDs', async () => {
  const operation = { draftId: 'fotos-operacion:evidencia-ficha:1800169-00', origenDraftId: 'evidencia-ficha:1800169-00',
    movimientoBaseId: 'original-base', idempotencyKey: 'durable-key', estado: 'error', creadaEn: 1,
    fotos: [{ attachmentId: 'durable-id', bytesOptimizado: 9, bytesMiniatura: 9 }] }
  vi.mocked(obtenerOperacionFotos).mockResolvedValue(operation as never)
  const guarded = vi.fn()
  const renderUpload = () => render(<CargaEvidencia cue="1800169-00" movimientoBaseId="new-base" onGuardado={guarded} onCancelar={() => undefined} />)
  const first = renderUpload()
  expect(await screen.findByText(/Carga de fotos: error/)).toBeInTheDocument()
  expect(screen.queryByText('Selector nuevo')).not.toBeInTheDocument()
  first.unmount()
  renderUpload()
  fireEvent.click(await screen.findByRole('button', { name: 'Reintentar carga guardada' }))
  await waitFor(() => expect(guarded).toHaveBeenCalledOnce())
  expect(declararFotosFormulario).toHaveBeenCalledWith({
    draftId: operation.origenDraftId, movimientoBaseId: 'original-base', cue: '1800169-00',
    idempotencyKey: 'durable-key', fotos: operation.fotos,
  })
})

it('shows durable pending, uploading and confirmed states from queue events', async () => {
  const operation = { draftId: 'fotos-operacion:evidencia-ficha:cue', origenDraftId: 'evidencia-ficha:cue',
    idempotencyKey: 'durable', estado: 'pendiente', creadaEn: 1, fotos: [] }
  vi.mocked(obtenerOperacionFotos).mockImplementation(async () => ({ ...operation }) as never)
  render(<CargaEvidencia cue="cue" onGuardado={() => undefined} onCancelar={() => undefined} />)
  expect(await screen.findByText(/Carga de fotos: pendiente/)).toBeInTheDocument()
  operation.estado = 'subiendo'
  fireEvent(window, new Event('parte:fotos-actualizadas'))
  expect(await screen.findByText(/Carga de fotos: subiendo/)).toBeInTheDocument()
  operation.estado = 'confirmada'
  fireEvent(window, new Event('parte:fotos-actualizadas'))
  expect(await screen.findByText(/Carga de fotos: confirmada/)).toBeInTheDocument()
  expect(screen.getByText('Selector nuevo')).toBeInTheDocument()
})
