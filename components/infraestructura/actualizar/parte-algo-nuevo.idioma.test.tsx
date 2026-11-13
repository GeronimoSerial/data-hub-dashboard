// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'
import { MOTIVOS_FIXTURE, TURNOS_FIXTURE } from '@/components/test-utils/parte-formulario'
import { RECORRIDO_INICIAL, type SituacionRecorrido } from '@/lib/infraestructura/parte/recorrido-actualizacion'
import { AlgoNuevo } from './algo-nuevo'
import { EntradaActualizar } from './entrada-actualizar'
import { RevisarSituacion, type RevisarSituacionProps } from './revisar-situacion'

afterEach(cleanup)

const situaciones = [
  { id: 'b', motivo: 'Sin energía o agua', categoria: 'establecimiento' as const, severidad: 'Media' as const, rigeDesde: '2026-09-30T11:05:00.000Z', creadaEn: '2026-09-30T11:05:00.000Z', causadaPorId: null },
  { id: 'a', motivo: 'Evacuación preventiva', categoria: 'establecimiento' as const, severidad: 'Crítica' as const, rigeDesde: '2026-10-04T12:15:00.000Z', creadaEn: '2026-10-04T12:15:00.000Z', causadaPorId: null },
]

const candidatasCausa = [
  { id: 'reciente', motivo: 'Tormenta severa', fecha: '2026-10-04T08:10:00.000Z', activa: false, severidad: 'Alta' as const },
  { id: 'situacion-1', motivo: 'Inundación', fecha: '2026-10-03T10:00:00.000Z', activa: true, severidad: 'Alta' as const, secciones: 5, alumnos: 107 },
]

const situacionActiva: SituacionRecorrido = {
  id: 'situacion-1',
  motivo: 'Inundación',
  categoria: 'establecimiento',
  severidad: 'Alta',
  rigeDesde: '2026-10-03T10:00:00.000Z',
  creadaEn: '2026-10-03T10:00:00.000Z',
  causadaPorId: null,
}

const revisarBase = (over: Partial<RevisarSituacionProps> = {}): RevisarSituacionProps => ({
  situacion: { id: 'a', motivo: 'Inundación', categoria: 'establecimiento', severidad: 'Alta', rigeDesde: '2026-10-02T10:00:00.000Z', creadaEn: '2026-10-02T10:00:00.000Z', causadaPorId: null, secciones: [], alumnos: [] },
  turnos: TURNOS_FIXTURE,
  sugerida: 'Crítica',
  respuesta: undefined,
  faltaRespuesta: false,
  onInteractuar: vi.fn(),
  consecuencias: [],
  clasesEdificio: { servicioEstado: 'normal', estadoEstablecimiento: 'habitual' },
  onResponder: vi.fn(),
  onCambiarClasesEdificio: vi.fn(),
  onCascada: vi.fn(),
  posicion: { actual: 1, total: 2 },
  ...over,
})

function renderAlgo(idioma: 'es' | 'pt') {
  render(
    <IdiomaProvider idioma={idioma}>
      <AlgoNuevo
        candidatasCausa={candidatasCausa}
        situacionesActivas={[situacionActiva]}
        estado={RECORRIDO_INICIAL}
        turnos={TURNOS_FIXTURE}
        motivos={MOTIVOS_FIXTURE}
        onTerminar={vi.fn()}
        onActualizarExistente={vi.fn()}
        onSolucionarExistente={vi.fn()}
      />
    </IdiomaProvider>,
  )
}

function renderEntrada(idioma: 'es' | 'pt') {
  render(
    <IdiomaProvider idioma={idioma}>
      <EntradaActualizar
        situaciones={situaciones}
        estadoEstablecimiento="evacuado"
        estadoServicio="suspendido"
        ultimaCarga={null}
        historial={[]}
        onActualizar={vi.fn()}
      />
    </IdiomaProvider>,
  )
}

function renderRevisar(idioma: 'es' | 'pt', over: Partial<RevisarSituacionProps> = {}) {
  render(
    <IdiomaProvider idioma={idioma}>
      <RevisarSituacion {...revisarBase(over)} />
    </IdiomaProvider>,
  )
}

