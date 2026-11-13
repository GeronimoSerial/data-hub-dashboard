// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'
import { VerificacionResponder, type VerificacionEnlace } from './verificacion-responder'
import { VerificacionesCola, type VerificacionVisible } from './verificaciones-cola'
import { BorradoresPendientes } from './borradores/borradores-pendientes'

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const JSON_OK = (cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status: 200, headers: { 'Content-Type': 'application/json' } })

const VERIFICACION_PENDIENTE: VerificacionEnlace = {
  cueAnexo: '1801605-04',
  estado: 'pendiente',
  resultado: null,
  respondidaEn: null,
  discrepancia: 0,
}

describe('VerificacionResponder · idioma', () => {
  it('muestra la pregunta y las acciones en portugués de Brasil', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => JSON_OK({ verificacion: VERIFICACION_PENDIENTE })))

    render(
      <IdiomaProvider idioma="pt">
        <VerificacionResponder verificacionId="verif-1" token="token" />
      </IdiomaProvider>,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Verificando o link…')
    expect(await screen.findByText('Sua escola tem atualmente alguma afetação pela situação hidrometeorológica?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sem afetação' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Há afetação' })).toBeInTheDocument()
  })

  it('mantiene los textos en español de la pantalla', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => JSON_OK({ verificacion: VERIFICACION_PENDIENTE })))

    render(
      <IdiomaProvider idioma="es">
        <VerificacionResponder verificacionId="verif-1" token="token" />
      </IdiomaProvider>,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Verificando el enlace…')
    expect(await screen.findByRole('button', { name: 'Sin afectación' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hay afectación' })).toBeInTheDocument()
  })
})

const VERIFICACION_LISTADA: VerificacionVisible = {
  id: 'v1',
  periodoId: 'p1',
  cueAnexo: '12345678',
  estado: 'pendiente',
  solicitadaEn: '2026-09-01T12:00:00.000Z',
  solicitadaPorUserId: 'u1',
  vencimientoEn: null,
  resultado: null,
  discrepancia: false,
  respondidaEn: null,
  respondidaCanal: null,
  respondidaPorUserId: null,
  respondidaPor: null,
  observacion: null,
  movimientoId: null,
  canceladaEn: null,
  canceladaPorUserId: null,
  motivoCancelacion: null,
  tokenExpiraEn: '2026-10-01T12:00:00.000Z',
  tokenRevocadoEn: null,
  tokenConsumidoEn: null,
  creadaEn: '2026-09-01T12:00:00.000Z',
  enlaceVencido: false,
} as VerificacionVisible

describe('VerificacionesCola · idioma', () => {
  it('traduce el título, el formulario y la tabla al portugués', () => {
    render(
      <IdiomaProvider idioma="pt">
        <VerificacionesCola verificacionesIniciales={[VERIFICACION_LISTADA]} />
      </IdiomaProvider>,
    )

    expect(screen.getByRole('heading', { name: 'Verificações' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Criar solicitação' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Ações' })).toBeInTheDocument()
    expect(screen.getByText('Pendente')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar resposta assistida' })).toBeInTheDocument()
  })

  it('mantiene los textos en español de la tabla', () => {
    render(
      <IdiomaProvider idioma="es">
        <VerificacionesCola verificacionesIniciales={[VERIFICACION_LISTADA]} />
      </IdiomaProvider>,
    )

    expect(screen.getByRole('heading', { name: 'Verificaciones' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Crear solicitud' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Acciones' })).toBeInTheDocument()
    expect(screen.getByText('Pendiente')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar respuesta asistida' })).toBeInTheDocument()
  })

  it('muestra el estado vacío en portugués', () => {
    render(
      <IdiomaProvider idioma="pt">
        <VerificacionesCola verificacionesIniciales={[]} />
      </IdiomaProvider>,
    )

    expect(screen.getByText('Ainda não há solicitações de verificação.')).toBeInTheDocument()
  })
})

const RASCUNHO = {
  draftId: 'server-draft-1',
  cue: '1801605-60',
  flujo: 'inicial',
  progreso: { pasoActual: 'servicios', pasosCompletados: ['inicio', 'afectaciones'] },
  actividadEn: '2026-10-15T10:00:00.000Z',
  respuestas: { descripcion: 'Corte prolongado' },
}

describe('BorradoresPendientes · idioma', () => {
  it('traduce la sección de borradores al portugués', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.includes('/config')
        ? Response.json({ mapaBorradores: true })
        : { ok: true, json: async () => ({ items: [RASCUNHO], nextCursor: null }) }))

    render(
      <IdiomaProvider idioma="pt">
        <BorradoresPendientes cue="1801605-60" count={2} />
      </IdiomaProvider>,
    )

    const seccion = await screen.findByRole('region', { name: 'Rascunhos não enviados' })
    expect(within(seccion).getByLabelText('2 rascunhos não enviados')).toBeInTheDocument()
    expect(within(seccion).getByText(/2 passos concluídos · Em/)).toBeInTheDocument()
    expect(within(seccion).getByText('Última atividade')).toBeInTheDocument()
    expect(within(seccion).getByText('Respostas permitidas')).toBeInTheDocument()
    expect(within(seccion).getByText('Avanços salvos no servidor. Não fazem parte das situações confirmadas.')).toBeInTheDocument()
  })

  it('mantiene los textos en español de borradores', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.includes('/config')
        ? Response.json({ mapaBorradores: true })
        : { ok: true, json: async () => ({ items: [RASCUNHO], nextCursor: null }) }))

    render(
      <IdiomaProvider idioma="es">
        <BorradoresPendientes cue="1801605-60" count={2} />
      </IdiomaProvider>,
    )

    const seccion = await screen.findByRole('region', { name: 'Borradores sin enviar' })
    expect(within(seccion).getByLabelText('2 borradores sin enviar')).toBeInTheDocument()
    expect(within(seccion).getByText(/2 pasos completados · En/)).toBeInTheDocument()
    expect(within(seccion).getByText('Última actividad')).toBeInTheDocument()
  })
})
