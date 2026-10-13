// Tramos de río que asignan cada localidad ribereña de Corrientes a una estación
// de Prefectura del catálogo. La asignación la define una persona por tramo, no
// por distancia. Los tramos nacen como 'propuesta' (los propone el asistente);
// solo los 'aprobada' se devuelven por defecto. Esta versión no se usa todavía en
// el motor, el mapa ni la asociación por distancia (rio-asociacion).

export const TRAMOS_PREFECTURA_VERSION = 'tramos-prefectura-v1'

export type EstadoTramo = 'propuesta' | 'aprobada'

export type TramoPrefectura = {
  tramoId: string
  rio: 'parana' | 'uruguay'
  // Debe existir en CATALOGO_ESTACIONES_PREFECTURA con rol 'corrientes'.
  estacionId: string
  // Nombres de localidad tal como aparecen en el padrón de escuelas.
  localidades: string[]
  justificacion: string
  estado: EstadoTramo
  propuestoPor: 'asistente'
}

export type LocalidadDudosa = {
  localidad: string
  departamento: string
  motivo: string
}

export const TRAMOS_PREFECTURA: readonly TramoPrefectura[] = [
  // Paraná, de aguas arriba hacia aguas abajo
  {
    tramoId: 'parana-ituzaingo',
    rio: 'parana',
    estacionId: 'pna-ituzaingo',
    localidades: ['ITUZAINGO', 'COLONIA LIEBIG'],
    justificacion: 'Ituzaingó está sobre el Paraná y la estación de Prefectura está en la misma localidad; Colonia Liebig está sobre la misma costa.',
    estado: 'propuesta',
    propuestoPor: 'asistente',
  },
  {
    tramoId: 'parana-ita-ibate',
    rio: 'parana',
    estacionId: 'pna-ita-ibate',
    localidades: ['ITA IBATE'],
    justificacion: 'Itá Ibaté está sobre el Paraná y la estación de Prefectura está en la misma localidad.',
    estado: 'propuesta',
    propuestoPor: 'asistente',
  },
  {
    tramoId: 'parana-itati',
    rio: 'parana',
    estacionId: 'pna-itati',
    localidades: ['ITATI'],
    justificacion: 'Itatí está sobre el Paraná entre Itá Ibaté y Paso de la Patria; la estación de Prefectura está en la misma localidad.',
    estado: 'propuesta',
    propuestoPor: 'asistente',
  },
  {
    tramoId: 'parana-paso-de-la-patria',
    rio: 'parana',
    estacionId: 'pna-paso-de-la-patria',
    localidades: ['PASO DE LA PATRIA'],
    justificacion: 'Paso de la Patria está sobre el Paraná y la estación de Prefectura está en la misma localidad.',
    estado: 'propuesta',
    propuestoPor: 'asistente',
  },
  {
    tramoId: 'parana-corrientes',
    rio: 'parana',
    estacionId: 'pna-corrientes',
    localidades: ['CORRIENTES'],
    justificacion: 'La ciudad de Corrientes está sobre el Paraná y la estación de Prefectura está en la misma localidad.',
    estado: 'propuesta',
    propuestoPor: 'asistente',
  },
  {
    tramoId: 'parana-empedrado',
    rio: 'parana',
    estacionId: 'pna-empedrado',
    localidades: ['EMPEDRADO'],
    justificacion: 'Empedrado está sobre el Paraná y la estación de Prefectura está en la misma localidad.',
    estado: 'propuesta',
    propuestoPor: 'asistente',
  },
  {
    tramoId: 'parana-bella-vista',
    rio: 'parana',
    estacionId: 'pna-bella-vista',
    localidades: ['BELLA VISTA'],
    justificacion: 'Bella Vista está sobre el Paraná y la estación de Prefectura está en la misma localidad.',
    estado: 'propuesta',
    propuestoPor: 'asistente',
  },
  {
    tramoId: 'parana-goya',
    rio: 'parana',
    estacionId: 'pna-goya',
    localidades: ['GOYA'],
    justificacion: 'Goya está sobre el Paraná y la estación de Prefectura está en la misma localidad.',
    estado: 'propuesta',
    propuestoPor: 'asistente',
  },
  {
    tramoId: 'parana-esquina',
    rio: 'parana',
    estacionId: 'pna-esquina',
    localidades: ['ESQUINA'],
    justificacion: 'Esquina está sobre el Paraná y la estación de Prefectura está en la misma localidad.',
    estado: 'propuesta',
    propuestoPor: 'asistente',
  },
  // Uruguay, de aguas arriba hacia aguas abajo
  {
    tramoId: 'uruguay-garruchos',
    rio: 'uruguay',
    estacionId: 'pna-garruchos',
    localidades: ['GARRUCHOS'],
    justificacion: 'Garruchos está sobre el Uruguay y la estación de Prefectura está en la misma localidad.',
    estado: 'propuesta',
    propuestoPor: 'asistente',
  },
  {
    tramoId: 'uruguay-santo-tome',
    rio: 'uruguay',
    estacionId: 'pna-santo-tome',
    localidades: ['SANTO TOME'],
    justificacion: 'Santo Tomé está sobre el Uruguay y la estación de Prefectura está en la misma localidad.',
    estado: 'propuesta',
    propuestoPor: 'asistente',
  },
  {
    tramoId: 'uruguay-alvear',
    rio: 'uruguay',
    estacionId: 'pna-alvear',
    localidades: ['GENERAL ALVEAR'],
    justificacion: 'General Alvear (Alvear) está sobre el Uruguay y la estación de Prefectura está en la misma localidad.',
    estado: 'propuesta',
    propuestoPor: 'asistente',
  },
  {
    tramoId: 'uruguay-la-cruz',
    rio: 'uruguay',
    estacionId: 'pna-la-cruz',
    localidades: ['LA CRUZ'],
    justificacion: 'La Cruz está sobre el Uruguay y la estación de Prefectura está en la misma localidad.',
    estado: 'propuesta',
    propuestoPor: 'asistente',
  },
  {
    tramoId: 'uruguay-yapeyu',
    rio: 'uruguay',
    estacionId: 'pna-yapeyu',
    localidades: ['YAPEYU'],
    justificacion: 'Yapeyú está sobre el Uruguay y la estación de Prefectura está en la misma localidad.',
    estado: 'propuesta',
    propuestoPor: 'asistente',
  },
  {
    tramoId: 'uruguay-paso-de-los-libres',
    rio: 'uruguay',
    estacionId: 'pna-paso-de-los-libres',
    localidades: ['PASO DE LOS LIBRES'],
    justificacion: 'Paso de los Libres está sobre el Uruguay y la estación de Prefectura está en la misma localidad.',
    estado: 'propuesta',
    propuestoPor: 'asistente',
  },
  {
    tramoId: 'uruguay-bompland',
    rio: 'uruguay',
    estacionId: 'pna-bompland',
    localidades: ['BONPLAND'],
    justificacion: 'Bonpland está sobre el Uruguay y la estación de Prefectura está en la misma localidad (el padrón escribe BONPLAND, PNA publica BOMPLAND).',
    estado: 'propuesta',
    propuestoPor: 'asistente',
  },
  {
    tramoId: 'uruguay-monte-caseros',
    rio: 'uruguay',
    estacionId: 'pna-monte-caseros',
    localidades: ['MONTE CASEROS'],
    justificacion: 'Monte Caseros está sobre el Uruguay y la estación de Prefectura está en la misma localidad.',
    estado: 'propuesta',
    propuestoPor: 'asistente',
  },
  {
    tramoId: 'uruguay-mocoreta',
    rio: 'uruguay',
    estacionId: 'pna-mocoreta',
    localidades: ['MOCORETA'],
    justificacion: 'Mocoretá está sobre el Uruguay y la estación de Prefectura está en la misma localidad.',
    estado: 'propuesta',
    propuestoPor: 'asistente',
  },
]

