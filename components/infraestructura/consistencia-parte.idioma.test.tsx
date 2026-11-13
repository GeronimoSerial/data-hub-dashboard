// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { IdiomaProvider } from '@/lib/i18n/idioma-provider'
import { textos } from '@/lib/i18n'
import { etiquetaSugerencia, mensajeConsistencia, type Regla } from '@/lib/infraestructura/consistencia-parte'
import { mensajesDeBloqueo, respuestasDeSituacion } from './actualizar/consistencia-actualizacion'
import { AvisosConsistencia } from './afectacion-campos'

afterEach(cleanup)

const pt = textos('pt')

const MENSAJE_EVACUACION_HABITUAL = 'Con una evacuación preventiva el edificio no puede figurar como habitual.'
const MENSAJE_INUNDACION_HABITUAL = 'Una inundación suele afectar al edificio. Verifique que siga figurando como habitual.'

const aviso: Regla = {
  codigo: 'inundacion-habitual',
  campo: 'edificio',
  mensaje: MENSAJE_INUNDACION_HABITUAL,
  sugerencia: { campo: 'edificio', valor: 'parcial', etiqueta: 'Cambiar a Uso parcial' },
  firma: '[]',
}

describe('consistencia del parte en portugués', () => {
  it('traduce un mensaje de regla y conserva el español por defecto', () => {
    expect(mensajeConsistencia(MENSAJE_EVACUACION_HABITUAL, pt))
      .toBe('Com uma evacuação preventiva, o prédio não pode constar como habitual.')
    expect(mensajeConsistencia(MENSAJE_EVACUACION_HABITUAL)).toBe(MENSAJE_EVACUACION_HABITUAL)
    expect(mensajeConsistencia('Texto libre del servidor', pt)).toBe('Texto libre del servidor')
  })

  it('traduce la etiqueta de la sugerencia y conserva el español por defecto', () => {
    expect(etiquetaSugerencia(aviso.sugerencia!, pt)).toBe('Mudar para Utilização parcial')
    expect(etiquetaSugerencia(aviso.sugerencia!)).toBe('Cambiar a Uso parcial')
  })

  it('traduce los mensajes de bloqueo del cambio a habitual', () => {
    const respuestas = respuestasDeSituacion({
      categoria: 'establecimiento',
      motivoId: 'evacuacion-preventiva',
      severidad: 'Alta',
      alcance: null,
      clases: null,
      edificio: 'habitual',
    })
    expect(mensajesDeBloqueo(respuestas, { descripcion: false }, pt))
      .toEqual(['Com uma evacuação preventiva, o prédio não pode constar como habitual.'])
    expect(mensajesDeBloqueo(respuestas, { descripcion: false })).toEqual([MENSAJE_EVACUACION_HABITUAL])
  })

  it('muestra el aviso y su sugerencia en portugués', () => {
    render(
      <IdiomaProvider idioma="pt">
        <AvisosConsistencia reglas={[aviso]} campos={['edificio']} onAplicar={() => {}} />
      </IdiomaProvider>,
    )
    expect(screen.getByText('Uma inundação costuma afetar o prédio. Verifique se ele continua constando como habitual.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mudar para Utilização parcial' })).toBeTruthy()
  })

  it('mantiene el aviso en español para Corrientes', () => {
    render(
      <IdiomaProvider idioma="es">
        <AvisosConsistencia reglas={[aviso]} campos={['edificio']} onAplicar={() => {}} />
      </IdiomaProvider>,
    )
    expect(screen.getByText(MENSAJE_INUNDACION_HABITUAL)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cambiar a Uso parcial' })).toBeTruthy()
  })
})
