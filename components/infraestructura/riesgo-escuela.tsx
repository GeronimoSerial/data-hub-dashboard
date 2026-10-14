'use client'

import { useEffect, useState, type JSX } from 'react'
import {
  explicarSnapshot,
  type ExplicacionSnapshot,
  type FactorMotor,
  type SnapshotMotor,
} from '@/lib/infraestructura/riesgo/explicar-snapshot'
import { colorRiesgo, ETIQUETA_HORIZONTE_MOTOR, type HorizonteMotor } from '@/lib/infraestructura/mapa/radar'

type Planificacion = { etiquetaVista: string; etiquetaNivel: string }[]

export type RiesgoEscuelaProps = {
  cueAnexo: string
  horizonte: HorizonteMotor
  planificacion: Planificacion | null
}

type RespuestaRiesgo = { snapshot: SnapshotMotor | null; factores: FactorMotor[] }

type EstadoRiesgo =
  | { fase: 'cargando' }
  | { fase: 'error'; clave: string }
  | { fase: 'listo'; clave: string; explicacion: ExplicacionSnapshot }

export function RiesgoEscuela({ cueAnexo, horizonte, planificacion }: RiesgoEscuelaProps): JSX.Element {
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
        const explicacion = explicarSnapshot(cuerpo.snapshot, cuerpo.factores ?? [])
        if (vigente) setEstado({ fase: 'listo', clave: `${cueAnexo}|${horizonte}`, explicacion })
      } catch {
        if (vigente) setEstado({ fase: 'error', clave: `${cueAnexo}|${horizonte}` })
      }
    }

    cargar()
    return () => {
      vigente = false
    }
  }, [cueAnexo, horizonte])

  return (
    <section className="riesgo-escuela" aria-label="Riesgo de la escuela">
      <div className="riesgo-escuela__bloque" data-testid="riesgo-escuela-actual">
        <h3 className="riesgo-escuela__titulo">Riesgo actual (hoy)</h3>
        <p className="riesgo-escuela__subtitulo">
          Motor de riesgo · horizonte {ETIQUETA_HORIZONTE_MOTOR[horizonte]}
        </p>
        {estado.fase === 'cargando' && (
          <p role="status">Cargando riesgo actual…</p>
        )}
        {estado.fase === 'error' && (
          <p role="alert">No se pudo cargar el riesgo actual.</p>
        )}
        {estado.fase === 'listo' && <ContenidoRiesgo explicacion={estado.explicacion} />}
      </div>

      {planificacion && planificacion.some((fila) => !esSinValor(fila.etiquetaNivel)) && (
        <div className="riesgo-escuela__bloque" data-testid="riesgo-escuela-planificacion">
          <h3 className="riesgo-escuela__titulo">Prioridad de planificación (exposición estructural)</h3>
          <dl className="riesgo-escuela__planificacion">
            {planificacion.map((fila) => (
              <div key={fila.etiquetaVista}>
                <dt>{fila.etiquetaVista}</dt>
                <dd>{fila.etiquetaNivel}</dd>
              </div>
            ))}
          </dl>
          <p className="riesgo-escuela__nota">Depende de la ubicación y los antecedentes, no del clima de hoy.</p>
        </div>
      )}
    </section>
  )
}

// Un valor sin dato: vacío, "Nulo" (nivel 0) o "Nulo (0)" (historial sin situaciones).
function esSinValor(etiqueta: string | null | undefined): boolean {
  const limpio = (etiqueta ?? '').trim()
  return limpio === '' || /^Nulo(\s*\(0\))?$/.test(limpio)
}

function ContenidoRiesgo({ explicacion }: { explicacion: ExplicacionSnapshot }): JSX.Element {
  const { nivel, etiquetaNivel, conclusion, zonaExpuesta, detalleTecnico } = explicacion
  // La primera evidencia ya está en la conclusión: no se repite en la lista.
  const situacionActual = explicacion.situacionActual.filter((linea) => !conclusion.includes(linea))
  return (
    <>
      <span
        className={`riesgo-escuela__nivel riesgo-escuela__nivel--${nivel ?? 'sin_dato'}`}
        // Mismo color que el marcador y la leyenda del Radar.
        style={nivel && nivel !== 'bajo' ? { backgroundColor: colorRiesgo(nivel) } : undefined}
        data-testid="riesgo-escuela-nivel"
      >
        {etiquetaNivel}
      </span>
      <p className="riesgo-escuela__conclusion" data-testid="riesgo-escuela-conclusion">
        {conclusion}
      </p>
      {situacionActual.length > 0 && (
        <>
          <h4 className="riesgo-escuela__subtitulo-seccion">Situación actual</h4>
          <ul>
            {situacionActual.map((linea) => (
              <li key={linea}>{linea}</li>
            ))}
          </ul>
        </>
      )}
      {zonaExpuesta && (
        <>
          <h4 className="riesgo-escuela__subtitulo-seccion">Zona expuesta a crecidas</h4>
          <p>{zonaExpuesta}</p>
        </>
      )}
      {detalleTecnico.length > 0 && (
        <details className="riesgo-escuela__tecnico">
          <summary>Ver detalle técnico</summary>
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
