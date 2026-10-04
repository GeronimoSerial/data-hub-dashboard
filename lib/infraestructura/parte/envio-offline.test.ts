// @vitest-environment jsdom
// Pruebas del envío diferido de partes: persistencia del borrador, política
// de reintentos e idempotencia. Ninguna prueba toca la red real: el fetch se
// inyecta con vi.fn() y el almacén es el de memoria.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  borrarBorrador,
  calcularEsperaReintento,
  claveBorrador,
  clasificarRespuesta,
  crearAlmacenMemoria,
  esEstadoReintentable,
  guardarBorrador,
  intentarEnviar,
  leerBorrador,
  MENSAJES_ESTADO,
  programarReintento,
  registrarAutoReintento,
  reenviarCola,
  type BorradorParte,
  type EnviarOpciones,
} from './envio-offline'

function crearBorrador(overrides: Partial<BorradorParte<{ observacion: string }>> = {}) {
  return {
    tipo: 'problematica',
    cue: 'cue-1',
    idempotencyKey: 'clave-idempotencia',
    datos: { observacion: 'Texto' },
    estado: 'guardado-local' as const,
    intentos: 0,
    actualizadoEn: '2026-09-26T10:00:00.000Z',
    ...overrides,
  }
}

function respuesta(ok: boolean, status: number, cuerpo: unknown): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(cuerpo),
  } as unknown as Response
}

describe('persistencia del borrador', () => {
  it('hace roundtrip al guardar y leer', async () => {
    const almacen = crearAlmacenMemoria()
    const borrador = crearBorrador()
    await guardarBorrador(almacen, borrador)
    expect(await leerBorrador<{ observacion: string }>(almacen, 'problematica', 'cue-1')).toEqual(
      borrador,
    )
  })

  it('devuelve null cuando la clave no existe', async () => {
    const almacen = crearAlmacenMemoria()
    expect(await leerBorrador(almacen, 'problematica', 'inexistente')).toBeNull()
  })

  it('elimina el borrador al borrarlo', async () => {
    const almacen = crearAlmacenMemoria()
    await guardarBorrador(almacen, crearBorrador())
    await borrarBorrador(almacen, 'problematica', 'cue-1')
    expect(await leerBorrador(almacen, 'problematica', 'cue-1')).toBeNull()
  })

  it('devuelve null si el JSON guardado es inválido, sin lanzar', async () => {
    const almacen = crearAlmacenMemoria()
    await almacen.guardar(claveBorrador('problematica', 'cue-1'), '{esto no es json')
    expect(await leerBorrador(almacen, 'problematica', 'cue-1')).toBeNull()
  })
})

describe('clasificación de respuestas', () => {
  it.each([
    ['red', 'reintentable'],
    [500, 'reintentable'],
    [599, 'reintentable'],
    [401, 'sesion-vencida'],
    [403, 'sesion-vencida'],
    [410, 'sesion-vencida'],
    [400, 'no-reintentable'],
    [422, 'no-reintentable'],
  ] as const)('clasifica %s como %s', (status, esperado) => {
    expect(clasificarRespuesta(status)).toBe(esperado)
  })
})

describe('espera de reintento', () => {
  it('crece con los intentos y nunca supera los 30000 ms', () => {
    expect(calcularEsperaReintento(0)).toBe(1000)
    expect(calcularEsperaReintento(1)).toBe(2000)
    expect(calcularEsperaReintento(2)).toBe(4000)
    let anterior = 0
    for (let intentos = 0; intentos <= 12; intentos += 1) {
      const espera = calcularEsperaReintento(intentos)
      expect(espera).toBeGreaterThanOrEqual(anterior)
      expect(espera).toBeLessThanOrEqual(30000)
      anterior = espera
    }
    expect(calcularEsperaReintento(10)).toBe(30000)
  })
})

