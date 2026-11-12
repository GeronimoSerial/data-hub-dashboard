// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AssignmentImport } from './assignment-import'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const SOURCE_ID = 'src-1'
const PREVIEW_HASH = 'a'.repeat(64)

const accepted = [
  {
    cueAnexo: '700000001',
    schoolName: 'Escuela Uno',
    relationship: 'cabecera',
    supervisorName: 'ANA GOMEZ',
    cabeceraCue: '700000001',
    provenance: [{ sourceId: SOURCE_ID, location: 'CUE (1)/ana.xlsx:Hoja1:2' }],
  },
  {
    cueAnexo: '700000002',
    schoolName: 'Escuela Dos',
    relationship: 'dependiente',
    supervisorName: 'ANA GOMEZ',
    cabeceraCue: '700000001',
    provenance: [{ sourceId: SOURCE_ID, location: 'CUE (1)/ana.xlsx:Hoja1:3' }],
  },
]

const uploadBody = {
  revisionId: 'rev-1',
  previewHash: PREVIEW_HASH,
  accepted,
  conflicts: [{ cueAnexo: '700000003', rows: [] }],
  unresolved: [
    { cue: null, schoolName: 'Sin CUE', reason: 'missing_cue', provenance: { sourceId: SOURCE_ID, location: 'x:1:1' } },
    { cue: 'ABC', schoolName: 'CUE raro', reason: 'invalid_cue', provenance: { sourceId: SOURCE_ID, location: 'x:1:2' } },
    { cue: '700000009', schoolName: 'Sin supervisor', reason: 'missing_supervisor', provenance: { sourceId: SOURCE_ID, location: 'x:1:3' } },
  ],
  supervisorNames: ['ANA GOMEZ', 'LUIS PEREZ'],
  cabeceras: [{ cue: '700000001', nombre: 'Escuela Uno' }],
}

function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

function csvFile() {
  return new File(['cue,nombre\n700000001,Escuela Uno\n'], 'asignaciones.csv', { type: 'text/csv' })
}

async function uploadCsv() {
  fireEvent.change(screen.getByLabelText(/Archivo CSV/), { target: { files: [csvFile()] } })
  fireEvent.click(screen.getByRole('button', { name: /Subir y previsualizar/ }))
}

describe('AssignmentImport', () => {
  it('uploads the CSV and renders the preview counts', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ revisions: [] }))
      .mockResolvedValueOnce(response(uploadBody, 201))
      .mockResolvedValueOnce(response({ revisions: [] }))
    vi.stubGlobal('fetch', fetchMock)

    render(<AssignmentImport />)
    await screen.findByText(/Sin subidas recientes/)
    await uploadCsv()

    const summary = await screen.findByRole('region', { name: /Previsualización/ })
    expect(within(summary).getByText('Aceptadas: 2')).toBeInTheDocument()
    expect(within(summary).getByText('Conflictos: 1')).toBeInTheDocument()
    expect(within(summary).getByText('No resueltas: 3')).toBeInTheDocument()

    const [, uploadCall] = fetchMock.mock.calls
    expect(uploadCall[0]).toBe('/api/cuadernillos/assignments/sources')
    expect(uploadCall[1]).toEqual(expect.objectContaining({ method: 'POST' }))
    expect(uploadCall[1].body).toBeInstanceOf(FormData)
    expect((uploadCall[1].body as FormData).get('file')).toBeInstanceOf(File)
  })

  it('posts the exact mapping body when confirming with one supervisor mapped and one left unmapped', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ revisions: [] }))
      .mockResolvedValueOnce(response(uploadBody, 201))
      .mockResolvedValueOnce(response({ revisions: [] }))
      .mockResolvedValueOnce(response({ users: [{ id: 'user-ana', name: 'Ana Gomez', email: 'ana@example.test' }] }))
      .mockResolvedValueOnce(response({
        confirmedCount: 2,
        confirmed: ['700000001', '700000002'],
        skipped: [{ cueAnexo: '700000004', reason: 'supervisor_unmapped' }],
        retainedConflictCueAnexos: ['700000003'],
      }))
      .mockResolvedValueOnce(response({ revisions: [] }))
    vi.stubGlobal('fetch', fetchMock)

    render(<AssignmentImport />)
    await screen.findByText(/Sin subidas recientes/)
    await uploadCsv()
    await screen.findByRole('region', { name: /Previsualización/ })

    const anaPicker = screen.getByRole('group', { name: /ANA GOMEZ/ })
    fireEvent.change(within(anaPicker).getByLabelText(/Buscar cuenta para ANA GOMEZ/), { target: { value: 'ana' } })
    fireEvent.click(within(anaPicker).getByRole('button', { name: /Buscar$/ }))
    fireEvent.click(await within(anaPicker).findByRole('button', { name: /Ana Gomez.*ana@example.test/ }))

    fireEvent.click(screen.getByRole('button', { name: /Confirmar asignaciones/ }))

    const confirmCall = await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/confirm'))
      expect(call).toBeDefined()
      return call!
    })
    expect(confirmCall[0]).toBe('/api/cuadernillos/assignments/sources/rev-1/confirm')
    expect(confirmCall[1].method).toBe('POST')
    expect(JSON.parse(confirmCall[1].body)).toEqual({
      previewHash: PREVIEW_HASH,
      supervisorAccounts: { 'ANA GOMEZ': 'user-ana' },
      cabeceraAccounts: {},
    })

    const result = await screen.findByRole('region', { name: /Resultado de la confirmación/ })
    expect(within(result).getByText('Confirmadas: 2')).toBeInTheDocument()
    expect(within(result).getByText(/Sin cuenta de supervisor: 1/)).toBeInTheDocument()
  })

  it('shows a Spanish alert when the upload is rejected', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ revisions: [] }))
      .mockResolvedValueOnce(response({ error: 'file_too_large' }, 413))
    vi.stubGlobal('fetch', fetchMock)

    render(<AssignmentImport />)
    await screen.findByText(/Sin subidas recientes/)
    await uploadCsv()

    expect(await screen.findByRole('alert')).toHaveTextContent('El archivo supera el tamaño máximo permitido (2 MB).')
  })
})