// Localidades que no se asignan porque no hay certeza de que sean ribereñas del
// curso de referencia. Una persona debe decidirlas antes de agregarlas a un tramo.
export const LOCALIDADES_DUDOSAS: readonly LocalidadDudosa[] = [
  { localidad: 'GOBERNADOR VIRASORO', departamento: 'SANTO TOME', motivo: 'Localidad importante del departamento Santo Tomé; no está claro si queda sobre la costa del Uruguay o a distancia.' },
  { localidad: 'ENSENADITA', departamento: 'SAN COSME', motivo: 'Cercana a Paso de la Patria; no se confirmó que esté sobre la costa del Paraná.' },
  { localidad: 'RAMADA PASO', departamento: 'ITATI', motivo: 'Ubicación sobre el Paraná no confirmada; podría ser interior del departamento Itatí.' },
  { localidad: 'RIACHUELO', departamento: 'CAPITAL', motivo: 'Zona próxima a la desembocadura del arroyo homónimo; no se confirmó si es una localidad ribereña distinta de Corrientes.' },
  { localidad: 'COSTA DE EMPEDRADO', departamento: 'EMPEDRADO', motivo: 'El nombre sugiere costa, pero no se confirmó que sea una localidad distinta sobre el Paraná.' },
  { localidad: 'PUNTA IFRAN', departamento: 'GOYA', motivo: 'Probable costa del Paraná cerca de Goya; no confirmado.' },
  { localidad: 'PUERTO BOCA', departamento: 'GOYA', motivo: 'Nombre portuario; no se confirmó la ubicación sobre el Paraná.' },
  { localidad: 'SAN CARLOS', departamento: 'ITUZAINGO', motivo: 'Ubicación respecto del Paraná no confirmada.' },
  { localidad: 'APIPE GRANDE', departamento: 'ITUZAINGO', motivo: 'Podría ser isla del Paraná en lugar de localidad sobre la costa; no confirmado.' },
  { localidad: 'MUCHAS ISLAS', departamento: 'BELLA VISTA', motivo: 'Localidad en islas del Paraná; no se confirmó si corresponde a la costa de la estación Bella Vista.' },
  { localidad: 'TAPEBICUA', departamento: 'PASO DE LOS LIBRES', motivo: 'Ubicación respecto del Uruguay no confirmada.' },
  { localidad: 'JUAN PUJOL', departamento: 'MONTE CASEROS', motivo: 'Localidad del departamento Monte Caseros; no se confirmó que esté sobre la costa del Uruguay.' },
  { localidad: 'LA CRUZ (Sección Quintas - Zona Rural)', departamento: 'SAN MARTIN', motivo: 'Sección rural de La Cruz; se asigna la localidad principal y esta sección requiere decisión aparte.' },
]

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
    TRAMOS_PREFECTURA.find(
      (tramo) =>
        (incluirPropuestas || tramo.estado === 'aprobada') &&
        tramo.localidades.some((l) => claveLocalidad(l) === clave),
    ) ?? null
  )
}
