// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { territorioCon } from '@/components/test-utils/territorio-mapa'
import type { SusceptibilidadEscuelaMapa } from '@/lib/infraestructura/territorio-mapa'

// La capa de inundación está oculta por flag en producción. Estos tests la
// prueban encendida, en un archivo propio para no alterar los de la ficha con
// la flag apagada.
vi.mock('@/lib/mapas/flags', () => ({ MOSTRAR_AGUA_ESTIMADA: true }))

import { FichaAccesoTerritorial } from './ficha-acceso-territorial'

const CUE = '1801605-04'

function fila(overrides: Partial<SusceptibilidadEscuelaMapa> = {}): SusceptibilidadEscuelaMapa {
  return { inundacionFluvialM: 1.234, claseRio: null, juntoLaguna: null, ...overrides }
}

function renderConSusceptibilidad(escuelas: Record<string, SusceptibilidadEscuelaMapa> | null) {
  return render(
    <FichaAccesoTerritorial
      territorio={territorioCon(null, escuelas)}
      territorioLoading={false}
      territorioError={null}
      cueAnexo={CUE}
      geometria={null}
      geometriaLoading={false}
      geometriaError={null}
    />,
  )
}

afterEach(() => {
  cleanup()
})

describe('FichaAccesoTerritorial - inundación como tags', () => {
  it.each([
    ['alto', 'Alto'],
    ['medio', 'Medio'],
    ['bajo', 'Bajo'],
    ['sin_riesgo', 'Sin riesgo'],
    ['sin_dato', 'Sin dato'],
  ] as const)('clase %s se muestra como tag "%s"', (claseRio, etiqueta) => {
    renderConSusceptibilidad({ [CUE]: fila({ claseRio }) })

    const valor = screen.getByTestId('ficha-acceso-susceptibilidad-valor')
    expect(valor).toHaveTextContent(etiqueta)
    expect(screen.getByTestId('ficha-acceso-clase-rio').className).toContain('badge')
  })

  it('clase null se muestra como "Sin dato", nunca como Bajo ni Sin riesgo', () => {
    renderConSusceptibilidad({ [CUE]: fila({ claseRio: null }) })

    expect(screen.getByTestId('ficha-acceso-clase-rio')).toHaveTextContent(/^Sin dato$/)
  })

  it('escuela fuera de los datos se muestra como "Sin dato"', () => {
    renderConSusceptibilidad({})

    expect(screen.getByTestId('ficha-acceso-clase-rio')).toHaveTextContent(/^Sin dato$/)
  })

  it('no renderiza profundidad en metros en la línea visible', () => {
    renderConSusceptibilidad({ [CUE]: fila({ claseRio: 'alto', inundacionFluvialM: 1.234 }) })

    const valor = screen.getByTestId('ficha-acceso-susceptibilidad-valor')
    expect(valor.textContent).toBe('Alto')
    expect(valor.textContent).not.toMatch(/\d\s?m\b/)
    expect(valor.textContent).not.toMatch(/agua estimada/i)
  })
})

describe('FichaAccesoTerritorial - tag "Junto a laguna"', () => {
  it('se muestra sólo cuando junto_laguna es true', () => {
    renderConSusceptibilidad({ [CUE]: fila({ claseRio: 'medio', juntoLaguna: true }) })

    expect(screen.getByTestId('ficha-acceso-junto-laguna')).toHaveTextContent(/^Junto a laguna$/)
  })

  it.each([false, null] as const)('no se muestra con junto_laguna %s', (juntoLaguna) => {
    renderConSusceptibilidad({ [CUE]: fila({ claseRio: 'medio', juntoLaguna }) })

    expect(screen.queryByTestId('ficha-acceso-junto-laguna')).not.toBeInTheDocument()
    expect(screen.getByTestId('ficha-acceso-clase-rio')).toHaveTextContent('Medio')
  })
})