describe('intentarEnviar', () => {
  function opciones(
    almacen: ReturnType<typeof crearAlmacenMemoria>,
    fetchImpl: EnviarOpciones<{ observacion: string }>['fetchImpl'],
  ): EnviarOpciones<{ observacion: string }> {
    return {
      almacen,
      tipo: 'problematica',
      cue: 'cue-1',
      fetchImpl,
      url: '/api/problematicas/parte',
      construirCuerpo: (datos, idempotencyKey) => ({ idempotencyKey, ...datos }),
    }
  }

  it('borra el borrador al enviar con éxito', async () => {
    const almacen = crearAlmacenMemoria()
    await guardarBorrador(almacen, crearBorrador())
    const fetchImpl = vi.fn().mockResolvedValue(respuesta(true, 200, { id: 'parte-9' }))

    const resultado = await intentarEnviar({ observacion: 'Texto' }, opciones(almacen, fetchImpl))

    expect(resultado).toEqual({ ok: true, respuesta: { id: 'parte-9' } })
    expect(await leerBorrador(almacen, 'problematica', 'cue-1')).toBeNull()
  })

  it('deja el borrador pendiente cuando falla la red', async () => {
    const almacen = crearAlmacenMemoria()
    await guardarBorrador(almacen, crearBorrador())
    const fetchImpl = vi.fn().mockRejectedValue(new Error('sin conexión'))

    const resultado = await intentarEnviar({ observacion: 'Texto' }, opciones(almacen, fetchImpl))

    expect(resultado).toEqual({ ok: false, estado: 'pendiente-envio' })
    const borrador = await leerBorrador<{ observacion: string }>(almacen, 'problematica', 'cue-1')
    expect(borrador?.estado).toBe('pendiente-envio')
    expect(borrador?.intentos).toBe(1)
  })

  it('reutiliza la idempotencyKey y acumula intentos entre reintentos', async () => {
    const almacen = crearAlmacenMemoria()
    const fetchImpl = vi.fn().mockRejectedValue(new Error('sin conexión'))
    const config = opciones(almacen, fetchImpl)

    await intentarEnviar({ observacion: 'Texto' }, config)
    await intentarEnviar({ observacion: 'Texto' }, config)
    await intentarEnviar({ observacion: 'Texto' }, config)

    const claves = fetchImpl.mock.calls.map((llamada) => {
      const init = llamada[1] as RequestInit
      return (JSON.parse(init.body as string) as { idempotencyKey: string }).idempotencyKey
    })
    expect(claves).toHaveLength(3)
    expect(claves[0]).toBe(claves[1])
    expect(claves[1]).toBe(claves[2])

    const borrador = await leerBorrador<{ observacion: string }>(almacen, 'problematica', 'cue-1')
    expect(borrador?.intentos).toBe(3)
  })

  it('marca error no reintentable y conserva el borrador (422)', async () => {
    const almacen = crearAlmacenMemoria()
    await guardarBorrador(almacen, crearBorrador())
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(respuesta(false, 422, { error: 'dato inválido' }))

    const resultado = await intentarEnviar({ observacion: 'Texto' }, opciones(almacen, fetchImpl))

    expect(resultado).toEqual({ ok: false, estado: 'error', motivo: 'dato inválido' })
    const borrador = await leerBorrador<{ observacion: string }>(almacen, 'problematica', 'cue-1')
    expect(borrador).not.toBeNull()
    expect(borrador?.estado).toBe('error')
  })

  it('marca sesión vencida con 401 y conserva el borrador', async () => {
    const almacen = crearAlmacenMemoria()
    const fetchImpl = vi.fn().mockResolvedValue(respuesta(false, 401, {}))

    const resultado = await intentarEnviar({ observacion: 'Texto' }, opciones(almacen, fetchImpl))

    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.estado).toBe('error')
      expect(resultado.motivo).toMatch(/sesi[oó]n/i)
    }
    expect(await leerBorrador(almacen, 'problematica', 'cue-1')).not.toBeNull()
  })

  // Hallazgo de revisión #2 (gate N1): un 2xx con un cuerpo que no cumple el
  // contrato esperado no puede vaciar la cola ni acuñar una idempotencyKey
  // nueva para el próximo intento.
  describe('validarExito (hallazgo #2: 2xx con cuerpo inesperado)', () => {
    function opcionesConValidacion(
      almacen: ReturnType<typeof crearAlmacenMemoria>,
      fetchImpl: EnviarOpciones<{ observacion: string }>['fetchImpl'],
    ): EnviarOpciones<{ observacion: string }> {
      return {
        ...opciones(almacen, fetchImpl),
        validarExito: (respuesta) => {
          const cuerpo = respuesta as { ok?: boolean; movimientoId?: string } | null
          return !!cuerpo && cuerpo.ok === true && typeof cuerpo.movimientoId === 'string'
        },
      }
    }

    it('un 2xx con cuerpo inesperado NO vacía la cola ni cambia la idempotencyKey', async () => {
      const almacen = crearAlmacenMemoria()
      // Cuerpo 2xx sin `movimientoId`: no cumple el contrato esperado.
      const fetchImpl = vi.fn().mockResolvedValue(respuesta(true, 200, { algo: 'inesperado' }))

      const resultado = await intentarEnviar(
        { observacion: 'Texto' },
        opcionesConValidacion(almacen, fetchImpl),
      )

      expect(resultado).toEqual({
        ok: false,
        estado: 'error',
        motivo: 'respuesta inesperada del servidor',
      })
      const borrador = await leerBorrador<{ observacion: string }>(almacen, 'problematica', 'cue-1')
      expect(borrador).not.toBeNull()
      expect(borrador?.estado).toBe('error')
      expect(borrador?.motivoError).toBe('respuesta inesperada del servidor')

      // Un reintento posterior reutiliza la MISMA idempotencyKey: no se
      // acuñó una nueva por el cuerpo inesperado.
      const claveOriginal = borrador?.idempotencyKey
      fetchImpl.mockResolvedValue(respuesta(true, 200, { ok: true, movimientoId: 'mov-1' }))
      await intentarEnviar({ observacion: 'Texto' }, opcionesConValidacion(almacen, fetchImpl))
      const [, initSegundo] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit]
      const cuerpoSegundo = JSON.parse(initSegundo.body as string) as { idempotencyKey: string }
      expect(cuerpoSegundo.idempotencyKey).toBe(claveOriginal)
    })

    it('un 2xx con cuerpo válido sí vacía la cola (comportamiento normal)', async () => {
      const almacen = crearAlmacenMemoria()
      const fetchImpl = vi.fn().mockResolvedValue(respuesta(true, 200, { ok: true, movimientoId: 'mov-1' }))

      const resultado = await intentarEnviar(
        { observacion: 'Texto' },
        opcionesConValidacion(almacen, fetchImpl),
      )

      expect(resultado).toEqual({ ok: true, respuesta: { ok: true, movimientoId: 'mov-1' } })
      expect(await leerBorrador(almacen, 'problematica', 'cue-1')).toBeNull()
    })
  })

  // Hallazgo de revisión #1a (gate N1, MAJOR): dos pestañas del mismo
  // dispositivo (o dos llamados concurrentes que comparten almacén, como acá)
  // que intentan enviar el mismo tipo+cue antes de que cualquiera persista la
  // cola no pueden acuñar cada una su propia idempotencyKey.
  describe('concurrencia entre "pestañas" que comparten almacén (hallazgo #1a)', () => {
    it('dos intentos concurrentes para la misma clave usan una única idempotencyKey', async () => {
      const almacen = crearAlmacenMemoria()
      const fetchImpl = vi.fn().mockResolvedValue(respuesta(true, 200, { ok: true, movimientoId: 'mov-1' }))
      const config = opciones(almacen, fetchImpl)

      const [resultadoA, resultadoB] = await Promise.all([
        intentarEnviar({ observacion: 'Texto' }, config),
        intentarEnviar({ observacion: 'Texto' }, config),
      ])

      const clavesUsadas = new Set(
        fetchImpl.mock.calls.map((llamada) => {
          const init = llamada[1] as RequestInit
          return (JSON.parse(init.body as string) as { idempotencyKey: string }).idempotencyKey
        }),
      )
      // Antes de este hallazgo, cada "pestaña" leía "no hay borrador" y
      // acuñaba su PROPIA clave: el servidor no podía deduplicar dos partes
      // distintos. Ahora nunca hay más de UNA clave en vuelo para el mismo
      // tipo+cue, así que el servidor (probado aparte, ver
      // app/api/problematicas/parte/route.test.ts) siempre puede deduplicar.
      expect(clavesUsadas.size).toBe(1)
      expect(resultadoA).toEqual({ ok: true, respuesta: { ok: true, movimientoId: 'mov-1' } })
      expect(resultadoB).toEqual(resultadoA)
    })

    it('si la segunda llega mientras la primera todavía está en vuelo, se engancha a la misma respuesta sin repetir el POST', async () => {
      const almacen = crearAlmacenMemoria()
      // Definite-assignment: se asigna de verdad antes de usarse (el
      // executor de la Promise corre en forma síncrona al construirla).
      let resolverFetch!: (respuesta: Response) => void
      const fetchImpl = vi.fn(
        () =>
          new Promise<Response>((resolver) => {
            resolverFetch = resolver
          }),
      )
      const config = opciones(almacen, fetchImpl)

      const promesaA = intentarEnviar({ observacion: 'Texto' }, config)
      // Deja que A recorra el paso de "decidir" y llegue a esperar el fetch.
      await new Promise((r) => setTimeout(r, 0))
      expect(fetchImpl).toHaveBeenCalledTimes(1)

      const promesaB = intentarEnviar({ observacion: 'Texto' }, config)
      await new Promise((r) => setTimeout(r, 0))

      resolverFetch(respuesta(true, 200, { ok: true, movimientoId: 'mov-1' }))

      const [resultadoA, resultadoB] = await Promise.all([promesaA, promesaB])

      expect(fetchImpl).toHaveBeenCalledTimes(1) // B se enganchó, no volvió a pegarle a la red
      expect(resultadoA).toEqual({ ok: true, respuesta: { ok: true, movimientoId: 'mov-1' } })
      expect(resultadoB).toEqual(resultadoA)
    })

    it('con Web Locks API disponible (navigator.locks simulado) también reutiliza una única clave', async () => {
      // jsdom no implementa navigator.locks: se simula acá con una cola por
      // nombre equivalente a la real (serializa, no cachea) para probar que
      // intentarEnviar toma el camino de la Web Locks API real cuando existe,
      // no sólo el fallback en memoria que ejercitan el resto de los tests.
      class GestorBloqueosFalso {
        private colas = new Map<string, Promise<unknown>>()
        request<T>(nombre: string, tarea: () => Promise<T> | T): Promise<T> {
          const anterior = this.colas.get(nombre) ?? Promise.resolve()
          const siguiente: Promise<T> = anterior.then(() => tarea())
          this.colas.set(
            nombre,
            siguiente.then(
              () => undefined,
              () => undefined,
            ),
          )
          return siguiente
        }
      }

      const original = (navigator as Partial<Navigator>).locks
      Object.defineProperty(navigator, 'locks', {
        value: new GestorBloqueosFalso(),
        configurable: true,
      })
      try {
        const almacen = crearAlmacenMemoria()
        const fetchImpl = vi.fn().mockResolvedValue(respuesta(true, 200, { ok: true, movimientoId: 'mov-1' }))
        const config = opciones(almacen, fetchImpl)

        const [resultadoA, resultadoB] = await Promise.all([
          intentarEnviar({ observacion: 'Texto' }, config),
          intentarEnviar({ observacion: 'Texto' }, config),
        ])

        const clavesUsadas = new Set(
          fetchImpl.mock.calls.map((llamada) => {
            const init = llamada[1] as RequestInit
            return (JSON.parse(init.body as string) as { idempotencyKey: string }).idempotencyKey
          }),
        )
        expect(clavesUsadas.size).toBe(1)
        expect(resultadoA).toEqual({ ok: true, respuesta: { ok: true, movimientoId: 'mov-1' } })
        expect(resultadoB).toEqual(resultadoA)
      } finally {
        if (original === undefined) {
          Reflect.deleteProperty(navigator, 'locks')
        } else {
          Object.defineProperty(navigator, 'locks', { value: original, configurable: true })
        }
      }
    })

    it('corre sobre el fallback en memoria (jsdom no implementa navigator.locks)', () => {
      // Documenta explícitamente que los dos tests de arriba (y todos los de
      // este archivo) ejercitan el camino de FALLBACK descripto en
      // envio-offline.ts, no la Web Locks API real: jsdom no la implementa.
      // El comportamiento con navigator.locks real (Chrome/Edge/Firefox/
      // Safari ≥15.4) es el mismo, coordinado por el navegador en vez de por
      // el mutex en memoria de este módulo.
      expect(typeof navigator === 'undefined' || !(navigator as Partial<Navigator>).locks).toBe(true)
    })
  })
})

