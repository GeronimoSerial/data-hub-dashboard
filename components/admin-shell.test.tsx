// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { AdminShell } from './admin-shell'

const children = <div>Contenido</div>

afterEach(cleanup)

describe('AdminShell', () => {
  it('muestra las secciones habilitadas a staff y las oculta al desactivar los flags', () => {
    const { rerender } = render(<AdminShell role="editor" flags={{ riskEngineEnabled: true, episodiosDerivadosEnabled: true }}>{children}</AdminShell>)
    expect(screen.getByRole('link', { name: 'Verificaciones' })).toHaveAttribute('href', '/admin/verificaciones')
    expect(screen.getByRole('link', { name: 'Motor de riesgo' })).toHaveAttribute('href', '/admin/riesgo')
    expect(screen.getByRole('link', { name: 'Episodios derivados' })).toHaveAttribute('href', '/admin/episodios-derivados')
    rerender(<AdminShell role="editor" flags={{ riskEngineEnabled: false, episodiosDerivadosEnabled: false }}>{children}</AdminShell>)
    expect(screen.queryByRole('link', { name: 'Motor de riesgo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Episodios derivados' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Verificaciones' })).toBeInTheDocument()
  })

  it('reserva salud, motivos y acceso nominal para administración', () => {
    const { rerender } = render(<AdminShell role="admin" flags={{ riskEngineEnabled: false, episodiosDerivadosEnabled: false }}>{children}</AdminShell>)
    expect(screen.getByRole('link', { name: 'Salud' })).toHaveAttribute('href', '/admin/operacion')
    expect(screen.getByRole('link', { name: 'Motivos' })).toHaveAttribute('href', '/admin#motivos')
    expect(screen.getByRole('link', { name: 'Acceso nominal' })).toHaveAttribute('href', '/admin#nominal')
    expect(screen.getByRole('link', { name: 'Motivos' }).closest('.admin-sidebar__section')).toHaveTextContent('Organización')
    expect(screen.getByRole('link', { name: 'Acceso nominal' }).closest('.admin-sidebar__section')).toHaveTextContent('Accesos')
    rerender(<AdminShell role="editor" flags={{ riskEngineEnabled: true, episodiosDerivadosEnabled: true }}>{children}</AdminShell>)
    expect(screen.queryByRole('link', { name: 'Salud' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Motivos' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Acceso nominal' })).not.toBeInTheDocument()
  })

  it('oculta los accesos staff a consulta aunque los flags estén activos', () => {
    render(<AdminShell role="consulta" flags={{ riskEngineEnabled: true, episodiosDerivadosEnabled: true }}>{children}</AdminShell>)
    expect(screen.queryByRole('link', { name: 'Verificaciones' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Motor de riesgo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Episodios derivados' })).not.toBeInTheDocument()
  })
})
