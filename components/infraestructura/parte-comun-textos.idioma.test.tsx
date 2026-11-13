// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'
import { textos } from '@/lib/i18n'
import { MENSAJES_ESTADO, mensajesEstado } from '@/lib/infraestructura/parte/envio-offline'
import { errorVigencia } from '@/lib/infraestructura/vigencia-eleccion'
import { mensajeFueraDeRangoVigencia, MENSAJE_FUERA_DE_RANGO_VIGENCIA } from '@/lib/infraestructura/vigencia-rango'
import { criterioSeveridad } from '@/lib/infraestructura/severidad'
import { etiquetaJustificacionCritica } from '@/lib/infraestructura/justificacion-critica'
import { etiquetaClases, etiquetaServicio } from '@/components/infraestructura/estado-actual-textos'
import { EntradaActualizar } from './actualizar/entrada-actualizar'

afterEach(cleanup)

const pt = textos('pt')

describe('textos comunes del parte en portugués', () => {
  it('etiqueta el servicio y las clases en pt y conserva el español', () => {
    expect(etiquetaServicio('parcial', pt)).toBe('Funcionamento parcialmente interrompido')
    expect(etiquetaClases('suspendido', pt)).toBe('Não, foram suspensas')
    expect(etiquetaServicio('parcial')).toBe('Funcionamiento parcialmente interrumpido')
    expect(etiquetaClases('suspendido')).toBe('No, se suspendieron')
  })

  it('traduce los mensajes de envío y deja MENSAJES_ESTADO en español', () => {
    expect(mensajesEstado(pt)['pendiente-envio']).toBe('Sem conexão. Seu parte fica salvo e é enviado sozinho quando a conexão voltar.')
    expect(mensajesEstado(pt)['sesion-vencida']).toBe('A sessão expirou. Entre de novo com o link da sua escola; o que foi preenchido fica salvo.')
    expect(mensajesEstado()).toEqual(MENSAJES_ESTADO)
    expect(MENSAJES_ESTADO['error']).toBe('No se pudo enviar')
  })

  it('traduce los errores de vigencia y la ventana de fechas', () => {
    expect(errorVigencia({ modo: 'hoy', hora: '' }, new Date(), pt)).toBe('Escolha o horário.')
    expect(errorVigencia({ modo: 'otro', fecha: '', hora: '' }, new Date(), pt)).toBe('Escolha a data e o horário.')
    expect(mensajeFueraDeRangoVigencia(pt)).toBe('A data deve estar entre 12 meses atrás e o momento atual.')
    expect(errorVigencia({ modo: 'hoy', hora: '' })).toBe('Elija la hora.')
    expect(MENSAJE_FUERA_DE_RANGO_VIGENCIA).toBe('La fecha debe estar entre hace 12 meses y el momento actual.')
  })

  it('traduce el criterio de severidad por categoría', () => {
    expect(criterioSeveridad('Crítica', 'alumnos', pt)).toBe('Chegar implica risco para os alunos (atravessar um arroio cheio, um caminho alagado).')
    expect(criterioSeveridad('Media', 'establecimiento', pt)).toBe('Condiciona as aulas: algumas turmas ou turnos funcionam pela metade.')
    expect(criterioSeveridad('Media', 'establecimiento')).toBe('Condiciona el dictado: algunas secciones o turnos funcionan a medias.')
  })

  it('traduce la justificación crítica', () => {
    expect(etiquetaJustificacionCritica('riesgo_fisico', pt)).toBe('Há risco elétrico, estrutural ou sanitário')
    expect(etiquetaJustificacionCritica('riesgo_fisico')).toBe('Hay riesgo eléctrico, estructural o sanitario')
  })
})

describe('EntradaActualizar en portugués', () => {
  const situacion = {
    id: 'a',
    motivo: 'Inundación',
    categoria: 'establecimiento' as const,
    severidad: 'Alta' as const,
    rigeDesde: '2026-10-03T10:00:00.000Z',
    creadaEn: '2026-10-03T10:00:00.000Z',
    causadaPorId: null,
  }

  it('muestra el estado del servicio en portugués', () => {
    render(
      <IdiomaProvider idioma="pt">
        <EntradaActualizar
          situaciones={[situacion]}
          estadoEstablecimiento="habitual"
          estadoServicio="parcial"
          ultimaCarga={null}
          historial={[]}
          onActualizar={() => {}}
        />
      </IdiomaProvider>,
    )
    expect(screen.getByText(/Funcionamento parcialmente interrompido/)).toBeTruthy()
    expect(screen.queryByText(/Funcionamiento parcialmente interrumpido/)).toBeNull()
  })
})
