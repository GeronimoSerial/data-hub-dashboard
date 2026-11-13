'use client'

// Línea de latido (ECG) de una fuente: SVG en línea, sin dependencias. El
// texto de estado siempre está presente; el color sólo refuerza (rojo sólo en
// las muescas de corridas fallidas).
import type { JSX } from 'react'
import type { Diccionario } from '@/lib/i18n'
import { construirLatido, trazoLatido, type CorridaLatido, type EtiquetaLatido } from './latido'

const ANCHO = 224
const ALTO = 30

export function textoEtiquetaLatido(etiqueta: EtiquetaLatido, t: Diccionario): string {
  const d = t.situacion.estadoDatos.latido
  return etiqueta.clave === 'sinLatido' ? d.sinLatido(etiqueta.dias) : d[etiqueta.clave]
}

export function LatidoFuente(props: {
  corridas: CorridaLatido[] | null
  ahora: string
  ultimoExitoEn: string | null
  ultimoIntentoEn: string | null
  estado: string
  intervaloMinutos: number | null
  t: Diccionario
}): JSX.Element {
  const latido = construirLatido(props)
  const texto = textoEtiquetaLatido(latido.etiqueta, props.t)
  const trazo = trazoLatido(latido.marcas, ANCHO, ALTO)
  return (
    <span className="situacion-latido" data-testid="estado-datos-latido" data-latido={latido.etiqueta.clave}>
      <svg
        className="situacion-latido__svg"
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        role="img"
        aria-label={props.t.situacion.estadoDatos.latido.aria(texto, latido.completadas, latido.fallidas)}
        preserveAspectRatio="none"
        data-latido={latido.etiqueta.clave}
      >
        <path className="situacion-latido__base" d={trazo.base} pathLength={1} />
        {trazo.latidos !== '' && <path className="situacion-latido__pulso" d={trazo.latidos} />}
        {trazo.fallas !== '' && <path className="situacion-latido__falla" d={trazo.fallas} />}
      </svg>
      <span className="situacion-latido__texto">{texto}</span>
    </span>
  )
}
