import { guardarVersion } from '@/lib/infraestructura/datasets/repositorio'
import { ensureLocalizacionesSeeded } from '@/lib/infraestructura/localizaciones-seed'
import { crearEjecutorSql, ensureGeSchema } from '@/lib/infraestructura/ge-db'
import { getRawClient } from '@/lib/db/index'
import { nivelesJurisdiccionales } from '@/lib/model'
import { CUE_ANEXO_OPERADOR } from '../cuentas-qa'

// Escuelas de prueba del mapa e2e. Es la única fuente: las siembras y los manifiestos
// posteriores importan ESCUELAS y no repiten CUE, nombres ni niveles.
//
// Origen: CUE, nombre, localidad y coordenadas salen de public/data/localizaciones.json
// (padrón público versionado) para los cuatro departamentos del seed. Cada coordenada
// cae dentro del polígono de su departamento en el GeoJSON de Georef
// (public/data/departamentos-corrientes-georef-2026-09-27.geojson); lo verifica
// escuelas.test.ts.
//
// Niveles: asignados a mano y fijos. Doce escuelas están en el nivel 1 (Dirección de
// Nivel Secundario), que es el alcance de la cuenta qa-director-nivel (NIVEL_CON_ESCUELAS).
// Los demás niveles (2, 4, 5) existen para que el alcance de nivel filtre de verdad.

export const CICLO_LECTIVO_SEMBRADO = 2026

export const DEPARTAMENTOS_ESCUELAS = ['Capital', 'Goya', 'Paso de los Libres', 'Santo Tomé'] as const
export type DepartamentoEscuela = (typeof DEPARTAMENTOS_ESCUELAS)[number]

export type EscuelaSembrada = {
  cueAnexo: string
  nombre: string
  departamento: DepartamentoEscuela
  localidad: string
  lat: number | null
  lon: number | null
  nivelJurisdiccionalId: number
}

