'use client'

import { useEffect, useState } from 'react'
import { regionPublicaActual } from '@/lib/infraestructura/region/publica'
import { formatearLluviaMm, formatearLluviaNumero, formatearVientoKmh } from '@/lib/infraestructura/radar-meteo/formato'
import { useTextos } from '@/lib/i18n/idioma-provider'

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
  const t = useTextos()
  const e = t.radar.escuela

  useEffect(() => {
    let cancelado = false
    fetch(`/api/infraestructura/radar-meteo/escuela/${encodeURIComponent(cueAnexo)}`)
      .then(async (response) => {
        const body = await response.json() as PronosticoEscuela & { error?: string }
        if (!response.ok) throw new Error(body.error ?? e.errorCarga)
        if (!cancelado) setPronostico(body)
      })
      .catch((reason: unknown) => {
        if (!cancelado) setError(reason instanceof Error ? reason.message : e.errorCarga)
      })
    return () => { cancelado = true }
  }, [cueAnexo, e])

  const lluviaMaxima48h = Math.max(0, ...(pronostico?.horas.map((hora) => hora.lluviaMm.valor ?? 0) ?? []))
  const escalaLluvia48h = Math.max(1, lluviaMaxima48h)
  const rafagaMaxima = Math.max(0, ...(pronostico?.horas.map((hora) => hora.rafagaKmh.valor ?? 0) ?? []))

  return (
    <section className="pronostico-escuela" aria-label={e.ariaSeccion}>
      <h3>{e.titulo}</h3>
      {error && <p role="alert">{error}</p>}
      {!pronostico && !error && <p role="status">{e.cargando}</p>}
      {pronostico && (
        <div className="pronostico-escuela__cuerpo">
          {lluviaMaxima48h < 0.1 ? (
            <p className="pronostico-escuela__seco" role="status">{e.seco}</p>
          ) : (
            <div className="pronostico-escuela__barras" aria-label={e.barrasAria}>
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
          {lluviaMaxima48h >= 0.1 && <small>{e.prox48}</small>}
          <small>{e.lluviaDia}</small>
          <div className="pronostico-escuela__dias">
            {pronostico.dias.map((dia) => (
              <span key={dia.fecha}>
                {new Date(`${dia.fecha}T12:00:00-03:00`).toLocaleDateString(regionPublicaActual().locale, { weekday: 'short' })}
                <b>{formatearLluviaNumero(dia.lluviaMm)}</b>
              </span>
            ))}
          </div>
          <p title={pronostico.frescura?.edadMinutos != null ? e.actualizado(pronostico.frescura.edadMinutos) : undefined}>
            {e.rafaga} {formatearVientoKmh(rafagaMaxima)}
          </p>
          {(pronostico.contextoEnsamble?.probabilidad25 == null || pronostico.contextoEnsamble.probabilidad25 >= 0.05) && (
            <p>
              {e.probabilidad25} {' '}
              {pronostico.contextoEnsamble?.probabilidad25 == null
                ? e.sinDato
                : `${Math.round(pronostico.contextoEnsamble.probabilidad25 * 100)} %`}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
