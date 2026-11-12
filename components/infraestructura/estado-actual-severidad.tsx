import type { JSX } from 'react'
import { colorSeveridad } from '@/lib/infraestructura/severidad'
import type { Severidad } from '@/lib/infraestructura/trayectoria-tipos'
import { useTextos } from '@/lib/i18n/idioma-provider'

// Indicador de severidad de una afectación: el nombre escrito sobre una
// pastilla con el tono de la paleta oficial. El texto es la señal que no
// depende del color; el tono permite escanear la gravedad de reojo.
export const TINTA_POR_SEVERIDAD: Record<Severidad, string> = {
  Baja: '#7f1d1d',
  Media: '#450a0a',
  Alta: '#ffffff',
  Crítica: '#ffffff',
}

export interface EstadoActualSeveridadProps {
  severidad: Severidad
  /**
   * Antepone la palabra "Gravedad". Va en false cuando el contexto ya la
   * dice — por ejemplo dentro del grupo "¿Qué tan grave es?", donde
   * "Severidad Alta" repite la pregunta y alarga el nombre accesible de la
   * opción sin agregar nada.
   */
  prefijo?: boolean
  /**
   * Muestra el nombre sobre la pastilla de tono. Va en false en el selector de "¿Qué tan
   * grave es?" (afectacion-campos.tsx): ahí cada opción ya lleva al lado su
   * criterio en texto (SEVERIDAD_CRITERIOS), así que la marca es redundante
   * con la etiqueta. Sigue en true en el resto de las pantallas, donde es la
   * única señal no-basada-en-color de qué severidad se está mostrando.
   */
  marca?: boolean
  sugerida?: boolean
  actual?: boolean
}

export function EstadoActualSeveridad({
  severidad,
  prefijo = true,
  marca = true,
  sugerida = false,
  actual = false,
}: EstadoActualSeveridadProps): JSX.Element {
  const t = useTextos().fichaPanorama
  // Labels that match the enum value are read as-is (Alta, Crítica are the same in pt).
  const nombre = (t.severidad.nombres as Partial<Record<Severidad, string>>)[severidad] ?? severidad
  const texto = prefijo ? t.severidad.gravedad(nombre) : nombre
  return (
    <span className="estado-actual-severidad">
      {marca ? (
        <span
          className="estado-actual-severidad__texto estado-actual-severidad__texto--tono"
          style={{ backgroundColor: colorSeveridad(severidad), color: TINTA_POR_SEVERIDAD[severidad] ?? 'inherit' }}
        >
          {texto}
        </span>
      ) : (
        <span className="estado-actual-severidad__texto">{texto}</span>
      )}
      {sugerida ? <span className="badge badge--neutral badge-sugerido" aria-hidden="true">{t.severidad.sugerido}</span> : actual ? <span className="badge badge--neutral badge-sugerido" aria-hidden="true">{t.severidad.actual}</span> : null}
    </span>
  )
}
