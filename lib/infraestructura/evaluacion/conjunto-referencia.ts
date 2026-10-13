/**
 * Versioned reference set for measuring the event layer (V-1).
 *
 * Sources (read-only, outside the repo):
 * - docs/investigacion-inundaciones-corrientes/08-evaluacion.md ("Conjunto de referencia", "Métricas")
 * - docs/investigacion-inundaciones-corrientes/02-registro/eventos.csv
 *
 * Rules carried from 08-evaluacion.md:
 * - A locality without news is not a negative. Only explicit negatives count as negatives.
 * - Coverage bias: national media were missed by the standard search and coverage
 *   concentrates in Paso de los Libres and Ituzaingó. Metrics are not generalizable.
 * - Circularity: sources used to build the event layer cannot validate it.
 * - Production database rows (partes) and any non-real provenance are excluded.
 * - Unknown cases are not a scoring class and are not listed here.
 *
 * Rule for positives: a positive is an affectation that happened (flooding,
 * damage, evacuation of people, cut of service). Preventive measures taken by
 * operators as a precaution (closures, pre-emptive evacuations, gate operations
 * without reported impact) are excluded. Excluded as preventive measures:
 * EV-20261012-004 and EV-20261013-005.
 *
 * Scope of the set: only high and medium confidence cases are listed. 08-evaluacion.md
 * says "11 positivos", which is stale: it lists 8, and 8 minus the preventive
 * EV-20261013-005 gives 7. The three low-confidence cases (EV-20261008-004,
 * EV-20261012-005 and EV-20261013-004) are not in this set.
 *
 * Timestamps: the CSV uses ART (UTC-3, no DST). Values with only a date or an
 * approximate date are kept as null; they are never turned into a fabricated time.
 */

export const CONJUNTO_REFERENCIA_VERSION = 'conjunto-referencia-2026-10-v2'

export type ClaseCaso = 'positivo' | 'negativo' | 'bajo_umbral'

export type NivelTerritorial = 'estacion' | 'barrio' | 'localidad' | 'departamento'

export type CasoReferencia = {
  id: string
  clase: ClaseCaso
  /** ISO UTC instant of the event start, or null when the source gives no time. */
  inicio: string | null
  /** ISO UTC instant of the first publication, or null when the source gives no time. */
  primeraPublicacion: string | null
  territorio: string
  nivelTerritorial: NivelTerritorial
  confianza: 'alta' | 'media' | 'baja' | 'muy baja'
  descripcion: string
}

/** Window: from 2026-10-07 00:00 ART to the cut at 2026-10-13 12:45 ART. */
export const VENTANA_REFERENCIA = {
  desde: '2026-10-07T03:00:00.000Z',
  hasta: '2026-10-13T15:45:00.000Z',
} as const

export const CONJUNTO_REFERENCIA: readonly CasoReferencia[] = [
  {
    id: 'EV-20261007-001',
    clase: 'positivo',
    inicio: null,
    primeraPublicacion: null,
    territorio: 'Paso de los Libres',
    nivelTerritorial: 'localidad',
    confianza: 'media',
    descripcion: 'Evacuación preventiva de familias por crecida del río Uruguay',
  },
  {
    id: 'EV-20261008-001',
    clase: 'positivo',
    inicio: null,
    primeraPublicacion: null,
    territorio: 'Curuzú Cuatiá',
    nivelTerritorial: 'localidad',
    confianza: 'media',
    descripcion: 'Tormenta con viento: árboles y postes caídos, cortes de energía, daños en viviendas',
  },
  {
    id: 'EV-20261010-001',
    clase: 'positivo',
    inicio: null,
    primeraPublicacion: null,
    territorio: 'General Alvear',
    nivelTerritorial: 'localidad',
    confianza: 'media',
    descripcion: 'Cierre preventivo del puerto y del paso Alvear-Itaquí por crecida del río Uruguay',
  },
  {
    id: 'EV-20261011-001',
    clase: 'positivo',
    inicio: null,
    primeraPublicacion: '2026-10-13T00:00:00.000Z',
    territorio: 'Ituzaingó (Isla Apipé)',
    nivelTerritorial: 'localidad',
    confianza: 'media',
    descripcion: 'Evacuación de familias y playas bajo agua en Isla Apipé por crecida del río Paraná',
  },
  {
    id: 'EV-20261011-002',
    clase: 'positivo',
    inicio: null,
    primeraPublicacion: '2026-10-12T11:55:00.000Z',
    territorio: 'Ituzaingó (represa Yacyretá)',
    nivelTerritorial: 'localidad',
    confianza: 'media',
    descripcion: 'Apertura de compuertas en Yacyretá con aumento de caudal aguas abajo',
  },
  {
    id: 'EV-20261012-001',
    clase: 'positivo',
    inicio: null,
    primeraPublicacion: null,
    territorio: 'Ituzaingó',
    nivelTerritorial: 'localidad',
    confianza: 'alta',
    descripcion: 'Nivel sobre alerta del río Paraná en el puerto de Ituzaingó según Prefectura',
  },
  {
    id: 'EV-20261013-001',
    clase: 'positivo',
    inicio: null,
    primeraPublicacion: null,
    territorio: 'Paso de los Libres',
    nivelTerritorial: 'localidad',
    confianza: 'alta',
    descripcion: 'Nivel sobre cota de evacuación en el puerto de Paso de los Libres según Prefectura',
  },
  {
    id: 'EV-20261008-002',
    clase: 'negativo',
    inicio: null,
    primeraPublicacion: '2026-10-08T13:51:00.000Z',
    territorio: 'Corrientes (Capital)',
    nivelTerritorial: 'localidad',
    confianza: 'media',
    descripcion: 'Sin anegamientos y con transporte normal en la ciudad de Corrientes hasta las 9:00',
  },
  {
    id: 'EV-20261013-002',
    clase: 'bajo_umbral',
    inicio: null,
    primeraPublicacion: null,
    territorio: 'Corrientes; Itatí; Bella Vista; Goya; Esquina',
    nivelTerritorial: 'estacion',
    confianza: 'alta',
    descripcion: 'Lecturas oficiales de Prefectura en crecida bajo el umbral de alerta',
  },
  {
    id: 'EV-20261013-003',
    clase: 'bajo_umbral',
    inicio: null,
    primeraPublicacion: null,
    territorio: 'Santo Tomé; Garruchos; Monte Caseros',
    nivelTerritorial: 'estacion',
    confianza: 'alta',
    descripcion: 'Lecturas oficiales de Prefectura en crecida bajo el umbral de alerta',
  },
]
