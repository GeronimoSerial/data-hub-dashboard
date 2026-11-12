'use client'

import { useEffect, useState } from 'react'
import { regionPublicaActual } from '@/lib/infraestructura/region/publica'
import { formatearLluviaMm, formatearLluviaNumero, formatearVientoKmh } from '@/lib/infraestructura/radar-meteo/formato'

type PronosticoEscuela = {
  cueAnexo: string
  nombre: string
  departamento: { nombre: string | null }
  horas: Array<{
    hora: string
    lluviaMm: { valor: number | null }
    rafagaKmh: { valor: number | null }
  }>
  dias: Array<{ fecha: string; lluviaMm: number | null }>
  frescura?: { edadMinutos: number }
  contextoEnsamble?: { probabilidad25: number | null }
}

// Bloque de pronóstico que va dentro de la vista previa de la escuela en el radar.
export function PronosticoEscuelaBloque({ cueAnexo }: { cueAnexo: string }) {
  const [pronostico, setPronostico] = useState<PronosticoEscuela | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelado = false
    fetch(`/api/infraestructura/radar-meteo/escuela/${encodeURIComponent(cueAnexo)}`)
      .then(async (response) => {
        const body = await response.json() as PronosticoEscuela & { error?: string }
        if (!response.ok) throw new Error(body.error ?? 'No se pudo cargar el pronóstico')
        if (!cancelado) setPronostico(body)
      })
      .catch((reason: unknown) => {
        if (!cancelado) setError(reason instanceof Error ? reason.message : 'No se pudo cargar el pronóstico')
      })
    return () => { cancelado = true }
  }, [cueAnexo])

  const lluviaMaxima48h = Math.max(0, ...(pronostico?.horas.map((hora) => hora.lluviaMm.valor ?? 0) ?? []))
  const escalaLluvia48h = Math.max(1, lluviaMaxima48h)
  const rafagaMaxima = Math.max(0, ...(pronostico?.horas.map((hora) => hora.rafagaKmh.valor ?? 0) ?? []))

  return (
    <section className="pronostico-escuela" aria-label="Pronóstico meteorológico">
      <h3>Pronóstico</h3>
      {error && <p role="alert">{error}</p>}
      {!pronostico && !error && <p role="status">Cargando pronóstico puntual…</p>}
      {pronostico && (
        <div className="pronostico-escuela__cuerpo">
          {lluviaMaxima48h < 0.1 ? (
            <p className="pronostico-escuela__seco" role="status">Sin lluvia prevista en 48 h</p>
          ) : (
            <div className="pronostico-escuela__barras" aria-label="Lluvia por hora, próximas 48 horas">
              {pronostico.horas.map((hora) => {
                const lluvia = hora.lluviaMm.valor ?? 0
                return (
                  <i
                    key={hora.hora}
                    style={{ height: `${Math.max(1, (lluvia / escalaLluvia48h) * 32)}px` }}
                    title={`${new Date(hora.hora).toLocaleString(regionPublicaActual().locale)}: ${formatearLluviaMm(hora.lluviaMm.valor)}`}
                  />
                )
              })}
            </div>
          )}
          {lluviaMaxima48h >= 0.1 && <small>Próximas 48 h · barras de lluvia por hora</small>}
          <small>Lluvia por día (mm)</small>
          <div className="pronostico-escuela__dias">
            {pronostico.dias.map((dia) => (
              <span key={dia.fecha}>
                {new Date(`${dia.fecha}T12:00:00-03:00`).toLocaleDateString(regionPublicaActual().locale, { weekday: 'short' })}
                <b>{formatearLluviaNumero(dia.lluviaMm)}</b>
              </span>
            ))}
          </div>
          <p title={pronostico.frescura?.edadMinutos != null ? `Actualizado hace ${pronostico.frescura.edadMinutos} min` : undefined}>
            Ráfaga máxima: {formatearVientoKmh(rafagaMaxima)}
          </p>
          {(pronostico.contextoEnsamble?.probabilidad25 == null || pronostico.contextoEnsamble.probabilidad25 >= 0.05) && (
            <p>
              Probabilidad de más de 25 mm: {' '}
              {pronostico.contextoEnsamble?.probabilidad25 == null
                ? 'sin dato'
                : `${Math.round(pronostico.contextoEnsamble.probabilidad25 * 100)} %`}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
