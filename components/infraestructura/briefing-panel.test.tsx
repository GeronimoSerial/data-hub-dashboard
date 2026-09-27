// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { BriefingPanel } from './briefing-panel'

afterEach(() => {
  cleanup()
})

describe('BriefingPanel', () => {
  it('no renderiza nada cuando briefing es null', () => {
    const { container } = render(<BriefingPanel briefing={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('muestra las líneas de la plantilla y la leyenda de origen por reglas', () => {
    render(
      <BriefingPanel
        briefing={{
          textoFinal: 'Línea uno.\nLínea dos.',
          fuente: 'plantilla',
          salidaIa: null,
          creadaEn: '2026-01-01T14:35:00.000Z',
        }}
      />,
    )

    expect(screen.getByText('Línea uno.')).toBeInTheDocument()
    expect(screen.getByText('Línea dos.')).toBeInTheDocument()
    expect(screen.getByText('Resumen automático por reglas.')).toBeInTheDocument()
  })

  it('muestra las frases de la IA con sus refs y la leyenda con hora UTC', () => {
    render(
      <BriefingPanel
        briefing={{
          textoFinal: 'no debería usarse',
          fuente: 'ia',
          salidaIa: {
            frases: [
              { texto: 'Hay 7 escuelas en riesgo alto.', refs: ['kpi.escuelas_riesgo_alto_24h'] },
            ],
          },
          creadaEn: '2026-01-01T14:35:00.000Z',
        }}
      />,
    )

    expect(screen.getByText('Hay 7 escuelas en riesgo alto.')).toBeInTheDocument()
    expect(screen.getByText('(kpi.escuelas_riesgo_alto_24h)')).toBeInTheDocument()
    expect(
      screen.getByText('Generado por IA a partir del corte de las 14:35.'),
    ).toBeInTheDocument()
  })

  it('cae a mostrar el texto final cuando salidaIa viene corrupto', () => {
    render(
      <BriefingPanel
        briefing={{
          textoFinal: 'Texto final de respaldo.',
          fuente: 'ia',
          salidaIa: { algo: 'sin forma esperada' },
          creadaEn: '2026-01-01T14:35:00.000Z',
        }}
      />,
    )

    expect(screen.getByText('Texto final de respaldo.')).toBeInTheDocument()
  })

  it('cae a mostrar el texto final cuando salidaIa es null pero fuente es ia', () => {
    render(
      <BriefingPanel
        briefing={{
          textoFinal: 'Texto final sin salida IA.',
          fuente: 'ia',
          salidaIa: null,
          creadaEn: '2026-01-01T14:35:00.000Z',
        }}
      />,
    )

    expect(screen.getByText('Texto final sin salida IA.')).toBeInTheDocument()
  })
})
