// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MetodologiaMapa } from './metodologia-mapa'
import { MOTOR_VERSION, REGLAS_V04_VERSION, PESOS_AMENAZA } from '@/lib/infraestructura/riesgo/motor/config'
import { calcularRiesgoAcceso } from '@/lib/infraestructura/riesgo/motor/riesgo-acceso'
import { UMBRALES_PROVISORIOS_MM } from '@/lib/infraestructura/riesgo/peligro/umbrales-provisorios'

beforeEach(() => vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null))
afterEach(() => { cleanup(); vi.restoreAllMocks() })


function cambiar(id: string, valor: string) {
  const campo = document.getElementById(id) as HTMLInputElement
  fireEvent.input(campo, { target: { value: valor } })
}

describe('MetodologiaMapa', () => {
  it('explains every model of the map in one place', () => {
    render(<MetodologiaMapa />)

    for (const titulo of [
      'Trazabilidad de los datos',
      '1 · Continuidad pedagógica',
      'Lluvia observada desde el espacio',
      '3 · Riesgo estimado',
      '4 · Aislamiento vial',
      '5 · Riesgo de acceso',
      '6 · Inundación',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: titulo })).toBeTruthy()
    }
    expect(screen.getAllByText(/NASA GPM IMERG/).length).toBeGreaterThan(0)
    expect(screen.getByText(/JRC Global River Flood Hazard Maps v2\.1/)).toBeTruthy()
    expect(screen.getByText(/Inaccesibilidad de docentes/)).toBeTruthy()
  })

  it('publica la versión operativa, sus fuentes y las degradaciones sin fórmulas obsoletas', () => {
    const { container } = render(<MetodologiaMapa />)
    const riesgo = container.querySelector('#riesgo')!
    expect(riesgo).toHaveTextContent(MOTOR_VERSION)
    expect(riesgo).toHaveTextContent(REGLAS_V04_VERSION)
    for (const fuente of ['GloFAS', 'Prefectura', 'INA A5', 'Copernicus', 'IGN', 'JRC', 'IMERG', 'SYNOP']) {
      expect(container).toHaveTextContent(fuente)
    }
    for (const codigo of ['padron_no_disponible', 'altimetria_no_disponible', 'terreno_no_disponible', 'serie_ina_desactualizada', 'peligro_240h_respaldo', 'peligro_240h_sin_dato']) {
      expect(riesgo).toHaveTextContent(codigo)
    }
    expect(container.textContent).not.toMatch(/motor[ -]v0\.[123]|mm\/150|promedio de indicadores/)
    expect(container.querySelector('.katex-error')).toBeNull()
  })

  it('conecta probabilidades, pisos, vulnerabilidad desconocida y ausencia total al simulador', () => {
    render(<MetodologiaMapa />)
    const check = (id: string, checked: boolean) => {
      const campo = document.getElementById(id) as HTMLInputElement
      if (campo.checked !== checked) fireEvent.click(campo)
    }
    check('r-pc-on', false)
    check('r-cq-on', false)
    check('r-ll-on', false)
    check('r-hist-on', false)
    check('r-su-on', false)
    expect(document.getElementById('r-R')).toHaveTextContent('Sin dato')
    expect(document.getElementById('r-V')).toHaveTextContent('Desconocida')
    check('r-prob-on', true)
    cambiar('r-prob', '0')
    cambiar('r-cons', '20')
    expect(document.getElementById('r-R')).toHaveTextContent('25')
    cambiar('r-prob', '50')
    expect(document.getElementById('r-R')).toHaveTextContent('50')
    expect(document.getElementById('r-weights')).toHaveTextContent('Río probabilístico100,00 %')
    expect(document.getElementById('r-weights')).not.toHaveTextContent('Río observado')
    check('r-prob-on', false)
    cambiar('r-estado', 'evacuacion')
    expect(document.getElementById('r-R')).toHaveTextContent('100')
    cambiar('r-alcance', 'ninguno')
    expect(document.getElementById('r-R')).toHaveTextContent('Sin dato')
  })

  it('redistribuye el peso real del río y respeta la ventana de lluvia elegida', () => {
    render(<MetodologiaMapa />)
    const lluvia = document.getElementById('r-ll-on') as HTMLInputElement
    fireEvent.click(lluvia)
    cambiar('r-estado', 'alerta')
    const pesoCelda = (PESOS_AMENAZA.peligroCelda / (PESOS_AMENAZA.peligroCelda + PESOS_AMENAZA.rioPrefectura) * 100).toLocaleString('es-AR', { maximumFractionDigits: 2 })
    expect(document.getElementById('r-weights')).toHaveTextContent(`${pesoCelda} %`)
    cambiar('r-estado', 'no_aplica')
    fireEvent.click(document.getElementById('r-pc-on')!)
    fireEvent.click(lluvia)
    cambiar('r-ll', '80')
    cambiar('r-horizonte', '24')
    expect(document.getElementById('r-A')).toHaveTextContent('66,00')
    cambiar('r-horizonte', '72')
    expect(document.getElementById('r-A')).toHaveTextContent('33,00')
    cambiar('r-horizonte', '240')
    expect(document.getElementById('r-A')).toHaveTextContent('33,00')
  })

  it.each([0, 1, 2, 3] as const)('el simulador de acceso coincide con la regla separada para aislamiento %i', (nivel) => {
    render(<MetodologiaMapa />)
      for (const alternativa of [true, false, null]) {
        for (let mascara = 0; mascara < 8; mascara++) {
          const cruce = Boolean(mascara & 1)
          const peligro = Boolean(mascara & 2)
          const historial = Boolean(mascara & 4)
          cambiar('c-n', String(nivel))
          cambiar('c-al', alternativa === null ? 'nd' : alternativa ? 'si' : 'no')
          for (const [id, valor] of [['c-cr', cruce], ['c-pa', peligro], ['c-hi', historial]] as const) {
            if ((document.getElementById(id) as HTMLInputElement).checked !== valor) fireEvent.click(document.getElementById(id)!)
          }
          const esperado = calcularRiesgoAcceso({
            indice: { cueAnexo: 'ejemplo', nivel, crucesAguaCount: cruce ? 1 : 0, crucesAguaConPuenteCount: 0, crucesAguaConVadoCount: cruce ? 1 : 0, tieneAlternativaSinCruce: alternativa, versionJob: 'ejemplo', fechaExtractoOsm: '', licencia: 'ODbL' },
            nivelPeligroCelda: peligro ? 'naranja' : 'verde', nivelPeligroCaudal: null, accesoInterrumpidoCantidad: historial ? 1 : 0,
          })
          expect(document.getElementById('c-s')?.textContent).toBe(String(esperado.score))
          expect(document.getElementById('c-b')?.textContent?.toLowerCase()).toBe(esperado.nivel)
        }
      }
    cambiar('c-n', 'sin_dato')
    expect(document.getElementById('c-s')).toHaveTextContent('Sin dato')
    expect(document.getElementById('c-b')).toHaveTextContent('Desconocido')
  })

  it('el simulador de peligro importa los umbrales y mantiene el borde estricto', () => {
    render(<MetodologiaMapa />)
    for (const [horizonte, u] of Object.entries(UMBRALES_PROVISORIOS_MM)) {
      cambiar('ll-h', horizonte)
      cambiar('ll-mm', String(u.rojo))
      expect(document.getElementById('ll-b')).toHaveTextContent('Naranja')
      cambiar('ll-mm', String(u.rojo + 1))
      expect(document.getElementById('ll-b')).toHaveTextContent('Rojo')
    }
  })

  it('keeps the deep-link targets used by the school panel', () => {
    render(<MetodologiaMapa />)

    for (const id of ['inundacion-clases-rio', 'inundacion-ruta-acceso', 'inundacion-junto-laguna']) {
      expect(document.getElementById(id)).not.toBeNull()
    }
  })

  it('links in-page navigation through the methodology tab hash', () => {
    render(<MetodologiaMapa />)

    for (const enlace of document.querySelectorAll('.toc a')) {
      expect(enlace.getAttribute('href')).toMatch(/^#metodologia\//)
    }
  })

  it('warns the principal when most students are marked', () => {
    render(<MetodologiaMapa />)

    cambiar('rd-m', '200')
    cambiar('rd-k', '90')
    expect(document.getElementById('rd-b')?.textContent).toBe('Sin aviso')

    cambiar('rd-k', '101')
    expect(document.getElementById('rd-b')?.textContent).toBe('Aviso')
  })

  it('classifies access risk in three levels', () => {
    render(<MetodologiaMapa />)

    const nivel = document.getElementById('c-n') as HTMLSelectElement
    fireEvent.change(nivel, { target: { value: '3' } })
    expect(document.getElementById('c-s')?.textContent).toBe('100')
    expect(document.getElementById('c-b')?.textContent).toBe('Alto')
  })

  it('does not publish the satellite accumulation below 80 % coverage', () => {
    render(<MetodologiaMapa />)

    expect(document.getElementById('cob-p')?.textContent).toBe('100 %')
    const barras = document.querySelectorAll('#cob-svg rect')
    for (let i = 0; i < 10; i++) fireEvent.click(barras[i])
    expect(document.getElementById('cob-mm')?.textContent).toBe('sin dato')
  })
})
