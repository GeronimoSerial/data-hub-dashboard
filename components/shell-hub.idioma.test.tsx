// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { AppShell } from './app-shell'
import { LoginForm } from '@/app/(publico)/login/login-form'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'

const { signIn } = vi.hoisted(() => ({ signIn: vi.fn() }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/app/providers', () => ({ useThemeMode: () => ({ mode: 'light', setMode: vi.fn() }) }))
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => ({ isPending: true, data: null }),
    signOut: vi.fn(),
    signIn: { email: signIn },
  },
}))
vi.mock('@/components/marca', () => ({ MarcaBanda: () => null, MarcaCompacta: () => null, MarcaHorizontal: () => null, MarcaHorizontalInversa: () => null }))

afterEach(() => {
  cleanup()
  signIn.mockReset()
})

function shell(idioma: 'es' | 'pt') {
  return render(
    <IdiomaProvider idioma={idioma}>
      <AppShell initialUser={null}>Contenido</AppShell>
    </IdiomaProvider>,
  )
}

function login(idioma: 'es' | 'pt') {
  return render(
    <IdiomaProvider idioma={idioma}>
      <LoginForm />
    </IdiomaProvider>,
  )
}

describe('AppShell · idioma', () => {
  it('mantiene los textos del shell en español', () => {
    shell('es')
    expect(screen.getByText('Ir al contenido')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Usar tema oscuro' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Menú de cuenta' })).toBeInTheDocument()
  })

  it('muestra los textos del shell en portugués', () => {
    shell('pt')
    expect(screen.getByText('Ir ao conteúdo')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Usar tema escuro' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Menu da conta' })).toBeInTheDocument()
  })

  it('traduce el menú de cuenta sin sesión', () => {
    shell('pt')
    fireEvent.click(screen.getByRole('button', { name: 'Menu da conta' }))
    expect(screen.getByRole('menuitem', { name: 'Iniciar sessão' })).toBeInTheDocument()
  })
})

describe('LoginForm · idioma', () => {
  it('muestra el formulario en español', () => {
    login('es')
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(screen.getByText('Correo')).toBeInTheDocument()
    expect(screen.getByText('Contraseña')).toBeInTheDocument()
  })

  it('muestra el formulario en portugués', () => {
    login('pt')
    expect(screen.getByRole('heading', { name: 'Iniciar sessão' })).toBeInTheDocument()
    expect(screen.getByText('Entre com a conta atribuída pela administração.')).toBeInTheDocument()
    expect(screen.getByText('E-mail')).toBeInTheDocument()
    expect(screen.getByText('Senha')).toBeInTheDocument()
  })

  it('muestra el error de acceso en portugués', async () => {
    signIn.mockResolvedValue({ error: { message: 'invalid' } })
    login('pt')
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sessão' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível iniciar sessão. Verifique o e-mail e a senha e tente novamente.',
    )
  })
})
