// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ResumenDepartamento } from './resumen-departamento'

afterEach(cleanup)

describe('ResumenDepartamento', () => {
  it('muestra el preview del departamento con sus totales y permite cerrarlo', async () => {
    const onQuitar = vi.fn()
    render(
      <ResumenDepartamento
        nombre="Capital"
        totales={{
          departamentoOriginal: 'Capital',
          totalEscuelas: 10,
          escuelasAfectadas: 3,
          porcentajeAfectadas: 30,
        }}
        onQuitar={onQuitar}
      />,
    )

    const region = screen.getByRole('region', { name: 'Departamento Capital' })
    expect(screen.getByRole('heading', { level: 2, name: 'Capital' })).toBeInTheDocument()
    expect(region).toHaveTextContent('Departamento · 10 escuelas')
    expect(region).toHaveTextContent('3escuelas con situaciones abiertas')
    expect(region).toHaveTextContent('30% de las escuelas del departamento')
    expect(region).toHaveTextContent('Filtro activo')
    await screen.getByRole('button', { name: 'Cerrar departamento' }).click()
    expect(onQuitar).toHaveBeenCalledOnce()
    await screen.getByRole('button', { name: 'Quitar filtro' }).click()
    expect(onQuitar).toHaveBeenCalledTimes(2)
  })

  it('muestra el nombre aunque los totales todavía no estén disponibles', () => {
    render(<ResumenDepartamento nombre="Capital" totales={null} onQuitar={() => {}} />)

    expect(screen.getByRole('heading', { level: 2, name: 'Capital' })).toBeInTheDocument()
    expect(screen.queryByText(/situaciones abiertas/)).not.toBeInTheDocument()
  })
})