describe('registrarAutoReintento', () => {
  it('dispara el callback online y deja de hacerlo tras la limpieza', () => {
    const callback = vi.fn()
    const limpiar = registrarAutoReintento(callback)

    window.dispatchEvent(new Event('online'))
    expect(callback).toHaveBeenCalledTimes(1)

    limpiar()
    window.dispatchEvent(new Event('online'))
    expect(callback).toHaveBeenCalledTimes(1)
  })

  // Hallazgo de revisión #4 (gate N1): calcularEsperaReintento estaba
  // declarada sin ningún call site. Ahora amortigua reintentos disparados en
  // ráfaga (conexión "flapeando").
  describe('backoff acotado ante conexión "flapeando" (hallazgo #4)', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('el primer evento dispara al toque; los siguientes en ráfaga se amortiguan y disparan una sola vez', () => {
      const callback = vi.fn()
      const limpiar = registrarAutoReintento(callback)

      window.dispatchEvent(new Event('online'))
      expect(callback).toHaveBeenCalledTimes(1)

      // Ráfaga: la conexión "flapea" con varios eventos seguidos.
      window.dispatchEvent(new Event('online'))
      window.dispatchEvent(new Event('online'))
      window.dispatchEvent(new Event('online'))
      // Ninguno de estos dispara de inmediato: se amortiguan.
      expect(callback).toHaveBeenCalledTimes(1)

      // Pasada la espera acotada (calcularEsperaReintento(0) = 1000ms), el
      // reintento amortiguado sí se dispara — nunca se pierde.
      vi.advanceTimersByTime(1000)
      expect(callback).toHaveBeenCalledTimes(2)

      limpiar()
    })

    it('la limpieza cancela un reintento amortiguado pendiente', () => {
      const callback = vi.fn()
      const limpiar = registrarAutoReintento(callback)

      window.dispatchEvent(new Event('online'))
      expect(callback).toHaveBeenCalledTimes(1)
      window.dispatchEvent(new Event('online'))
      expect(callback).toHaveBeenCalledTimes(1)

      limpiar()
      vi.advanceTimersByTime(30000)
      expect(callback).toHaveBeenCalledTimes(1)
    })
  })
})

