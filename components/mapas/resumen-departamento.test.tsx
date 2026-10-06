// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ResumenDepartamento } from './resumen-departamento'

afterEach(cleanup)

describe('ResumenDepartamento', () => {
  it('muestra nombre, totales y permite quitar el filtro', async () => {
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

    expect(screen.getByRole('region', { name: 'Departamento seleccionado' })).toHaveTextContent('Departamento: Capital')
    expect(screen.getByRole('region', { name: 'Departamento seleccionado' })).toHaveTextContent('10 escuelas · 3 con situaciones abiertas · 30%')
    await screen.getByRole('button', { name: 'Quitar filtro' }).click()
    expect(onQuitar).toHaveBeenCalledOnce()
  })

  it('muestra el nombre aunque los totales todavía no estén disponibles', () => {
    render(<ResumenDepartamento nombre="Capital" totales={null} onQuitar={() => {}} />)

    expect(screen.getByRole('region', { name: 'Departamento seleccionado' })).toHaveTextContent('Departamento: Capital')
    expect(screen.queryByText(/escuelas ·/)).not.toBeInTheDocument()
  })
})
