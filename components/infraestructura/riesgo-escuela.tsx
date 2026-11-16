'use client'

import { useEffect, useState, type JSX } from 'react'
import {
  explicarSnapshot,
  type ExplicacionSnapshot,
  type FactorMotor,
  type SnapshotMotor,
} from '@/lib/infraestructura/riesgo/explicar-snapshot'
import { colorRiesgo, etiquetaHorizonteMotor, type HorizonteMotor } from '@/lib/infraestructura/mapa/radar'
import type { PresentacionCrecida } from '@/lib/infraestructura/riesgo/presentacion-crecida'
import { ReferenciaCrecida } from './referencia-crecida'
import { AtribucionDemCompacta } from './atribucion-dem-compacta'
import { useTextos } from '@/lib/i18n/idioma-provider'

type Planificacion = { etiquetaVista: string; etiquetaNivel: string }[]

export type RiesgoEscuelaProps = {
  cueAnexo: string
  horizonte: HorizonteMotor
  planificacion: Planificacion | null
}

type RespuestaRiesgo = { snapshot: SnapshotMotor | null; factores: FactorMotor[]; crecidaRio?: PresentacionCrecida | null }

type EstadoRiesgo =
  | { fase: 'cargando' }
  | { fase: 'error'; clave: string }
  | { fase: 'listo'; clave: string; explicacion: ExplicacionSnapshot; crecidaRio: PresentacionCrecida | null }

export function RiesgoEscuela({ cueAnexo, horizonte, planificacion }: RiesgoEscuelaProps): JSX.Element {
  const dic = useTextos()
  const t = dic.fichaPanorama.riesgo
  const clave = `${cueAnexo}|${horizonte}`
  const [guardado, setEstado] = useState<EstadoRiesgo>({ fase: 'cargando' })
  // Un resultado de otra escuela u horizonte cuenta como "cargando" hasta que llegue el nuevo.
  const estado: EstadoRiesgo = guardado.fase !== 'cargando' && guardado.clave === clave ? guardado : { fase: 'cargando' }

  useEffect(() => {
    let vigente = true

    async function cargar() {
      try {
        const respuesta = await fetch(
          `/api/infraestructura/riesgo/escuela/${encodeURIComponent(cueAnexo)}?horizonte=${horizonte}`,
        )
        if (!respuesta.ok) throw new Error('no se pudo obtener el riesgo')
        const cuerpo = (await respuesta.json()) as RespuestaRiesgo
        const explicacion = explicarSnapshot(cuerpo.snapshot, cuerpo.factores ?? [], dic)
        if (vigente) setEstado({ fase: 'listo', clave: `${cueAnexo}|${horizonte}`, explicacion, crecidaRio: cuerpo.crecidaRio ?? null })
      } catch {
        if (vigente) setEstado({ fase: 'error', clave: `${cueAnexo}|${horizonte}` })
      }
    }

    cargar()
    return () => {
      vigente = false
    }
  }, [cueAnexo, horizonte, dic])

  return (
    <section className="riesgo-escuela" aria-label={t.region}>
      {estado.fase === 'listo' && estado.crecidaRio && <ReferenciaCrecida crecida={estado.crecidaRio} horizonte={horizonte} />}
      <div className="riesgo-escuela__bloque" data-testid="riesgo-escuela-actual">
        <div className="riesgo-escuela__encabezado">
          <h3 className="riesgo-escuela__titulo">{t.titulo}</h3>
          <span className="riesgo-escuela__horizonte">{t.horizonte(etiquetaHorizonteMotor(horizonte, dic))}</span>
        </div>
        <p className="riesgo-escuela__explicacion">{t.explicacion}</p>
        {estado.fase === 'cargando' && (
          <p role="status">{t.cargando}</p>
        )}
        {estado.fase === 'error' && (
          <p role="alert">{t.error}</p>
        )}
        {estado.fase === 'listo' && <ContenidoRiesgo explicacion={estado.explicacion} />}
      </div>

      {planificacion && planificacion.some((fila) => !esSinValor(fila.etiquetaNivel)) && (
        <div className="riesgo-escuela__bloque" data-testid="riesgo-escuela-planificacion">
          <h3 className="riesgo-escuela__titulo">{t.planificacionTitulo}</h3>
          <p className="riesgo-escuela__explicacion">{t.planificacionExplicacion}</p>
          <dl className="riesgo-escuela__planificacion">
            {planificacion.map((fila) => {
              // Keys are the view titles from the data; values come from the dictionary.
              const ayuda = (t.ayudaVista as Partial<Record<string, string>>)[fila.etiquetaVista]
              return (
              <div key={fila.etiquetaVista}>
                <dt>
                  {fila.etiquetaVista}
                  {ayuda && <span className="riesgo-escuela__ayuda-vista">{ayuda}</span>}
                </dt>
                <dd>{fila.etiquetaNivel}</dd>
              </div>
              )
            })}
          </dl>
        </div>
      )}
      {estado.fase === 'listo' && <AtribucionDemCompacta />}
    </section>
  )
}

// Un valor sin dato: vacío, "Nulo" (nivel 0) o "Nulo (0)" (historial sin situaciones).
function esSinValor(etiqueta: string | null | undefined): boolean {
  const limpio = (etiqueta ?? '').trim()
  return limpio === '' || /^Nulo(\s*\(0\))?$/.test(limpio)
}

function ContenidoRiesgo({ explicacion }: { explicacion: ExplicacionSnapshot }): JSX.Element {
  const t = useTextos().fichaPanorama.riesgo
  const { nivel, etiquetaNivel, conclusion, zonaExpuesta, detalleTecnico } = explicacion
  // La primera evidencia ya está en la conclusión: no se repite en la lista.
  const situacionActual = explicacion.situacionActual.filter((linea) => !conclusion.includes(linea))
  return (
    <>
      <p className="riesgo-escuela__nivel-fila">
        <span className="riesgo-escuela__nivel-etiqueta">{t.nivelEstimado}</span>
        <span
          className={`riesgo-escuela__nivel riesgo-escuela__nivel--${nivel ?? 'sin_dato'}`}
        // Mismo color que el marcador y la leyenda del Radar.
        style={nivel && nivel !== 'bajo' ? { backgroundColor: colorRiesgo(nivel) } : undefined}
        data-testid="riesgo-escuela-nivel"
      >
          {etiquetaNivel}
        </span>
      </p>
      <p className="riesgo-escuela__conclusion" data-testid="riesgo-escuela-conclusion">
        {conclusion}
      </p>
      {situacionActual.length > 0 && (
        <>
          <h4 className="riesgo-escuela__subtitulo-seccion">{t.situacionActual}</h4>
          <ul>
            {situacionActual.map((linea) => (
              <li key={linea}>{linea}</li>
            ))}
          </ul>
        </>
      )}
      {zonaExpuesta && (
        <>
          <h4 className="riesgo-escuela__subtitulo-seccion">{t.zonaExpuesta}</h4>
          <p>{zonaExpuesta}</p>
        </>
      )}
      {detalleTecnico.length > 0 && (
        <details className="riesgo-escuela__tecnico">
          <summary>{t.detalleTecnico}</summary>
          <dl>
            {detalleTecnico.map((item) => (
              <div key={item.titulo}>
                <dt>{item.titulo}</dt>
                <dd>{item.texto}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </>
  )
}
