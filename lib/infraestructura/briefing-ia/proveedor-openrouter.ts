// Cliente HTTP puro contra OpenRouter (API compatible con OpenAI Chat
// Completions). No usa SDK para evitar dependencias nuevas y para poder
// inyectar fetchImpl en los tests sin tocar la red real.
//
// El costo real lo expone OpenRouter en usage.cost cuando el body envía
// usage.include=true. Si no viene, se recalcula con la tarifa fija verificada
// del modelo deepseek-v4.1-flash para no dejar el costo en null.

export interface MensajeChat {
  role: 'system' | 'user'
  content: string
}

export interface ResultadoProveedorIA {
  ok: boolean
  contenido: string | null
  tokensEntrada: number | null
  tokensSalida: number | null
  costoUsd: number | null
  latenciaMs: number
  motivoFallo: 'sin_api_key' | 'timeout' | 'http_error' | null
}

export interface OpcionesProveedorIA {
  apiKey?: string
  modelo?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

const URL_OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions'
const MODELO_POR_DEFECTO = 'deepseek/deepseek-v4.1-flash'
const TIMEOUT_MS_POR_DEFECTO = 15000

const COSTO_POR_MILLON_ENTRADA_USD = 0.035
const COSTO_POR_MILLON_SALIDA_USD = 0.29

type MotivoFallo = ResultadoProveedorIA['motivoFallo']

interface LecturaRespuesta {
  contenido: string
  tokensEntrada: number | null
  tokensSalida: number | null
  costo: number | null
}

function fallo(motivo: Exclude<MotivoFallo, null>, latenciaMs: number): ResultadoProveedorIA {
  return {
    ok: false,
    contenido: null,
    tokensEntrada: null,
    tokensSalida: null,
    costoUsd: null,
    latenciaMs,
    motivoFallo: motivo,
  }
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null
}

function esLista(valor: unknown): valor is unknown[] {
  return Array.isArray(valor)
}

function leerNumero(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null
}

function calcularCosto(tokensEntrada: number | null, tokensSalida: number | null): number | null {
  if (tokensEntrada === null || tokensSalida === null) {
    return null
  }
  return (
    (tokensEntrada / 1_000_000) * COSTO_POR_MILLON_ENTRADA_USD +
    (tokensSalida / 1_000_000) * COSTO_POR_MILLON_SALIDA_USD
  )
}

// Estimación de respaldo (no un conteo real) cuando OpenRouter no devuelve
// tokens en usage: 4 caracteres por token es una aproximación razonable para
// que el costo nunca quede en null y el presupuesto pueda agotarse.
function estimarTokensDesdeTexto(texto: string): number {
  return Math.ceil(texto.length / 4)
}

function leerRespuestaExito(
  datos: unknown,
  mensajes: MensajeChat[],
): LecturaRespuesta | null {
  if (!esObjeto(datos)) {
    return null
  }

  const choices = datos.choices
  if (!esLista(choices) || choices.length === 0) {
    return null
  }

  const primera = choices[0]
  if (!esObjeto(primera)) {
    return null
  }

  const mensaje = primera.message
  if (!esObjeto(mensaje) || typeof mensaje.content !== 'string') {
    return null
  }

  const usage = esObjeto(datos.usage) ? datos.usage : null
  const tokensEntrada = usage === null ? null : leerNumero(usage.prompt_tokens)
  const tokensSalida = usage === null ? null : leerNumero(usage.completion_tokens)
  const costoExpuesto = usage === null ? null : leerNumero(usage.cost)

  if (costoExpuesto === null && (tokensEntrada === null || tokensSalida === null)) {
    // Estimación de respaldo: 'estimarTokensDesdeTexto' siempre devuelve un
    // número (nunca null), así que 'calcularCosto' con estos dos argumentos
    // nunca devuelve null. No existe un caso real de "no hay forma de
    // estimar": por eso no hay un piso de costo máximo configurable acá (ver
    // docs/ejecucion-enos/E8/registro.md, corrección del gate N1).
    const tokensEntradaEstimados =
      tokensEntrada ?? estimarTokensDesdeTexto(mensajes.map((m) => m.content).join('\n'))
    const tokensSalidaEstimados = tokensSalida ?? estimarTokensDesdeTexto(mensaje.content)

    return {
      contenido: mensaje.content,
      tokensEntrada: tokensEntrada ?? tokensEntradaEstimados,
      tokensSalida: tokensSalida ?? tokensSalidaEstimados,
      costo: costoExpuesto ?? calcularCosto(tokensEntradaEstimados, tokensSalidaEstimados),
    }
  }

  return {
    contenido: mensaje.content,
    tokensEntrada,
    tokensSalida,
    costo: costoExpuesto ?? calcularCosto(tokensEntrada, tokensSalida),
  }
}

export async function generarConOpenRouter(
  mensajes: MensajeChat[],
  opciones: OpcionesProveedorIA = {},
): Promise<ResultadoProveedorIA> {
  const apiKey = opciones.apiKey ?? process.env.OPENROUTER_API_KEY
  const modelo = opciones.modelo ?? process.env.OPENROUTER_MODEL ?? MODELO_POR_DEFECTO
  const timeoutMs = opciones.timeoutMs ?? TIMEOUT_MS_POR_DEFECTO
  const fetchImpl = opciones.fetchImpl ?? fetch

  if (apiKey === undefined || apiKey === '') {
    return fallo('sin_api_key', 0)
  }

  const inicio = Date.now()
  const controlador = new AbortController()
  const temporizador = setTimeout(() => controlador.abort(), timeoutMs)

  try {
    const respuesta = await fetchImpl(URL_OPENROUTER, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelo,
        messages: mensajes,
        usage: { include: true },
      }),
      signal: controlador.signal,
    })

    if (!respuesta.ok) {
      return fallo('http_error', Date.now() - inicio)
    }

    const datos: unknown = await respuesta.json()
    const lectura = leerRespuestaExito(datos, mensajes)

    if (lectura === null) {
      return fallo('http_error', Date.now() - inicio)
    }

    return {
      ok: true,
      contenido: lectura.contenido,
      tokensEntrada: lectura.tokensEntrada,
      tokensSalida: lectura.tokensSalida,
      costoUsd: lectura.costo,
      latenciaMs: Date.now() - inicio,
      motivoFallo: null,
    }
  } catch {
    // El abort del timeout se distingue del resto de fallos de red por el
    // estado de la señal, que el controlador marca de forma sincrónica.
    const motivo: Exclude<MotivoFallo, null> = controlador.signal.aborted ? 'timeout' : 'http_error'
    return fallo(motivo, Date.now() - inicio)
  } finally {
    clearTimeout(temporizador)
  }
}
