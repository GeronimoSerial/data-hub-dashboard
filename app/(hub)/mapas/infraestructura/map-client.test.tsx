// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InfraestructuraMapClient } from './map-client'

// Contador de MONTAJES del mapa (no de renders: el cuerpo de un componente
// se ejecuta en cada render, y cambiar de pestaña re-renderiza el árbol aunque
// el mapa no se desmonte). Si cambiar de pestaña desmontara MapLibre, el
// contador subiría y el nodo del DOM sería otro: las dos señales juntas son
// la evidencia de que el mapa sólo se OCULTA (F5.1).
// `vi.hoisted` porque las fábricas de `vi.mock` se izan antes que cualquier
// declaración normal de este archivo.
const montajesMapa = vi.hoisted(() => ({ total: 0 }))

vi.mock('@/components/mapas/map-infraestructura-page', () => ({
  default: function MapaDePrueba(): React.JSX.Element {
    React.useEffect(() => {
      montajesMapa.total += 1
    }, [])
    return <div data-testid="mock-mapa" />
  },
}))

vi.mock('@/components/infraestructura/evolucion-panel', () => ({
  EvolucionPanel: () => <div data-testid="mock-evolucion" />,
}))

beforeEach(() => {
  montajesMapa.total = 0
  window.location.hash = ''
})

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
})

describe('InfraestructuraMapClient — pestañas sobre el mapa', () => {
  it('cambiar de pestaña oculta el mapa con CSS sin desmontarlo', async () => {
    render(<InfraestructuraMapClient mostrarEnlaceNominal />)

    const mapa = await screen.findByTestId('mock-mapa')
    expect(montajesMapa.total).toBe(1)
    expect(screen.queryByTestId('mock-evolucion')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Evolución' }))

    // Mismo nodo del DOM y un solo montaje: MapLibre no se remontó.
    expect(screen.getByTestId('mock-mapa')).toBe(mapa)
    expect(montajesMapa.total).toBe(1)
    // Oculto, no borrado.
    expect(mapa).not.toBeVisible()

    expect(await screen.findByTestId('mock-evolucion')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: 'Operativa' }))

    expect(screen.getByTestId('mock-mapa')).toBe(mapa)
    expect(montajesMapa.total).toBe(1)
    expect(mapa).toBeVisible()
    expect(screen.queryByTestId('mock-evolucion')).not.toBeInTheDocument()
  })

  it('la pestaña de evolución se abre directo desde el hash de la URL', async () => {
    window.location.hash = 'evolucion'

    render(<InfraestructuraMapClient mostrarEnlaceNominal />)

    expect(await screen.findByTestId('mock-evolucion')).toBeInTheDocument()
    // El mapa sigue montado (y oculto) detrás de la pestaña de evolución.
    expect(await screen.findByTestId('mock-mapa')).not.toBeVisible()
    expect(montajesMapa.total).toBe(1)
  })

  it('escribe el hash al cambiar de pestaña, para que el enlace sea copiable', async () => {
    render(<InfraestructuraMapClient mostrarEnlaceNominal />)
    await screen.findByTestId('mock-mapa')

    await userEvent.click(screen.getByRole('tab', { name: 'Evolución' }))
    expect(window.location.hash).toBe('#evolucion')

    await userEvent.click(screen.getByRole('tab', { name: 'Operativa' }))
    expect(window.location.hash).toBe('#operativa')
  })
})
