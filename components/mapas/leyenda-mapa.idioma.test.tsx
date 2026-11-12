// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, within } from '@testing-library/react'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'
import { LeyendaMapa } from '@/components/mapas/leyenda-mapa'

describe('LeyendaMapa · idioma', () => {
  it('mantiene los textos en español de la leyenda', () => {
    const { container } = render(
      <IdiomaProvider idioma="es">
        <LeyendaMapa pestana="actual" estacionesRio lluviaObservada={{ hasta: null, horas: 24, parciales: 0, vencida: false }} />
      </IdiomaProvider>,
    )

    const leyenda = within(container.querySelector('aside.map-leyenda') as HTMLElement)
    expect(container.querySelector('aside')).toHaveAttribute('aria-label', 'Referencias del mapa')
    expect(leyenda.getByText('Situación actual')).toBeInTheDocument()
    expect(leyenda.getByText('Estaciones de Prefectura')).toBeInTheDocument()
    expect(leyenda.getByText('Evacuación')).toBeInTheDocument()
    expect(leyenda.getByText('Lluvia observada 24 h')).toBeInTheDocument()
    expect(leyenda.getByText('Sin actualizar')).toBeInTheDocument()
    expect(leyenda.getByText('Gravedad / prioridad')).toBeInTheDocument()
  })

  it('muestra los textos de la leyenda en portugués de Brasil', () => {
    const { container } = render(
      <IdiomaProvider idioma="pt">
        <LeyendaMapa pestana="actual" estacionesRio lluviaObservada={{ hasta: null, horas: 24, parciales: 0, vencida: false }} />
      </IdiomaProvider>,
    )

    const leyenda = within(container.querySelector('aside.map-leyenda') as HTMLElement)
    expect(container.querySelector('aside')).toHaveAttribute('aria-label', 'Referências do mapa')
    expect(leyenda.getByText('Situação atual')).toBeInTheDocument()
    expect(leyenda.getByText('Estações da Prefeitura')).toBeInTheDocument()
    expect(leyenda.getByText('Evacuação')).toBeInTheDocument()
    expect(leyenda.getByText('Chuva observada 24 h')).toBeInTheDocument()
    expect(leyenda.getByText('Sem atualização')).toBeInTheDocument()
    expect(leyenda.getByText('Gravidade / prioridade')).toBeInTheDocument()
  })

  it('traduce la sección de riesgo del radar con el horizonte en portugués', () => {
    const { container } = render(
      <IdiomaProvider idioma="pt">
        <LeyendaMapa pestana="radar" horizonte={72} riesgoHoy />
      </IdiomaProvider>,
    )

    const leyenda = within(container.querySelector('aside.map-leyenda') as HTMLElement)
    expect(leyenda.getByText('Escolas em risco hoje')).toBeInTheDocument()
    expect(leyenda.getByText('Risco / gravidade', { exact: false })).toBeInTheDocument()
  })
})
