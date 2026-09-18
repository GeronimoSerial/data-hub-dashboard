// Resolución de vigencia temporal para filas con rigeDesde/retiradaEn (spec
// §12: infra_afectacion, infra_servicio_alcance). Ver
// docs/especificacion-funcional-trayectoria-evento-hidrometeorologico.md §12
// y el CONTRACT.md ("Timestamps — two distinct concepts").
//
// DECISIÓN DE DISEÑO (de la que dependen los batches siguientes):
//
// Cada fila describe un intervalo semiabierto de vigencia
// [rigeDesde, retiradaEn). Una fila está "vigente" en el instante de
// referencia T si y sólo si:
//
//   rigeDesde <= T   Y   (retiradaEn === null  O  retiradaEn > T)
//
// Consecuencia directa para rigeDesde futuro (spec §12 lo permite
// explícitamente): una fila cuyo rigeDesde es posterior a T todavía NO está
// vigente. No es un error ni se descarta el dato — simplemente no forma
// parte del conjunto "vigente ahora". Queda disponible para quien quiera
// mostrar "próximos cambios programados", pero calcularEstadoServicioGeneral
// y el resto de esta capa sólo miran el presente (T).
//
// Este criterio también resuelve, sin casos especiales, el reemplazo de una
// fila por otra: cuando quien escribe (batch 3) da de baja una fila vigente
// fijándole retiradaEn = rigeDesde de la fila nueva, el intervalo de la
// vieja se cierra exactamente donde empieza el de la nueva, incluso si esa
// fecha es futura. Hasta que ese instante llegue, la fila vieja sigue
// vigente y la nueva todavía no.
import type { FilaConVigencia } from './trayectoria-tipos'

export interface ResolverVigenciaOpciones<T> {
  // Instante de referencia ("ahora"). Por defecto, el reloj real. Recibir un
  // Date explícito es lo que permite testear el comportamiento con fechas
  // futuras/pasadas sin mockear el reloj global.
  referencia?: Date | string
  // Clave de agrupación opcional. Cuando dos filas vigentes comparten la
  // misma clave (p. ej. mismo tipo+referenciaId de infra_servicio_alcance),
  // se conserva sólo la de rigeDesde más reciente — defensivo ante datos que
  // no deberían coexistir, nunca debería hacer falta si quien escribe
  // mantiene bien cerrados los intervalos anteriores.
  clave?: (fila: T) => string
}

function aFecha(valor: Date | string): Date {
  return valor instanceof Date ? valor : new Date(valor)
}

export function resolverAlcanceVigente<T extends FilaConVigencia>(
  filas: T[],
  opciones: ResolverVigenciaOpciones<T> = {},
): T[] {
  const referencia = aFecha(opciones.referencia ?? new Date())
  const referenciaMs = referencia.getTime()

  const enVigencia = filas.filter((fila) => {
    const rigeMs = new Date(fila.rigeDesde).getTime()
    if (rigeMs > referenciaMs) return false // rigeDesde futuro: todavía no vigente
    if (fila.retiradaEn) {
      const retiradaMs = new Date(fila.retiradaEn).getTime()
      if (retiradaMs <= referenciaMs) return false
    }
    return true
  })

  if (!opciones.clave) return enVigencia

  const clave = opciones.clave
  const porClave = new Map<string, T>()
  for (const fila of enVigencia) {
    const k = clave(fila)
    const actual = porClave.get(k)
    if (!actual || new Date(fila.rigeDesde).getTime() > new Date(actual.rigeDesde).getTime()) {
      porClave.set(k, fila)
    }
  }
  return Array.from(porClave.values())
}

// Clave de agrupación estándar para infra_servicio_alcance: el alcance real
// que una fila describe es (tipo, referenciaId), no su id de fila.
export function claveServicioAlcance(fila: {
  tipo: string
  referenciaId: string | null
}): string {
  return `${fila.tipo}:${fila.referenciaId ?? ''}`
}