export const ESCUELAS: readonly EscuelaSembrada[] = [
  // Capital: 10 con coordenadas, 1 sin coordenadas.
  { cueAnexo: CUE_ANEXO_OPERADOR, nombre: 'ESCUELA NORMAL "DR.JUAN GREGORIO PUJOL"', departamento: 'Capital', localidad: 'CORRIENTES', lat: -27.4714939, lon: -58.836627, nivelJurisdiccionalId: 1 },
  { cueAnexo: '1800643-00', nombre: 'JARDIN DE INFANTES "LUNA DE PAPEL" IPP.4', departamento: 'Capital', localidad: 'CORRIENTES', lat: -27.489013, lon: -58.833112, nivelJurisdiccionalId: 1 },
  { cueAnexo: '1801899-00', nombre: 'INSTITUTO DE ATENCION A LA DIVERSIDAD (IAD SRL) I.E-14', departamento: 'Capital', localidad: 'CORRIENTES', lat: -27.4806, lon: -58.84503, nivelJurisdiccionalId: 2 },
  { cueAnexo: '1801855-00', nombre: 'COLEGIO SECUNDARIO DEL Bº APIPE', departamento: 'Capital', localidad: 'CORRIENTES', lat: -27.45969, lon: -58.7855607, nivelJurisdiccionalId: 4 },
  { cueAnexo: '1801110-00', nombre: 'COLEGIO INFORMATICO "SAN JUAN DE VERA"', departamento: 'Capital', localidad: 'CORRIENTES', lat: -27.46273, lon: -58.83818, nivelJurisdiccionalId: 1 },
  { cueAnexo: '1801477-00', nombre: 'INSTITUTO SUPERIOR DE INFORMÁTICA Y ADMINISTRACIÓN LT-7', departamento: 'Capital', localidad: 'CORRIENTES', lat: -27.46273, lon: -58.83818, nivelJurisdiccionalId: 5 },
  { cueAnexo: '1800117-00', nombre: 'INSTITUTO SUPERIOR HUMANISTICO CORRIENTES IS.36/ILT-1', departamento: 'Capital', localidad: 'CORRIENTES', lat: -27.46457, lon: -58.840373, nivelJurisdiccionalId: 2 },
  { cueAnexo: '1801176-00', nombre: 'INSTITUTO SUPERIOR "CARMEN MOLINA DE LLANO"', departamento: 'Capital', localidad: 'CORRIENTES', lat: -27.46505, lon: -58.837731, nivelJurisdiccionalId: 1 },
  { cueAnexo: '1801644-00', nombre: 'ESCUELA TECNICA "CARMEN M. DE LLANO"', departamento: 'Capital', localidad: 'CORRIENTES', lat: -27.46505, lon: -58.837731, nivelJurisdiccionalId: 4 },
  { cueAnexo: '1801461-00', nombre: 'INST.SUP.DE FORM.PROF. "DR. RAMON CARRILLO" IT-19', departamento: 'Capital', localidad: 'CORRIENTES', lat: -27.46566, lon: -58.82167, nivelJurisdiccionalId: 5 },
  { cueAnexo: '1801176-01', nombre: 'INSTITUTO SUPERIOR "CARMEN MOLINA DE LLANO" (ANEXO)', departamento: 'Capital', localidad: 'CORRIENTES', lat: null, lon: null, nivelJurisdiccionalId: 2 },

  // Goya: 8 con coordenadas, 1 sin coordenadas.
  { cueAnexo: '1801533-00', nombre: 'ESCUELA HOSPITALARIA DOMICILIARIA Nº 30', departamento: 'Goya', localidad: 'GOYA', lat: -29.1367, lon: -59.246538, nivelJurisdiccionalId: 1 },
  { cueAnexo: '1801016-00', nombre: 'COLEGIO SECUNDARIO DE COLONIA CAROLINA', departamento: 'Goya', localidad: 'COLONIA CAROLINA', lat: -29.1461, lon: -59.1867612, nivelJurisdiccionalId: 2 },
  { cueAnexo: '1801608-03', nombre: 'J.I.N. Nº 12 - ESCUELA Nº 733', departamento: 'Goya', localidad: 'REMANSO', lat: -29.10279, lon: -59.24866, nivelJurisdiccionalId: 1 },
  { cueAnexo: '1801421-00', nombre: 'INSTITUTO DE LENGUAS MODERNAS "SAINT PAUL" I.PROF-1', departamento: 'Goya', localidad: 'GOYA', lat: -29.14151, lon: -59.263891, nivelJurisdiccionalId: 4 },
  { cueAnexo: '1800893-00', nombre: 'ESCUELA Nº 678', departamento: 'Goya', localidad: 'PARAJE SAN ANTONIO', lat: -29.30617, lon: -59.19734, nivelJurisdiccionalId: 5 },
  { cueAnexo: '1800953-00', nombre: 'ESCUELA Nº 270 "DR. EDUARDO CONI MOLINA"', departamento: 'Goya', localidad: 'ESTANCIA DON RAUL', lat: -29.48386, lon: -59.1731332, nivelJurisdiccionalId: 1 },
  { cueAnexo: '1800939-00', nombre: 'ESCUELA Nº 595 "RAUL RAMON BALESTRA"', departamento: 'Goya', localidad: 'PAGO REDONDO', lat: -29.60106, lon: -59.22815, nivelJurisdiccionalId: 2 },
  { cueAnexo: '1801754-04', nombre: 'J.I.N.Nº 59 - ESCUELA Nº 68', departamento: 'Goya', localidad: 'COLONIA PROGRESO', lat: -29.095876, lon: -59.166148, nivelJurisdiccionalId: 4 },
  { cueAnexo: '1801018-00', nombre: 'ESCUELA Nº 597 "DEOLINDA H. FERNANDEZ DE MASDEU"', departamento: 'Goya', localidad: 'PARANACITO', lat: null, lon: null, nivelJurisdiccionalId: 5 },

  // Paso de los Libres: 6 con coordenadas.
  { cueAnexo: '1800405-00', nombre: 'COLEGIO SECUNDARIO "PRESIDENTE ARTURO FRONDIZI"', departamento: 'Paso de los Libres', localidad: 'PASO DE LOS LIBRES', lat: -29.71152, lon: -57.07979, nivelJurisdiccionalId: 1 },
  { cueAnexo: '1800887-00', nombre: 'ESCUELA Nº 875 "GRANADEROS DE SAN MARTIN"', departamento: 'Paso de los Libres', localidad: 'SANTA ANA', lat: -29.85916, lon: -57.434712, nivelJurisdiccionalId: 2 },
  { cueAnexo: '1801039-00', nombre: 'ESCUELA Nº 590', departamento: 'Paso de los Libres', localidad: 'SAN SALVADOR', lat: -29.298439, lon: -57.50602, nivelJurisdiccionalId: 4 },
  { cueAnexo: '1800929-00', nombre: 'ESCUELA Nº 342', departamento: 'Paso de los Libres', localidad: 'LA FLORIDA', lat: -29.320298, lon: -57.430059, nivelJurisdiccionalId: 1 },
  { cueAnexo: '1801654-00', nombre: 'ESCUELA Nº 976', departamento: 'Paso de los Libres', localidad: 'TAPEBICUA', lat: -29.331606, lon: -57.045532, nivelJurisdiccionalId: 5 },
  { cueAnexo: '1800932-00', nombre: 'ESCUELA Nº 516 "SAN JOSE DE CALASANZ"', departamento: 'Paso de los Libres', localidad: 'TAPEBICUA', lat: -29.505804, lon: -56.977628, nivelJurisdiccionalId: 1 },

  // Santo Tomé: 6 con coordenadas.
  { cueAnexo: '1801475-00', nombre: 'ESCUELA Nº 958 "VUELTA OMBU"', departamento: 'Santo Tomé', localidad: 'GOBERNADOR VIRASORO', lat: -28.052752, lon: -56.01095, nivelJurisdiccionalId: 2 },
  { cueAnexo: '1801101-00', nombre: 'ESCUELA Nº 561 "CTTE. GREGORIO A. PORTILLO"', departamento: 'Santo Tomé', localidad: 'GOBERNADOR VIRASORO', lat: -28.00685, lon: -56.216869, nivelJurisdiccionalId: 1 },
  { cueAnexo: '1801907-00', nombre: 'ESCUELA JARDIN DE INFANTES Nº 53', departamento: 'Santo Tomé', localidad: 'GOBERNADOR VIRASORO', lat: -28.04176, lon: -56.027705, nivelJurisdiccionalId: 4 },
  { cueAnexo: '1801838-00', nombre: 'ESCUELA JARDIN Nº 49 "ROSA GUARU"', departamento: 'Santo Tomé', localidad: 'GOBERNADOR VIRASORO', lat: -28.05863, lon: -56.021992, nivelJurisdiccionalId: 5 },
  { cueAnexo: '1801285-00', nombre: 'COLEGIO "SIGLO XXI" IS.13 - IP.56 - IPP.39', departamento: 'Santo Tomé', localidad: 'SANTO TOME', lat: -28.54799, lon: -56.030801, nivelJurisdiccionalId: 1 },
  { cueAnexo: '1800653-00', nombre: 'ESCUELA TECNICA DE SANTO TOME', departamento: 'Santo Tomé', localidad: 'SANTO TOME', lat: -28.55733, lon: -56.0533261, nivelJurisdiccionalId: 2 },
]

