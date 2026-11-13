// @vitest-environment jsdom
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { HubPage } from './hub-page'
import { ResourceCard } from './resource-card'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'
import { __reiniciarIdiomaClienteParaPruebas } from '@/lib/i18n/idioma-cliente'
import type { Recurso } from '@/lib/model'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/auth-client', () => ({ authClient: { useSession: () => ({ data: null, isPending: false }) } }))

const RECURSO = {
  id: 'r',
  titulo: 'Recurso',
  descripcion: 'Descripción.',
  formato: 'mapa',
  categoriaId: 'c',
  nivelId: 'n',
  area: 'Área',
  actualizado: '2026-09-16',
  estado: 'publicado',
  acceso: 'ingresar',
  ruta: '/mapas/x',
  tagIds: [],
} as unknown as Recurso
const REPORTE = { ...RECURSO, id: 'r2', formato: 'reporte', acceso: 'restringido' } as unknown as Recurso

vi.mock('@/components/hub-data', () => ({
  useHubData: () => ({
    recursos: [RECURSO, REPORTE],
    categorias: [{ id: 'c', nombre: 'Tema' }],
    niveles: [{ id: 'n', nombre: 'Nivel' }],
  }),
}))
vi.mock('@/components/app-shell', () => ({ useSectionAccess: () => () => true }))

const hash = (html: string) => createHash('sha1').update(html).digest('hex')

afterEach(() => {
  cleanup()
  __reiniciarIdiomaClienteParaPruebas()
})

// Words that exist only in the Spanish texts of these components.
const ESPANOL = /(Análisis|Ministerio|ingresar|Buscar|Registrar una|Cargar el|Actualizaciones|Requiere|Restringido|Reporte|Tablero|Niveles|Paneles|Visualizaciones|Ver los)/

describe('portada y tarjetas · Corrientes sin cambios', () => {
  it('HubPage', () => {
    const { container } = render(<HubPage />)
    expect(hash(container.innerHTML)).toBe('3e499d2b5d8625001527dc342a57cf928235f6f6')
  })

  it('ResourceCard', () => {
    const { container } = render(<><ResourceCard recurso={RECURSO} /><ResourceCard recurso={REPORTE} /></>)
    expect(hash(container.innerHTML)).toBe('220c4158f7bff1a74b15f2908a6d0f52ad9f8f36')
  })
})

describe('portada y tarjetas · Manaos en portugués', () => {
  it('HubPage sin texto en español', () => {
    const { container } = render(<IdiomaProvider idioma="pt"><HubPage /></IdiomaProvider>)
    const fuera = (container.textContent ?? '').replace(/Recurso|Descripción\.|Área|Tema|Nivel/g, '')
    expect(fuera).not.toMatch(ESPANOL)
  })

  it('ResourceCard sin texto en español', () => {
    const { container } = render(<IdiomaProvider idioma="pt"><ResourceCard recurso={RECURSO} /><ResourceCard recurso={REPORTE} /></IdiomaProvider>)
    const fuera = (container.textContent ?? '').replace(/Recurso|Descripción\.|Área|Tema|Nivel/g, '')
    expect(fuera).not.toMatch(ESPANOL)
  })
})
