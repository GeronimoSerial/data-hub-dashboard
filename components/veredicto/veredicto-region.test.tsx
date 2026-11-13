// @vitest-environment jsdom
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { VeredictoPublico } from './veredicto-publico'
import { VeredictoAcciones } from './veredicto-acciones'
import { VeredictoModal } from './veredicto-modal'
import { NivelChip } from './nivel-chip'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'
import { __reiniciarIdiomaClienteParaPruebas } from '@/lib/i18n/idioma-cliente'
import { __reiniciarRegionPublicaClienteParaPruebas, fijarMarcaRegionCliente, fijarRegionPublicaCliente } from '@/lib/infraestructura/region/publica'
import { marcaPublica, regionPublica } from '@/lib/infraestructura/region/esquema'
import { cargarRegion } from '@/lib/infraestructura/region/registro'
import type { DtoVeredicto } from '@/lib/infraestructura/veredicto/dto'
import type { EventoTerreno } from '@/lib/infraestructura/veredicto/eventos-terreno'

function dto(parcial: Partial<DtoVeredicto>): DtoVeredicto {
  return {
    id: 'ver',
    fecha: '2026-10-12',
    ambito: 'provincia',
    tipoDia: 'observado',
    nivel: 'sin_senal',
    texto: 'Texto.',
    fuente: 'ia',
    enCalibracion: false,
    cerrado: false,
    generadoEn: '2026-10-13T09:00:00.000Z',
    version: 1,
    frases: null,
    traza: [],
    metricas: [],
    fuentesAusentes: [],
    aguasArriba: [],
    imergHasta: null,
    ...parcial,
  } as DtoVeredicto
}

const VEREDICTOS = [
  dto({ id: 'a', fecha: '2026-10-13', tipoDia: 'pronostico', nivel: 'alerta', texto: 'Alerta por lluvias.' }),
  dto({ id: 'b', fecha: '2026-10-12', enCalibracion: true }),
  dto({ id: 'c', fecha: '2026-10-12', ambito: 'departamento:dep-1', nivel: 'vigilancia', texto: 'Vigilancia.' }),
  dto({ id: 'd', fecha: '2026-10-12', ambito: 'departamento:dep-2', nivel: 'sin_senal', texto: 'Nada.' }),
]
const VEREDICTOS_PT = VEREDICTOS.map((v) => ({
  ...v,
  texto: v.ambito === 'provincia' ? 'Alerta de chuvas.' : v.nivel === 'vigilancia' ? 'Atenção ao nível do rio.' : 'Sem mudanças.',
}))
const EVENTO: EventoTerreno = {
  id: 'EV-1',
  fecha: '2026-10-12',
  fechaTexto: '12/10',
  departamento: 'PASO DE LOS LIBRES',
  lugar: 'Centro',
  titulo: 'Evento',
  tipo: 'Evento reportado',
  confianza: 'alta',
  confianzaTexto: 'Confianza alta',
  fuente: { medio: 'Medio', fecha: '13/10/2026', url: 'https://example.com/n' },
}

const hash = (html: string) => createHash('sha1').update(html).digest('hex')

function usarManaos() {
  const config = cargarRegion('manaos')
  fijarMarcaRegionCliente(marcaPublica(config))
  fijarRegionPublicaCliente(regionPublica(config))
}

function respuesta(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

async function modalAbierto(idioma: 'es' | 'pt', lista = VEREDICTOS) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => (url.includes('/eventos') ? respuesta({ eventos: [EVENTO] }) : respuesta({ veredictos: lista }))),
  )
  render(
    <IdiomaProvider idioma={idioma}>
      <VeredictoModal open onOpenChange={() => {}} onSeleccionarDepartamento={() => {}} eventos={[EVENTO]} />
    </IdiomaProvider>,
  )
  await waitFor(() => expect(screen.queryByText(/Cargando|Carregando/)).toBeNull())
  return document.body.innerHTML
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-12T15:00:00.000Z'))
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  __reiniciarRegionPublicaClienteParaPruebas()
  __reiniciarIdiomaClienteParaPruebas()
})

// Words that only exist in the Spanish texts of this feature.
const ESPANOL = /(Sin|Generado con|Cargando|Hoy|Departamentos|terreno|Confianza|Vigilancia|señal|calibración|pronóstico|Línea|enlaces?|novedades|Resúmenes|Revocar|Descargar|Consulte al)/

describe('veredicto · Corrientes sin cambios', () => {
  it('página pública', () => {
    const { container } = render(<VeredictoPublico veredictos={VEREDICTOS} eventos={[EVENTO]} />)
    expect(hash(container.innerHTML)).toBe('e5c77320cdf122cce3084653989681a9782063b0')
  })

  it('acciones', () => {
    const { container } = render(<VeredictoAcciones />)
    expect(hash(container.innerHTML)).toBe('ac941da580ed711ed3398f3a7fe0262aeaa8efa3')
  })

  it('chip de nivel', () => {
    const { container } = render(<NivelChip nivel="alerta" />)
    expect(container.innerHTML).toContain('aria-label="Nivel: Alerta"')
  })

  it('modal', async () => {
    expect(hash(await modalAbierto('es'))).toBe('4654c6a845d1eab427798ebd5270db070754940a')
  })
})

describe('veredicto · Manaos en portugués', () => {
  it('página pública sin texto en español', () => {
    usarManaos()
    __reiniciarIdiomaClienteParaPruebas()
    const { container } = render(
      <IdiomaProvider idioma="pt">
        <VeredictoPublico veredictos={VEREDICTOS_PT} eventos={[EVENTO]} />
      </IdiomaProvider>,
    )
    expect(container.textContent).not.toMatch(ESPANOL)
    expect(container.textContent).toContain('Veredito diário de inundações — Amazonas')
  })

  it('acciones sin texto en español', () => {
    usarManaos()
    const { container } = render(
      <IdiomaProvider idioma="pt">
        <VeredictoAcciones />
      </IdiomaProvider>,
    )
    expect(container.textContent).not.toMatch(ESPANOL)
    expect(container.innerHTML).not.toMatch(/aria-label="[^"]*(enlace|Descargar|Revocar)/i)
  })

  it('chip de nivel en portugués', () => {
    usarManaos()
    const { container } = render(
      <IdiomaProvider idioma="pt">
        <NivelChip nivel="sin_senal" />
      </IdiomaProvider>,
    )
    expect(container.textContent).toBe('Sem sinal')
  })

  it('modal sin texto en español', async () => {
    usarManaos()
    const html = await modalAbierto('pt', VEREDICTOS_PT)
    const texto = document.body.textContent ?? ''
    expect(texto).not.toMatch(ESPANOL)
    expect(html).not.toMatch(/aria-label="[^"]*( en el mapa|Línea|Departamentos|terreno|Sin )/)
  })
})
