'use client'

import type { JSX } from 'react'
import { useTextos } from '@/lib/i18n/idioma-provider'

/**
 * Encabezado común a las cuatro pantallas del director (estado actual,
 * reporte inicial, actualización e historial).
 *
 * El título es el del programa, no el de la escuela: el director entra por un
 * enlace que ya lo puso en su establecimiento, así que repetir el nombre de la
 * escuela como título gasta la línea más visible de la pantalla en un dato que
 * él no necesita que le confirmen. La escuela queda como identidad
 * subordinada, una sola vez, y el nombre de la pantalla baja a <h2>.
 *
 * El nombre extendido del fenómeno va en una línea aparte y no dentro del
 * <h1>: el título completo ocupa cuatro renglones en un celular y empuja todo
 * el formulario fuera de la primera pantalla.
 */

export interface EscuelaEncabezado {
  nombre: string
  cueAnexo: string
  localidad?: string
  departamento?: string
}

export interface EncabezadoParteProps {
  /** Nombre de la pantalla dentro del programa. Se renderiza como <h2>. */
  pantalla: string
  /**
   * Establecimiento identificado. Se omite cuando la pantalla todavía no lo
   * resolvió (guarda de acceso o error de contexto), y en ese caso no se
   * dibuja ninguna línea de identidad vacía.
   */
  escuela?: EscuelaEncabezado
  /** Bajada opcional de la pantalla, debajo del <h2>. */
  descripcion?: string
  /**
   * Deja el nombre de la pantalla sólo para lectores de pantalla. El
   * asistente ya titula cada paso con su pregunta y no necesita otro título.
   */
  pantallaOculta?: boolean
}

export function EncabezadoParte({
  pantalla,
  escuela,
  descripcion,
  pantallaOculta = false,
}: EncabezadoParteProps): JSX.Element {
  const t = useTextos().parteResto
  const lugar = escuela ? [escuela.localidad, escuela.departamento].filter(Boolean).join(', ') : ''
  const lineaEscuelaTexto = escuela
    ? lugar ? t.encabezado.cueConLugar(escuela.cueAnexo, lugar) : t.encabezado.cue(escuela.cueAnexo)
    : ''

  return (
    <header className="encabezado-parte">
      <h1 className="publico-content__title encabezado-parte__programa">{t.encabezado.programa}</h1>
      <p className="encabezado-parte__glosa">{t.encabezado.glosa}</p>
      <a className="encabezado-parte__materiales" href="/materiales" target="_blank" rel="noopener noreferrer">
        {t.encabezado.materiales}
        <span className="sr-only"> {t.abreEnOtraPestana}</span>
      </a>

      {escuela && (
        <div className="encabezado-parte__escuela">
          <p className="encabezado-parte__escuela-nombre">{escuela.nombre}</p>
          <p className="encabezado-parte__escuela-datos">{lineaEscuelaTexto}</p>
        </div>
      )}

      <h2 className={pantallaOculta ? 'sr-only' : 'encabezado-parte__pantalla'}>{pantalla}</h2>
      {descripcion && <p className="encabezado-parte__descripcion">{descripcion}</p>}
    </header>
  )
}
