// Tramos de río que asignan cada localidad ribereña de Corrientes a una estación
// de Prefectura del catálogo. La asignación la define una persona por tramo, no
// por distancia. Los tramos nacen como 'propuesta' (los propone el asistente);
// solo los 'aprobada' se devuelven por defecto. Esta versión no se usa todavía en
// el motor, el mapa ni la asociación por distancia (rio-asociacion).

export const TRAMOS_PREFECTURA_VERSION = 'tramos-prefectura-v2'

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
  // Solo en tramos 'aprobada': quién aprobó y cuándo (YYYY-MM-DD).
  aprobadoPor?: 'GeronimoSerial'
  aprobadoEl?: string
}

export type LocalidadDudosa = {
  localidad: string
  departamento: string
  motivo: string
}

const APROBACION = { aprobadoPor: 'GeronimoSerial', aprobadoEl: '2026-10-13' } as const

// Distancias de las propuestas y de las localidades dudosas: distancia en línea
// recta desde la mediana de las escuelas de la localidad (coordenadas GEO) hasta la
// coordenada publicada por PNA de la estación (sin verificar). Es un proxy, no la
// distancia a la costa del río: una localidad a 8 km de la estación puede quedar
// sobre otra costa o en isla. Las propuestas requieren revisión humana.
export const TRAMOS_PREFECTURA: readonly TramoPrefectura[] = [
  // Paraná, de aguas arriba hacia aguas abajo
  {
    tramoId: 'parana-ituzaingo',
    rio: 'parana',
    estacionId: 'pna-ituzaingo',
    localidades: ['ITUZAINGO'],
    justificacion: 'Ituzaingó está sobre el Paraná y la estación de Prefectura está en la misma localidad.',
    estado: 'aprobada',
    propuestoPor: 'asistente',
    ...APROBACION,
  },
  {
    tramoId: 'parana-ituzaingo-apipe-grande',
    rio: 'parana',
    estacionId: 'pna-ituzaingo',
    localidades: ['APIPE GRANDE'],
    justificacion: 'Mediana de 2 escuelas a 13,5 km de la estación Ituzaingó (coordenadas PNA sin verificar).',
    estado: 'propuesta',
    propuestoPor: 'asistente',
  },
  {
    tramoId: 'parana-ita-ibate',
    rio: 'parana',
    estacionId: 'pna-ita-ibate',
    localidades: ['ITA IBATE'],
    justificacion: 'Itá Ibaté está sobre el Paraná y la estación de Prefectura está en la misma localidad.',
    estado: 'aprobada',
    propuestoPor: 'asistente',
    ...APROBACION,
  },
  {
    tramoId: 'parana-itati',
    rio: 'parana',
    estacionId: 'pna-itati',
    localidades: ['ITATI'],
    justificacion: 'Itatí está sobre el Paraná entre Itá Ibaté y Paso de la Patria; la estación de Prefectura está en la misma localidad.',
    estado: 'aprobada',
    propuestoPor: 'asistente',
    ...APROBACION,
  },
  {
    tramoId: 'parana-itati-ramada-paso',
    rio: 'parana',
    estacionId: 'pna-itati',
    localidades: ['RAMADA PASO'],
    justificacion: 'Mediana de 4 escuelas a 12,1 km de la estación Itatí (coordenadas PNA sin verificar).',
    estado: 'propuesta',
    propuestoPor: 'asistente',
  },
  {
    tramoId: 'parana-paso-de-la-patria',
    rio: 'parana',
    estacionId: 'pna-paso-de-la-patria',
    localidades: ['PASO DE LA PATRIA'],
    justificacion: 'Paso de la Patria está sobre el Paraná y la estación de Prefectura está en la misma localidad.',
    estado: 'aprobada',
    propuestoPor: 'asistente',
    ...APROBACION,
  },
  {
    tramoId: 'parana-paso-de-la-patria-ensenadita',
    rio: 'parana',
    estacionId: 'pna-paso-de-la-patria',
    localidades: ['ENSENADITA'],
    justificacion: 'Mediana de 6 escuelas a 8,6 km de la estación Paso de la Patria (coordenadas PNA sin verificar).',
    estado: 'propuesta',
    propuestoPor: 'asistente',
  },
  {
    tramoId: 'parana-corrientes',
    rio: 'parana',
    estacionId: 'pna-corrientes',
    localidades: ['CORRIENTES', 'RIACHUELO'],
    justificacion:
      'La ciudad de Corrientes está sobre el Paraná y la estación de Prefectura está en la misma localidad. Riachuelo (Capital) se asigna a Corrientes por decisión del usuario del 2026-10-13, aunque sus escuelas quedan a 16,9 km de la estación.',
    estado: 'aprobada',
    propuestoPor: 'asistente',
    ...APROBACION,
  },
  {
    tramoId: 'parana-empedrado',
    rio: 'parana',
    estacionId: 'pna-empedrado',
    localidades: ['EMPEDRADO'],
    justificacion: 'Empedrado está sobre el Paraná y la estación de Prefectura está en la misma localidad.',
    estado: 'aprobada',
    propuestoPor: 'asistente',
    ...APROBACION,
  },
  {
    tramoId: 'parana-bella-vista',
    rio: 'parana',
    estacionId: 'pna-bella-vista',
    localidades: ['BELLA VISTA'],
    justificacion: 'Bella Vista está sobre el Paraná y la estación de Prefectura está en la misma localidad.',
    estado: 'aprobada',
    propuestoPor: 'asistente',
    ...APROBACION,
  },
  {
    tramoId: 'parana-goya',
    rio: 'parana',
    estacionId: 'pna-goya',
    localidades: ['GOYA'],
    justificacion: 'Goya está sobre el Paraná y la estación de Prefectura está en la misma localidad.',
    estado: 'aprobada',
    propuestoPor: 'asistente',
    ...APROBACION,
  },
  {
    tramoId: 'parana-goya-puerto-boca',
    rio: 'parana',
    estacionId: 'pna-goya',
    localidades: ['PUERTO BOCA'],
    justificacion: 'Mediana de 5 escuelas a 5,1 km de la estación Goya (coordenadas PNA sin verificar).',
    estado: 'propuesta',
    propuestoPor: 'asistente',
  },
  {
    tramoId: 'parana-esquina',
    rio: 'parana',
    estacionId: 'pna-esquina',
    localidades: ['ESQUINA'],
    justificacion: 'Esquina está sobre el Paraná y la estación de Prefectura está en la misma localidad.',
    estado: 'aprobada',
    propuestoPor: 'asistente',
    ...APROBACION,
  },
  // Uruguay, de aguas arriba hacia aguas abajo
  {
    tramoId: 'uruguay-garruchos',
    rio: 'uruguay',
    estacionId: 'pna-garruchos',
    localidades: ['GARRUCHOS'],
    justificacion: 'Garruchos está sobre el Uruguay y la estación de Prefectura está en la misma localidad.',
    estado: 'aprobada',
    propuestoPor: 'asistente',
    ...APROBACION,
  },
  {
    tramoId: 'uruguay-santo-tome',
    rio: 'uruguay',
    estacionId: 'pna-santo-tome',
    localidades: ['SANTO TOME'],
    justificacion: 'Santo Tomé está sobre el Uruguay y la estación de Prefectura está en la misma localidad.',
    estado: 'aprobada',
    propuestoPor: 'asistente',
    ...APROBACION,
  },
  {
    tramoId: 'uruguay-alvear',
    rio: 'uruguay',
    estacionId: 'pna-alvear',
    localidades: ['GENERAL ALVEAR'],
    justificacion: 'General Alvear (Alvear) está sobre el Uruguay y la estación de Prefectura está en la misma localidad.',
    estado: 'aprobada',
    propuestoPor: 'asistente',
    ...APROBACION,
  },
  {
    tramoId: 'uruguay-la-cruz',
    rio: 'uruguay',
    estacionId: 'pna-la-cruz',
    localidades: ['LA CRUZ'],
    justificacion: 'La Cruz está sobre el Uruguay y la estación de Prefectura está en la misma localidad.',
    estado: 'aprobada',
    propuestoPor: 'asistente',
    ...APROBACION,
  },
  {
    tramoId: 'uruguay-la-cruz-quintas',
    rio: 'uruguay',
    estacionId: 'pna-la-cruz',
    localidades: ['LA CRUZ (Sección Quintas - Zona Rural)'],
    justificacion: 'Mediana de 2 escuelas a 1,7 km de la estación La Cruz (coordenadas PNA sin verificar).',
    estado: 'propuesta',
    propuestoPor: 'asistente',
  },
  {
    tramoId: 'uruguay-yapeyu',
    rio: 'uruguay',
    estacionId: 'pna-yapeyu',
    localidades: ['YAPEYU'],
    justificacion: 'Yapeyú está sobre el Uruguay y la estación de Prefectura está en la misma localidad.',
    estado: 'aprobada',
    propuestoPor: 'asistente',
    ...APROBACION,
  },
  {
    tramoId: 'uruguay-paso-de-los-libres',
    rio: 'uruguay',
    estacionId: 'pna-paso-de-los-libres',
    localidades: ['PASO DE LOS LIBRES'],
    justificacion: 'Paso de los Libres está sobre el Uruguay y la estación de Prefectura está en la misma localidad.',
    estado: 'aprobada',
    propuestoPor: 'asistente',
    ...APROBACION,
  },
  {
    tramoId: 'uruguay-bompland',
    rio: 'uruguay',
    estacionId: 'pna-bompland',
    localidades: ['BONPLAND'],
    justificacion: 'Bonpland está sobre el Uruguay y la estación de Prefectura está en la misma localidad (el padrón escribe BONPLAND, PNA publica BOMPLAND).',
    estado: 'aprobada',
    propuestoPor: 'asistente',
    ...APROBACION,
  },
  {
    tramoId: 'uruguay-monte-caseros',
    rio: 'uruguay',
    estacionId: 'pna-monte-caseros',
    localidades: ['MONTE CASEROS'],
    justificacion: 'Monte Caseros está sobre el Uruguay y la estación de Prefectura está en la misma localidad.',
    estado: 'aprobada',
    propuestoPor: 'asistente',
    ...APROBACION,
  },
  {
    tramoId: 'uruguay-mocoreta',
    rio: 'uruguay',
    estacionId: 'pna-mocoreta',
    localidades: ['MOCORETA'],
    justificacion: 'Mocoretá está sobre el Uruguay y la estación de Prefectura está en la misma localidad.',
    estado: 'aprobada',
    propuestoPor: 'asistente',
    ...APROBACION,
  },
]

