import type { JSX } from 'react'

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
export const TITULO_PROGRAMA = 'Registro de Incidencias ENOS 2026/2027'

export const GLOSA_PROGRAMA = 'El Niño – Oscilación del Sur'

/** Título del documento (pestaña del navegador), donde sí entra completo. */
export const TITULO_PROGRAMA_COMPLETO =
  'Registro de Incidencias ENOS (El Niño – Oscilación del Sur) 2026/2027'

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
}

function lineaEscuela(escuela: EscuelaEncabezado): string {
  const lugar = [escuela.localidad, escuela.departamento].filter(Boolean).join(', ')
  return lugar ? `CUE ${escuela.cueAnexo} · ${lugar}` : `CUE ${escuela.cueAnexo}`
}

export function EncabezadoParte({
  pantalla,
  escuela,
  descripcion,
}: EncabezadoParteProps): JSX.Element {
  return (
    <header className="encabezado-parte">
      <h1 className="publico-content__title encabezado-parte__programa">{TITULO_PROGRAMA}</h1>
      <p className="encabezado-parte__glosa">{GLOSA_PROGRAMA}</p>

      {escuela && (
        <div className="encabezado-parte__escuela">
          <p className="encabezado-parte__escuela-nombre">{escuela.nombre}</p>
          <p className="encabezado-parte__escuela-datos">{lineaEscuela(escuela)}</p>
        </div>
      )}

      <h2 className="encabezado-parte__pantalla">{pantalla}</h2>
      {descripcion && <p className="encabezado-parte__descripcion">{descripcion}</p>}
    </header>
  )
}
