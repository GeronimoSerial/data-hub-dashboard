// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { territorioCon } from '@/components/test-utils/territorio-mapa'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'
import { __reiniciarIdiomaClienteParaPruebas } from '@/lib/i18n/idioma-cliente'
import type { resumirCobertura } from '@/lib/mapas/accesos-capas'
import type { CapaAccesos } from './layer-control'
import { LeyendaAccesos } from './capas-accesos'

// react-map-gl/maplibre necesita WebGL, que no existe en jsdom. LeyendaAccesos
// no monta capas de mapa, así que basta con un doble vacío.
vi.mock('react-map-gl/maplibre', () => ({
  __esModule: true,
  default: () => null,
  Source: () => null,
  Layer: () => null,
}))

const visibles: Record<CapaAccesos, boolean> = { aislamiento: true, inundacion: false }

const territorio = territorioCon({}, {}, {
  aislamiento: { versionJob: '1' },
  susceptibilidad: { fechaCorrida: '2026-05-15' },
})

const resumen: ReturnType<typeof resumirCobertura> = {
  aislamiento: { 0: 5, 1: 3, 2: 2, 3: 1, sin_datos_red: 4, sin_cobertura: 7 },
  inundacion: { alto: 6, medio: 5, bajo: 4, sin_riesgo: 3, sin_dato: 2 },
  total: 27,
}

function leyenda(overrides: Partial<Parameters<typeof LeyendaAccesos>[0]> = {}) {
  return (
    <LeyendaAccesos
      visibles={visibles}
      territorio={null}
      territorioLoading={false}
      territorioError={null}
      resumen={null}
      {...overrides}
    />
  )
}

afterEach(() => {
  cleanup()
  __reiniciarIdiomaClienteParaPruebas()
})

describe('LeyendaAccesos · idioma español (default)', () => {
  it('mantiene la etiqueta de la tarjeta y el texto de carga', () => {
    render(leyenda({ territorioLoading: true }))

    expect(screen.getByLabelText('Datos territoriales')).toBeTruthy()
    expect(screen.getByTestId('leyenda-territorio-cargando')).toHaveTextContent('Cargando capas territoriales…')
  })

  it('mantiene el aviso de caminos sin cargar y el conteo sin cobertura', () => {
    const { rerender } = render(leyenda({ resumen: resumen }))
    expect(screen.getByTestId('leyenda-aislamiento-sin-datos')).toHaveTextContent('Sin datos de caminos cargados.')

    rerender(leyenda({ territorio, resumen }))
    expect(screen.getByTestId('leyenda-aislamiento-contenido')).toHaveTextContent('Sin dato (escuela fuera de los datos): 7')
  })
})

describe('LeyendaAccesos · idioma portugués', () => {
  it('muestra la etiqueta de la tarjeta y el texto de carga en portugués', () => {
    render(
      <IdiomaProvider idioma="pt">
        {leyenda({ territorioLoading: true })}
      </IdiomaProvider>,
    )

    expect(screen.getByLabelText('Dados territoriais')).toBeTruthy()
    expect(screen.getByTestId('leyenda-territorio-cargando')).toHaveTextContent('Carregando camadas territoriais…')
  })

  it('muestra el aviso de caminos sin cargar y el conteo sin cobertura en portugués', () => {
    const { rerender } = render(
      <IdiomaProvider idioma="pt">
        {leyenda({ resumen: resumen })}
      </IdiomaProvider>,
    )
    expect(screen.getByTestId('leyenda-aislamiento-sin-datos')).toHaveTextContent('Sem dados de caminhos carregados.')

    rerender(
      <IdiomaProvider idioma="pt">
        {leyenda({ territorio, resumen })}
      </IdiomaProvider>,
    )
    expect(screen.getByTestId('leyenda-aislamiento-contenido')).toHaveTextContent('Sem dado (escola fora dos dados): 7')
  })
})
