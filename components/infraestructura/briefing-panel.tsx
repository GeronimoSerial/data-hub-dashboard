// Panel de presentación del briefing narrativo asistido por IA (E8). Es
// reutilizable y no se monta solo: debe montarse junto al resumen ejecutivo
// detrás del flag aiBriefingEnabled() de lib/infraestructura/riesgo/flags.ts,
// con el padre haciendo fetch a la API de briefings y pasando el resultado
// como prop 'briefing'. Nunca se monta en la UI de Centro de Situación de E5
// (ruta propia).
import type { JSX } from 'react'

export interface BriefingPanelProps {
  briefing: {
    textoFinal: string
    fuente: 'ia' | 'plantilla'
    salidaIa: Record<string, unknown> | null
    creadaEn: string
  } | null
}

interface FraseBriefing {
  texto: string
  refs: string[]
}

function leerFrases(salidaIa: Record<string, unknown> | null): FraseBriefing[] | null {
  if (salidaIa === null) return null
  const frases = salidaIa['frases']
  if (!Array.isArray(frases)) return null

  return frases.map((frase): FraseBriefing => {
    if (typeof frase !== 'object' || frase === null) return { texto: '', refs: [] }
    const registro = frase as Record<string, unknown>
    const texto = typeof registro['texto'] === 'string' ? registro['texto'] : ''
    const refsCrudo = registro['refs']
    const refs =
      Array.isArray(refsCrudo) && refsCrudo.every((ref) => typeof ref === 'string')
        ? refsCrudo
        : []
    return { texto, refs }
  })
}

function formatearHoraUtc(iso: string): string {
  const fecha = new Date(iso)
  const horas = String(fecha.getUTCHours()).padStart(2, '0')
  const minutos = String(fecha.getUTCMinutes()).padStart(2, '0')
  return `${horas}:${minutos}`
}

export function BriefingPanel({ briefing }: BriefingPanelProps): JSX.Element | null {
  if (briefing === null) return null

  if (briefing.fuente === 'plantilla') {
    const lineas = briefing.textoFinal.split('\n')
    return (
      <section aria-label="Resumen del briefing asistido" className="briefing-panel">
        <ul>
          {lineas.map((linea, i) => (
            <li key={i}>{linea}</li>
          ))}
        </ul>
        <p>Resumen automático por reglas.</p>
      </section>
    )
  }

  // fuente 'ia': la salida sólo tiene la forma esperada si pasó la validación
  // de trazabilidad del orquestador, pero se lee defensivamente igual (nunca
  // se confía en datos persistidos como si su forma estuviera garantizada).
  const frases = leerFrases(briefing.salidaIa)

  return (
    <section aria-label="Resumen del briefing asistido" className="briefing-panel">
      <ul>
        {frases !== null ? (
          frases.map((frase, i) => (
            <li key={i}>
              {frase.texto}
              {frase.refs.length > 0 && (
                <span className="briefing-panel-refs"> ({frase.refs.join(', ')})</span>
              )}
            </li>
          ))
        ) : (
          <li>{briefing.textoFinal}</li>
        )}
      </ul>
      <p>Generado por IA a partir del corte de las {formatearHoraUtc(briefing.creadaEn)}.</p>
    </section>
  )
}
