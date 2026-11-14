// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'
import type { Idioma } from '@/lib/i18n'
import type { TurnoContexto } from '@/lib/infraestructura/contexto'
import { SelectorAlumnos } from './selector-alumnos'
import { SeccionesSelector } from './secciones-selector'
import { SelectorEstablecimiento } from './selector-establecimiento'
import { SelectorFotos } from './fotos/selector-fotos'
import { GaleriaEvidencia } from './fotos/galeria-evidencia'
import { PantallaParteOffline } from './offline/pantalla-parte-offline'

const turnos: TurnoContexto[] = [{
  turno: 'Mañana',
  niveles: [{
    nivel: 'Primario',
    secciones: [{
      geSectionId: 10,
      curso: '1°',
      division: 'A',
      nivel: 'Primario',
      turno: 'Mañana',
      matricula: 2,
      alumnos: [
        { gePersonId: 1, apellido: 'Ávila', nombre: 'Ana' },
        { gePersonId: 2, apellido: 'Benítez', nombre: 'Luis' },
      ],
    }],
  }],
}]

function renderIn(idioma: Idioma, ui: ReactElement) {
  return render(<IdiomaProvider idioma={idioma}>{ui}</IdiomaProvider>)
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/config')) return Response.json({ fotos: true })
    return Response.json({ movements: [] })
  }))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('parteGaleria en portugués (pt)', () => {
  it('selector de alumnos muestra el resumen y los botones en pt', () => {
    renderIn('pt', <SelectorAlumnos turnos={turnos} alumnosSeleccionados={[]} onCambiar={vi.fn()} />)

    expect(screen.getByText('Mañana · 0 de 2 alunos')).toBeInTheDocument()
    expect(screen.getAllByText('Escolher alunos')[0]).toBeInTheDocument()
    expect(screen.getByText('0 alunos afetados em 0 seções')).toBeInTheDocument()
  })

  it('selector de secciones muestra el turno, el resumen y los botones en pt', () => {
    renderIn('pt', <SeccionesSelector turnos={turnos} seleccionadas={[]} alumnosSeleccionados={[]} onCambiar={vi.fn()} />)

    expect(screen.getByLabelText('Todo o turno Mañana')).toBeInTheDocument()
    expect(screen.getByText('Mañana · 0 de 1 seções')).toBeInTheDocument()
    expect(screen.getByText('Todas as seções · 0 de 1 (2 alunos)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Escolher alunos (0 de 2)' })).toBeInTheDocument()
  })

  it('selector de establecimiento muestra sus opciones en pt', () => {
    renderIn('pt', <SelectorEstablecimiento turnos={turnos} valor={{ alcance: '', secciones: [] }} onCambiar={vi.fn()} />)

    expect(screen.getByRole('radiogroup', { name: 'A quem afeta' })).toBeInTheDocument()
    expect(screen.getByLabelText('Toda a escola')).toBeInTheDocument()
    expect(screen.getByLabelText('Algumas seções')).toBeInTheDocument()
  })

  it('selector de fotos muestra etiquetas y contador en pt', async () => {
    renderIn('pt', <SelectorFotos onChange={vi.fn()} />)

    expect(await screen.findByLabelText('Adicionar fotos')).toBeInTheDocument()
    expect(screen.getByText('Escolha até três imagens para anexar ao relatório.')).toBeInTheDocument()
    expect(screen.getByText('0 de 3 fotos')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Fotos do relatório' })).toBeInTheDocument()
  })

  it('selector de fotos avisa los archivos que no son imágenes en pt', async () => {
    renderIn('pt', <SelectorFotos onChange={vi.fn()} />)
    const entrada = await screen.findByLabelText('Adicionar fotos')

    fireEvent.change(entrada, { target: { files: [new File(['texto'], 'nota.txt', { type: 'text/plain' })] } })

    expect(await screen.findByText('Foram omitidos 1 arquivos que não são imagens.')).toBeInTheDocument()
  })

  it('galería muestra el estado vacío y el botón de adjuntar en pt', async () => {
    renderIn('pt', <GaleriaEvidencia cue="1801605" />)

    expect(await screen.findByText('Nenhuma imagem registrada')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anexar foto' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Evidência fotográfica' })).toBeInTheDocument()
  })

  it('pantalla offline muestra el error de almacenamiento en pt', async () => {
    vi.stubGlobal('indexedDB', undefined)
    renderIn('pt', <PantallaParteOffline />)

    expect(await screen.findByText('Não foi possível ler o trabalho salvo neste dispositivo.')).toBeInTheDocument()
  })
})

describe('parteGaleria en español (es, Corrientes)', () => {
  it('selector de alumnos conserva el texto español', () => {
    renderIn('es', <SelectorAlumnos turnos={turnos} alumnosSeleccionados={[]} onCambiar={vi.fn()} />)

    expect(screen.getByText('Mañana · 0 de 2 alumnos')).toBeInTheDocument()
    expect(screen.getByText('0 alumnos afectados en 0 secciones')).toBeInTheDocument()
  })

  it('selector de secciones conserva el texto español', () => {
    renderIn('es', <SeccionesSelector turnos={turnos} seleccionadas={[]} alumnosSeleccionados={[]} onCambiar={vi.fn()} />)

    expect(screen.getByLabelText('Todo el turno Mañana')).toBeInTheDocument()
    expect(screen.getByText('Mañana · 0 de 1 secciones')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Elegir alumnos (0 de 2)' })).toBeInTheDocument()
  })

  it('selector de fotos conserva el texto español', async () => {
    renderIn('es', <SelectorFotos onChange={vi.fn()} />)

    expect(await screen.findByLabelText('Agregar fotos')).toBeInTheDocument()
    expect(screen.getByText('0 de 3 fotos')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Fotos del reporte' })).toBeInTheDocument()
  })

  it('galería conserva el estado vacío español', async () => {
    renderIn('es', <GaleriaEvidencia cue="1801605" />)

    expect(await screen.findByText('Sin imágenes registradas')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adjuntar foto' })).toBeInTheDocument()
  })

  it('pantalla offline conserva el error español', async () => {
    vi.stubGlobal('indexedDB', undefined)
    renderIn('es', <PantallaParteOffline />)

    expect(await screen.findByText('No se pudo leer el trabajo guardado en este dispositivo.')).toBeInTheDocument()
  })
})