describe('estado veraz: red vs servidor', () => {
  it('un 5xx deja el borrador en error-servidor, no en pendiente-envio', async () => {
    const almacen = crearAlmacenMemoria()
    const fetchImpl = vi.fn(async () => respuesta(false, 503, { error: 'caído' }))
    const resultado = await intentarEnviar({ observacion: 'x' }, {
      almacen, tipo: 'nuevo', cue: 'cue-1', fetchImpl, url: '/api', construirCuerpo: (d, k) => ({ ...d, k }),
    })
    expect(resultado).toEqual({ ok: false, estado: 'error-servidor' })
    expect((await leerBorrador(almacen, 'nuevo', 'cue-1'))?.estado).toBe('error-servidor')
  })

  it('una falla de red deja el borrador en pendiente-envio', async () => {
    const almacen = crearAlmacenMemoria()
    const fetchImpl = vi.fn(async () => { throw new TypeError('Failed to fetch') })
    const resultado = await intentarEnviar({ observacion: 'x' }, {
      almacen, tipo: 'nuevo', cue: 'cue-1', fetchImpl, url: '/api', construirCuerpo: (d, k) => ({ ...d, k }),
    })
    expect(resultado).toEqual({ ok: false, estado: 'pendiente-envio' })
  })

  it('los mensajes no hablan de conexión para un error del servidor', () => {
    expect(MENSAJES_ESTADO['error-servidor']).not.toMatch(/conexi/i)
    expect(MENSAJES_ESTADO['pendiente-envio']).toMatch(/sin conexión/i)
  })

  it('esEstadoReintentable sólo acepta pendiente-envio y error-servidor', () => {
    expect(esEstadoReintentable('pendiente-envio')).toBe(true)
    expect(esEstadoReintentable('error-servidor')).toBe(true)
    expect(esEstadoReintentable('error')).toBe(false)
    expect(esEstadoReintentable('enviando')).toBe(false)
    expect(esEstadoReintentable(null)).toBe(false)
  })
})