describe('EntradaActualizar · idioma', () => {
  it('mantiene en español los textos de la entrada', () => {
    renderEntrada('es')
    expect(screen.getByRole('region', { name: 'Situación principal' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Actualizar el parte' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver historial' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'También activas' })).toBeInTheDocument()
    expect(screen.getByText(/· desde 4 de octubre, /)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver historial' }))
    expect(screen.getByRole('dialog', { name: 'Historial' })).toBeInTheDocument()
  })

  it('muestra los textos de la entrada en portugués de Brasil', () => {
    renderEntrada('pt')
    expect(screen.getByRole('region', { name: 'Situação principal' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Atualizar o relatório' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver histórico' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Também ativas' })).toBeInTheDocument()
    expect(screen.getByText(/· desde 4 de outubro, /)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ver histórico' }))
    expect(screen.getByRole('dialog', { name: 'Histórico' })).toBeInTheDocument()
  })
})

describe('AlgoNuevo · idioma', () => {
  it('mantiene en español la pregunta y los pasos', () => {
    renderAlgo('es')
    expect(screen.getByRole('heading', { name: '¿Hay algo nuevo?' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Sí, agregar una situación nueva' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Sí, agregar una situación nueva' }))
    expect(screen.getByRole('heading', { name: '¿Qué pasó?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Elija el tipo, el motivo, la gravedad y al menos una sección.')
  })

  it('muestra la pregunta, los pasos y los faltantes en portugués de Brasil', () => {
    renderAlgo('pt')
    expect(screen.getByRole('heading', { name: 'Há algo novo?' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Não' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Sim, adicionar uma situação nova' }))
    expect(screen.getByRole('heading', { name: 'O que aconteceu?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Prosseguir' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Voltar' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Escolha o tipo, o motivo, a gravidade e pelo menos uma seção.')
  })
})

describe('RevisarSituacion · idioma', () => {
  it('mantiene en español las opciones y el contador', () => {
    renderRevisar('es')
    expect(screen.getByRole('region', { name: 'Situación 1 de 2' })).toBeInTheDocument()
    expect(screen.getByText('Lo que ya reportó · 1 de 2')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Sigue igual' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Cambió' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Se solucionó' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Cambió' }))
    expect(screen.getByText('¿Qué cambió en Inundación?')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'A quién afecta (secciones / alumnos)' })).toBeInTheDocument()
  })

  it('muestra las opciones y el contador en portugués de Brasil', () => {
    renderRevisar('pt')
    expect(screen.getByRole('region', { name: 'Situação 1 de 2' })).toBeInTheDocument()
    expect(screen.getByText('O que já informou · 1 de 2')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Continua igual' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Mudou' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Foi resolvida' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Mudou' }))
    expect(screen.getByText('O que mudou em Inundación?')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'A quem afeta (seções / alunos)' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'A gravidade' })).toBeInTheDocument()
  })

  it('muestra la fecha de reporte con la forma de cada idioma', () => {
    renderRevisar('es')
    expect(screen.getByText(/^Reportada el 2 de octubre, /)).toBeInTheDocument()
    cleanup()
    renderRevisar('pt')
    expect(screen.getByText(/^Informada em 2 de outubro, /)).toBeInTheDocument()
  })

  it('pide la solución en portugués y el cascada en ambos idiomas', () => {
    renderRevisar('pt', { faltaRespuesta: true })
    expect(screen.getByRole('alert')).toHaveTextContent('Informe como continua esta situação.')
    cleanup()
    renderRevisar('pt', { consecuencias: [{ ...revisarBase().situacion, id: 'b', motivo: 'Sin energía o agua', rigeDesde: '2026-10-03T14:00:00.000Z', causadaPorId: 'a' }] })
    fireEvent.click(screen.getByRole('radio', { name: 'Foi resolvida' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Sin energía o agua (consequência de Inundación), também?')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Sim, também foi resolvida' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Não, continua ativa' })).toBeInTheDocument()
  })
})