const REVISION_SEMBRADA = 'e2e-escuelas-v1'

/**
 * Publica el dataset `localizaciones` con las escuelas del roster y puebla las tablas GE
 * de las que lee el mapa: ge_localizacion (vía la proyección del dataset) y
 * ge_escuela_nivel_jur (ver sembrarNivelesJurisdiccionales).
 * No crea secciones, alumnos ni identidades.
 */
export async function sembrarEscuelas(): Promise<void> {
  await guardarVersion({
    datasetId: 'localizaciones',
    nombre: 'Localizaciones escolares',
    revision: REVISION_SEMBRADA,
    fuente: 'Padrón público de escuelas (public/data/localizaciones.json), recorte para e2e',
    formato: 'array',
    clave: 'cueAnexo',
    datos: ESCUELAS.map((escuela) => ({
      cueAnexo: escuela.cueAnexo,
      nombre: escuela.nombre,
      departamento: escuela.departamento,
      localidad: escuela.localidad,
      lat: escuela.lat,
      lon: escuela.lon,
      geoCalidad: null,
    })),
  })
  // guardarVersion ya proyectó ge_localizacion; esta llamada solo confirma la ruta de la app
  // (no hace nada si la tabla ya tiene filas).
  await ensureLocalizacionesSeeded()
  await sembrarNivelesJurisdiccionales()
}

/**
 * Nivel jurisdiccional por CUE-anexo. No hay función de la app que la escriba sin pasar
 * por el padrón nominal: el único escritor es scripts/import-padron.mjs, que lee
 * public.secciones (datos nominales de alumnos). Este seed no debe crear secciones, así
 * que escribe la tabla de nivel con SQL directo. Es un INSERT ... ON CONFLICT idempotente
 * sobre ge_escuela_nivel_jur, con el mismo esquema que usa el import.
 */
async function sembrarNivelesJurisdiccionales(): Promise<void> {
  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)

  await client.execute('BEGIN')
  try {
    // ge.ge_nivel_jurisdiccional es una tabla GE distinta del catálogo de la app (ensureSeeded
    // siembra public); la FK exige que existan los ids usados.
    for (const nivel of nivelesJurisdiccionales) {
      await client.execute({
        sql: `INSERT INTO ge.ge_nivel_jurisdiccional (id, nombre) VALUES (?, ?)
              ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre`,
        args: [nivel.id, nivel.nombre],
      })
    }
    for (const escuela of ESCUELAS) {
      await client.execute({
        sql: `INSERT INTO ge.ge_escuela_nivel_jur (cue_anexo, nivel_jurisdiccional_id, ciclo_lectivo)
              VALUES (?, ?, ?)
              ON CONFLICT (cue_anexo) DO UPDATE SET
                nivel_jurisdiccional_id = EXCLUDED.nivel_jurisdiccional_id,
                ciclo_lectivo = EXCLUDED.ciclo_lectivo`,
        args: [escuela.cueAnexo, escuela.nivelJurisdiccionalId, CICLO_LECTIVO_SEMBRADO],
      })
    }
    await client.execute('COMMIT')
  } catch (err) {
    await client.execute('ROLLBACK')
    throw err
  }
}