describe('reenviarCola', () => {
  it('reenvía los datos guardados en la cola con la misma idempotencyKey', async () => {
    const almacen = crearAlmacenMemoria()
    await guardarBorrador(almacen, crearBorrador({ tipo: 'nuevo', estado: 'error-servidor', idempotencyKey: 'k-1', datos: { observacion: 'de la cola' } }))
    const fetchImpl = vi.fn(async () => respuesta(true, 201, { ok: true }))
    const resultado = await reenviarCola<Record<string, unknown>>({
      almacen, tipo: 'nuevo', cue: 'cue-1', fetchImpl, url: '/api', construirCuerpo: (d, k) => ({ ...d, idempotencyKey: k }),
    })
    expect(resultado).toEqual({ ok: true, respuesta: { ok: true } })
    const cuerpo = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(cuerpo).toEqual({ observacion: 'de la cola', idempotencyKey: 'k-1' })
  })

  it('devuelve null si la cola está vacía o en un estado no reintentable', async () => {
    const almacen = crearAlmacenMemoria()
    const fetchImpl = vi.fn()
    const opciones = { almacen, tipo: 'nuevo', cue: 'cue-1', fetchImpl, url: '/api', construirCuerpo: (d: unknown) => d }
    expect(await reenviarCola(opciones)).toBeNull()
    await guardarBorrador(almacen, crearBorrador({ tipo: 'nuevo', estado: 'error' }))
    expect(await reenviarCola(opciones)).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('programarReintento', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('dispara después de la espera con backoff y se puede cancelar', () => {
    const callback = vi.fn()
    programarReintento(1, callback)
    vi.advanceTimersByTime(1999)
    expect(callback).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(callback).toHaveBeenCalledTimes(1)

    const otro = vi.fn()
    const cancelar = programarReintento(0, otro)
    cancelar()
    vi.advanceTimersByTime(60_000)
    expect(otro).not.toHaveBeenCalled()
  })

  it('nunca espera más de 30 segundos', () => {
    const callback = vi.fn()
    programarReintento(50, callback)
    vi.advanceTimersByTime(30_000)
    expect(callback).toHaveBeenCalledTimes(1)
  })
})
