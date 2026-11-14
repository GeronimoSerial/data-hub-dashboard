import type { Semaforo } from '@/lib/sobreoferta'
import { es } from '@/lib/i18n/diccionarios/es'
import type { Diccionario } from '@/lib/i18n/diccionarios/tipos'

// Map microcopy. These exports stay Spanish (Corrientes) and read from the
// `es` dictionary. Components that must follow the user's language read the
// texts from the provider instead:
//
//   const t = useTextos()        // lib/i18n/idioma-provider.tsx
//   t.didactica.legend.evolutionTitle
//
// Helpers take an optional dictionary as their last argument (default es), so
// a component can pass `useTextos()` to get the pt sentences.
export const COPY = es.didactica

export function semaforoGlosa(key: Semaforo, t: Diccionario = es): string {
  return t.didactica.semaforoGlosa[key]
}

/** "bajó 34,1%" / "subió 5,0%" / "sin cambio" */
export function formatCambioPct(
  frac: number | null | undefined,
  t: Diccionario = es,
): string {
  if (frac == null || Number.isNaN(frac)) return '—'
  const pct = frac * 100
  const abs = Math.abs(pct).toFixed(1).replace('.', ',')
  if (Math.abs(pct) < 0.05) return t.didacticaTextos.cambio.sinCambio
  return pct < 0
    ? t.didacticaTextos.cambio.bajo(abs)
    : t.didacticaTextos.cambio.subio(abs)
}

/**
 * Párrafo ejecutivo de demanda futura (+4 hacia sala de 4).
 * Una sola lectura: dato → desfase → expectativa de matrícula.
 * `emphasis` = conclusión en MAYÚSCULAS (cualquier decisión, no solo la negativa).
 */
export function demandaFuturaTexto(
  opts: {
    variacion: number | null | undefined
    mediana: number
    enCaida: boolean
  },
  t: Diccionario = es,
): { dato: string; lead: string; emphasis: string } {
  const textos = t.didacticaTextos.demandaFutura
  const cambio = formatCambioPct(opts.variacion, t)
  const med = formatCambioPct(opts.mediana, t)
  const dato = textos.dato(cambio, med)

  if (opts.variacion == null) {
    return { dato, lead: '', emphasis: textos.sinDato }
  }

  if (opts.enCaida) {
    return { dato, lead: textos.enCaida.lead, emphasis: textos.enCaida.emphasis }
  }

  if (opts.variacion < 0) {
    return {
      dato,
      lead: textos.menorModerada.lead,
      emphasis: textos.menorModerada.emphasis,
    }
  }

  return {
    dato,
    lead: textos.sinContraccion.lead,
    emphasis: textos.sinContraccion.emphasis,
  }
}

export function demandaActualTexto(
  opts: {
    alumnos: number | null | undefined
    mediana: number
    bajoDemanda: boolean
  },
  t: Diccionario = es,
): { dato: string; lectura: string } {
  const textos = t.didacticaTextos.demandaActual
  const alumnos =
    opts.alumnos == null ? '—' : opts.alumnos.toFixed(1).replace('.', ',')
  const med = opts.mediana.toFixed(1).replace('.', ',')
  const dato = textos.dato(alumnos, med)

  if (opts.alumnos == null) {
    return { dato, lectura: textos.sinDato }
  }

  return {
    dato,
    lectura: opts.bajoDemanda ? textos.bajoDemanda : textos.noBajoDemanda,
  }
}
