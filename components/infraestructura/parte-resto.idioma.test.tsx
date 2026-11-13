// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'
import { EncabezadoParte } from './encabezado-parte'
import { EstadoEnvioAviso } from './estado-envio-aviso'
import { MaterialesTrasReporte } from './materiales-tras-reporte'
import { AccesoForm } from './acceso-form'
import { AlcanceNominalModal } from './alcance-nominal-modal'
import { NominalPermisosAdmin } from './nominal-permisos-admin'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const escuela = { nombre: 'Escuela N° 105 Sarmiento', cueAnexo: '1801605-00', localidad: 'Corrientes' }

function respuestaJson(cuerpo: unknown) {
  return { ok: true, json: async () => cuerpo }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('parteResto en español', () => {
  it('encabezado con los textos del programa', () => {
    render(
      <IdiomaProvider idioma="es">
        <EncabezadoParte pantalla="Estado actual" escuela={escuela} />
      </IdiomaProvider>,
    )
    expect(screen.getByText('Registro de Incidencias ENOS 2026/2027')).toBeInTheDocument()
    expect(screen.getByText('El Niño – Oscilación del Sur')).toBeInTheDocument()
    expect(screen.getByText('Manuales y cuadernillos')).toBeInTheDocument()
    expect(screen.getByText('CUE 1801605-00 · Corrientes')).toBeInTheDocument()
  })

  it('aviso de envio con el mensaje sin conexión y el botón de reintento', () => {
    render(
      <IdiomaProvider idioma="es">
        <EstadoEnvioAviso estado="error-servidor" onRetry={() => undefined} />
      </IdiomaProvider>,
    )
    expect(screen.getByText('No pudimos enviar. Reintentamos en unos segundos.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar ahora' })).toBeInTheDocument()
  })

  it('materiales tras el reporte', () => {
    render(
      <IdiomaProvider idioma="es">
        <MaterialesTrasReporte />
      </IdiomaProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Materiales para consultar sin conexión' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Materiales de consulta' })).toBeInTheDocument()
  })

  it('formulario de acceso', () => {
    render(
      <IdiomaProvider idioma="es">
        <AccesoForm />
      </IdiomaProvider>,
    )
    expect(screen.getByText('Este formulario requiere una contraseña de acceso.')).toBeInTheDocument()
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ingresar' })).toBeInTheDocument()
  })

  it('modal de alcance nominal mientras busca', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)))
    render(
      <IdiomaProvider idioma="es">
        <AlcanceNominalModal afectacionId="af-1" onOpenChange={() => undefined} />
      </IdiomaProvider>,
    )
    expect(screen.getByText('Alumnos alcanzados')).toBeInTheDocument()
    expect(screen.getByText('Buscando los alumnos alcanzados…')).toBeInTheDocument()
  })

  it('administración de permisos nominales vacía', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      respuestaJson(url.includes('/usuarios') ? { usuarios: [] } : { permisos: [] })))
    render(
      <IdiomaProvider idioma="es">
        <NominalPermisosAdmin />
      </IdiomaProvider>,
    )
    expect(screen.getByRole('button', { name: 'Otorgar acceso' })).toBeInTheDocument()
    expect(await screen.findByText('No hay permisos nominales otorgados.')).toBeInTheDocument()
  })
})

describe('parteResto en portugués', () => {
  it('encabezado con los textos del programa', () => {
    render(
      <IdiomaProvider idioma="pt">
        <EncabezadoParte pantalla="Estado atual" escuela={escuela} />
      </IdiomaProvider>,
    )
    expect(screen.getByText('Registro de Incidências ENOS 2026/2027')).toBeInTheDocument()
    expect(screen.getByText('El Niño – Oscilação do Sul')).toBeInTheDocument()
    expect(screen.getByText('Manuais e cadernos')).toBeInTheDocument()
    expect(screen.getByText('CUE 1801605-00 · Corrientes')).toBeInTheDocument()
  })

  it('aviso de envio com a mensagem de erro e o botão de nova tentativa', () => {
    render(
      <IdiomaProvider idioma="pt">
        <EstadoEnvioAviso estado="error-servidor" onRetry={() => undefined} />
      </IdiomaProvider>,
    )
    expect(screen.getByText('Não conseguimos enviar. Tentaremos de novo em alguns segundos.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar novamente agora' })).toBeInTheDocument()
  })

  it('materiais após o relatório', () => {
    render(
      <IdiomaProvider idioma="pt">
        <MaterialesTrasReporte />
      </IdiomaProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Materiais para consultar sem conexão' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Materiais de consulta' })).toBeInTheDocument()
  })

  it('formulário de acesso', () => {
    render(
      <IdiomaProvider idioma="pt">
        <AccesoForm />
      </IdiomaProvider>,
    )
    expect(screen.getByText('Este formulário exige uma senha de acesso.')).toBeInTheDocument()
    expect(screen.getByLabelText('Senha')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument()
  })

  it('modal de alcance nominal enquanto busca', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)))
    render(
      <IdiomaProvider idioma="pt">
        <AlcanceNominalModal afectacionId="af-1" onOpenChange={() => undefined} />
      </IdiomaProvider>,
    )
    expect(screen.getByText('Alunos alcançados')).toBeInTheDocument()
    expect(screen.getByText('Buscando os alunos alcançados…')).toBeInTheDocument()
  })

  it('administração de permissões nominais vazia', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      respuestaJson(url.includes('/usuarios') ? { usuarios: [] } : { permisos: [] })))
    render(
      <IdiomaProvider idioma="pt">
        <NominalPermisosAdmin />
      </IdiomaProvider>,
    )
    expect(screen.getByRole('button', { name: 'Conceder acesso' })).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByText('Não há permissões nominais concedidas.')).toBeInTheDocument())
  })
})
