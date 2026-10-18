'use client'

import { useEffect, useState, type JSX } from 'react'
import { CloudRain, Sun } from 'lucide-react'
import { cantidadLluvia } from '@/lib/infraestructura/riesgo/resumen-escuela'
import { formatearLluviaMm } from '@/lib/infraestructura/radar-meteo/formato'

// Same payload the radar's point forecast reads, trimmed to the fields shown here.
type PronosticoRadar = {
  horas: Array<{ hora: string; lluviaMm: { valor: number | null } }>
  dias: Array<{ fecha: string; lluviaMm: number | null }>
}

type Estado =
  | { fase: 'cargando'; cue: string }
  | { fase: 'error'; cue: string }
  | { fase: 'listo'; cue: string; datos: PronosticoRadar; recibidoEn: number }

const DIAS_VISIBLES = 3
const SIN_LLUVIA_MM = 1

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function etiquetaDia(fecha: string, indice: number): string {
  if (indice === 0) return 'Hoy'
  if (indice === 1) return 'Mañana'
  const dia = new Date(`${fecha}T12:00:00-03:00`).toLocaleDateString('es-AR', { weekday: 'long' })
  return capitalizar(dia)
}

function notaLluvia(mm: number | null): string {
  if (mm === null) return 'Sin datos'
  if (mm < SIN_LLUVIA_MM) return 'Sin lluvia'
  return capitalizar(cantidadLluvia(mm).replace(/^.*\((.*)\)$/, '$1'))
}

/**
 * Rain headline and three-day strip for one school, from the radar forecast
 * endpoint so the school sheet and the radar show the same numbers.
 */
export function ResumenPronosticoEscuela({ cueAnexo }: { cueAnexo: string }): JSX.Element {
  const [guardado, setEstado] = useState<Estado>({ fase: 'cargando', cue: cueAnexo })
  const estado: Estado = guardado.cue === cueAnexo ? guardado : { fase: 'cargando', cue: cueAnexo }

  useEffect(() => {
    let vigente = true
    fetch(`/api/infraestructura/radar-meteo/escuela/${encodeURIComponent(cueAnexo)}`)
      .then(async (respuesta) => {
        if (!respuesta.ok) throw new Error('no se pudo obtener el pronóstico')
        const datos = (await respuesta.json()) as PronosticoRadar
        if (vigente) setEstado({ fase: 'listo', cue: cueAnexo, datos, recibidoEn: Date.now() })
      })
      .catch(() => {
        if (vigente) setEstado({ fase: 'error', cue: cueAnexo })
      })
    return () => {
      vigente = false
    }
  }, [cueAnexo])

  if (estado.fase === 'cargando') {
    return (
      <p className="ficha-territorial__estado" role="status">
        Cargando pronóstico…
      </p>
    )
  }

  const datos = estado.fase === 'listo' ? estado.datos : null
  const ahora = estado.fase === 'listo' ? estado.recibidoEn : 0
  const proximas24 = (datos?.horas ?? []).filter((hora) => Date.parse(hora.hora) < ahora + 24 * 3600000)
  const conValor = proximas24.filter((hora) => hora.lluviaMm.valor !== null)
  const lluvia24 =
    conValor.length > 0 ? conValor.reduce((total, hora) => total + (hora.lluviaMm.valor ?? 0), 0) : null
  const llueve = lluvia24 !== null && lluvia24 >= SIN_LLUVIA_MM
  const dias = (datos?.dias ?? []).slice(0, DIAS_VISIBLES)

  return (
    <div className="ficha-territorial__resumen" data-testid="resumen-pronostico-escuela">
      <div className="ficha-territorial__titular" data-testid="ficha-territorial-titular">
        <span
          className={`ficha-territorial__titular-icono${llueve ? ' ficha-territorial__titular-icono--lluvia' : ''}`}
          aria-hidden="true"
        >
          {llueve ? <CloudRain /> : <Sun />}
        </span>
        <div>
          <p className="ficha-territorial__titular-valor">
            {lluvia24 === null ? 'Sin datos' : capitalizar(cantidadLluvia(lluvia24))}
          </p>
          <p className="ficha-territorial__titular-nota">
            {estado.fase === 'error' ? 'No se pudo cargar el pronóstico' : 'Próximas 24 horas'}
          </p>
        </div>
      </div>

      <dl className="ficha-territorial__tramos" data-testid="ficha-territorial-tramos">
        {Array.from({ length: DIAS_VISIBLES }, (_, indice) => {
          const dia = dias[indice]
          const mm = dia?.lluviaMm ?? null
          return (
            <div key={dia?.fecha ?? indice}>
              <dt>{dia ? etiquetaDia(dia.fecha, indice) : indice === 0 ? 'Hoy' : `+${(indice + 1) * 24} h`}</dt>
              <dd className="ficha-territorial__tramo-valor">
                {mm === null || mm < SIN_LLUVIA_MM ? '—' : formatearLluviaMm(mm)}
              </dd>
              <dd className="ficha-territorial__tramo-nota">{notaLluvia(mm)}</dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
}
