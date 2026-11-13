// Textos de error del envío diferido en portugués: el error de almacén ocupado
// y el motivo de tiempo agotado se traducen en la capa de presentación; el
// mensaje español (y el dato persistido) no cambian.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { es } from '@/lib/i18n/diccionarios/es'
import { pt } from '@/lib/i18n/diccionarios/pt'
import {
  AlmacenOcupadoError,
  MENSAJE_TIEMPO_AGOTADO,
  TIEMPO_MAXIMO_BLOQUEO_MS,
  intentarEnviar,
  mensajeErrorAlmacen,
  traducirMotivoEnvio,
  type AlmacenClaveValor,
  type EnviarOpciones,
} from './envio-offline'

const MENSAJE_ALMACEN_OCUPADO_ES = 'El almacenamiento local está ocupado. Intente guardar de nuevo.'

afterEach(() => {
  vi.useRealTimers()
})

describe('AlmacenOcupadoError', () => {
  it('conserva el mensaje español byte a byte y expone un código estable', () => {
    const error = new AlmacenOcupadoError()
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe(MENSAJE_ALMACEN_OCUPADO_ES)
    expect(error.codigo).toBe('almacen-ocupado')
    expect(error.name).toBe('AlmacenOcupadoError')
  })

  it('el tiempo de espera del bloqueo rechaza con AlmacenOcupadoError', async () => {
    vi.useFakeTimers()
    const almacen: AlmacenClaveValor = {
      obtener: () => new Promise<string | null>(() => {}),
      guardar: async () => {},
      eliminar: async () => {},
    }
    const opciones: EnviarOpciones<object> = {
      almacen,
      tipo: 'reporte-inicial',
      cue: '1234',
      fetchImpl: vi.fn(),
      url: '/api/problematicas/parte',
      construirCuerpo: () => ({}),
    }
    // Primera llamada: sostiene el bloqueo de la clave sin terminar nunca.
    void intentarEnviar({}, opciones).catch(() => undefined)
    const segunda = intentarEnviar({}, opciones)
    const rechazo = expect(segunda).rejects.toBeInstanceOf(AlmacenOcupadoError)
    await vi.advanceTimersByTimeAsync(TIEMPO_MAXIMO_BLOQUEO_MS)
    await rechazo
  })
})

describe('mensajeErrorAlmacen', () => {
  it('muestra el texto del idioma activo para el error de almacén ocupado', () => {
    const error = new AlmacenOcupadoError()
    expect(mensajeErrorAlmacen(error, 'respaldo', pt)).toBe(
      'O armazenamento local está ocupado. Tente salvar de novo.',
    )
  })

  it('en español devuelve el mensaje original', () => {
    expect(mensajeErrorAlmacen(new AlmacenOcupadoError(), 'respaldo', es)).toBe(MENSAJE_ALMACEN_OCUPADO_ES)
    expect(mensajeErrorAlmacen(new AlmacenOcupadoError())).toBe(MENSAJE_ALMACEN_OCUPADO_ES)
  })

  it('otros errores conservan su mensaje y un valor que no es error usa el respaldo', () => {
    expect(mensajeErrorAlmacen(new Error('IndexedDB no disponible'), 'respaldo', pt)).toBe('IndexedDB no disponible')
    expect(mensajeErrorAlmacen('algo', 'respaldo', pt)).toBe('respaldo')
  })
})

describe('traducirMotivoEnvio', () => {
  it('traduce el motivo de tiempo agotado al portugués', () => {
    expect(traducirMotivoEnvio(MENSAJE_TIEMPO_AGOTADO, pt)).toBe(
      'O servidor não respondeu. Tentaremos de novo sozinhos; seu parte fica salvo.',
    )
  })

  it('en español y para otros motivos devuelve el texto tal cual', () => {
    expect(MENSAJE_TIEMPO_AGOTADO).toBe('El servidor no respondió. Reintentamos solos; su parte queda guardado.')
    expect(traducirMotivoEnvio(MENSAJE_TIEMPO_AGOTADO, es)).toBe(MENSAJE_TIEMPO_AGOTADO)
    expect(traducirMotivoEnvio('Falta el campo fecha', pt)).toBe('Falta el campo fecha')
  })
})