// Localidades que no se asignan porque no hay certeza de que sean ribereñas del
// curso de referencia. Una persona debe decidirlas antes de agregarlas a un tramo.
// El motivo trae la distancia medida a la estación más cercana (proxy, ver arriba).
export const LOCALIDADES_DUDOSAS: readonly LocalidadDudosa[] = [
  { localidad: 'GOBERNADOR VIRASORO', departamento: 'SANTO TOME', motivo: 'Mediana de 41 escuelas a 39,9 km de la estación Garruchos (coordenadas PNA sin verificar); supera el umbral de 15 km.' },
  { localidad: 'COSTA DE EMPEDRADO', departamento: 'EMPEDRADO', motivo: 'Mediana de 2 escuelas a 37,4 km de la estación Empedrado (coordenadas PNA sin verificar); supera el umbral de 15 km.' },
  { localidad: 'PUNTA IFRAN', departamento: 'GOYA', motivo: 'Mediana de 6 escuelas a 27,6 km de la estación Goya (coordenadas PNA sin verificar); supera el umbral de 15 km.' },
  { localidad: 'SAN CARLOS', departamento: 'ITUZAINGO', motivo: 'Mediana de 7 escuelas a 53,7 km de la estación Garruchos (coordenadas PNA sin verificar); supera el umbral de 15 km.' },
  { localidad: 'MUCHAS ISLAS', departamento: 'BELLA VISTA', motivo: 'Mediana de 1 escuela a 28,6 km de la estación Bella Vista (coordenadas PNA sin verificar); supera el umbral de 15 km.' },
  { localidad: 'TAPEBICUA', departamento: 'PASO DE LOS LIBRES', motivo: 'Mediana de 4 escuelas a 19,9 km de la estación Yapeyú (coordenadas PNA sin verificar); supera el umbral de 15 km.' },
  { localidad: 'JUAN PUJOL', departamento: 'MONTE CASEROS', motivo: 'Mediana de 5 escuelas a 29,1 km de la estación Monte Caseros (coordenadas PNA sin verificar); supera el umbral de 15 km.' },
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
