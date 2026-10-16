import { referencia, versionReferencia } from '@/lib/infraestructura/datasets/memoria'
// Tramos de río que asignan cada localidad ribereña de Corrientes a una estación
// de Prefectura del catálogo. La asignación la define una persona por tramo, no
// por distancia. Los tramos nacen como 'propuesta' (los propone el asistente);
// solo los 'aprobada' se devuelven por defecto. Esta versión no se usa todavía en
// el motor, el mapa ni la asociación por distancia (rio-asociacion).

export function obtenerVersionTramosPrefectura(): string { return versionReferencia('tramos-prefectura') }

export type EstadoTramo = 'propuesta' | 'aprobada'

export type TramoPrefectura = {
  tramoId: string
  rio: 'parana' | 'uruguay'
  // Debe existir en obtenerEstacionesPrefectura() con rol 'corrientes'.
  estacionId: string
  // Nombres de localidad tal como aparecen en el padrón de escuelas.
  localidades: string[]
  justificacion: string
  estado: EstadoTramo
  propuestoPor: 'asistente'
  // Solo en tramos 'aprobada': quién aprobó y cuándo (YYYY-MM-DD).
  aprobadoPor?: 'GeronimoSerial'
  aprobadoEl?: string
}

export type LocalidadDudosa = {
  localidad: string
  departamento: string
  motivo: string
}


// Distancias de las propuestas y de las localidades dudosas: distancia en línea
// recta desde la mediana de las escuelas de la localidad (coordenadas GEO) hasta la
// coordenada publicada por PNA de la estación (sin verificar). Es un proxy, no la
// distancia a la costa del río: una localidad a 8 km de la estación puede quedar
// sobre otra costa o en isla. Las propuestas requieren revisión humana.
export function obtenerTramosPrefectura(): readonly TramoPrefectura[] { return referencia('tramos-prefectura') }

// Localidades que no se asignan porque no hay certeza de que sean ribereñas del
// curso de referencia. Una persona debe decidirlas antes de agregarlas a un tramo.
// El motivo trae la distancia medida a la estación más cercana (proxy, ver arriba).
export function obtenerLocalidadesDudosas(): readonly LocalidadDudosa[] { return referencia('localidades-riberenas-dudosas') }

// Clave de comparación: sin acentos, mayúsculas ni espacios repetidos.
function claveLocalidad(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Devuelve el tramo que contiene la localidad, o null. Por defecto solo considera
 * tramos 'aprobada'; con `incluirPropuestas: true` también mira los propuestos
 * (uso de revisión, nunca de producción).
 */
export function estacionParaLocalidad(
  localidad: string,
  { incluirPropuestas = false }: { incluirPropuestas?: boolean } = {},
): TramoPrefectura | null {
  const clave = claveLocalidad(localidad)
  if (clave === '') return null
  return (
    obtenerTramosPrefectura().find(
      (tramo) =>
        (incluirPropuestas || tramo.estado === 'aprobada') &&
        tramo.localidades.some((l) => claveLocalidad(l) === clave),
    ) ?? null
  )
}
