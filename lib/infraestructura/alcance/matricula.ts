import type { EjecutorSql } from '../ge-db'
import type { AlcanceProvider, IdentidadMiembro, UnidadAlcance } from './tipos'

// Carrera de un instituto superior en la matrícula vigente, con el total de
// alumnos que la componen (para la ficha y los totales del mapa).
export interface CarreraMatricula {
  id: number
  nombre: string
  // Resolución ministerial: distingue carreras con el mismo nombre dentro de un CUE.
  rm: string
  tipo: string
  totalAlumnos: number
}

// Adaptador de matrícula nominal (instituto superior). Las unidades son las
// carreras del CUE en el corte vigente; los miembros son sus alumnos.
export interface AlcanceMatricula extends AlcanceProvider {
  readonly sistema: 'matricula'
  // Corte de matrícula con el que se leyeron las carreras.
  readonly corteId: number
  // Carreras del CUE con su total de alumnos. Una sola lectura por instancia.
  listarCarreras(): Promise<CarreraMatricula[]>
}

function aUnidadAlcance(carrera: CarreraMatricula): UnidadAlcance {
  return { id: carrera.id, etiqueta: carrera.nombre, turno: null, grupo: carrera.tipo }
}

function marcadores(cantidad: number): string {
  return Array.from({ length: cantidad }, () => '?').join(', ')
}

// Miembros (ids de matricula_alumno) por carrera en un corte. Una sola consulta
// para todas las carreras pedidas; sirve al adaptador y a las lecturas por lote
// de varios CUEs, que no tienen un adaptador por CUE.
export async function membresiaMatricula(
  client: EjecutorSql,
  corteId: number,
  unitIds: number[],
): Promise<Map<number, Set<number>>> {
  const membresia = new Map<number, Set<number>>()
  if (unitIds.length === 0) return membresia
  const res = await client.execute({
    sql: `SELECT carrera_id, id FROM matricula_alumno
          WHERE corte_id = ? AND carrera_id IN (${marcadores(unitIds.length)})`,
    args: [corteId, ...unitIds],
  })
  for (const row of res.rows) {
    const carreraId = Number(row.carrera_id)
    const set = membresia.get(carreraId) ?? new Set<number>()
    set.add(Number(row.id))
    membresia.set(carreraId, set)
  }
  return membresia
}

// Adaptador para institutos superiores. Los identificadores de alumno son los
// ids de matricula_alumno; la identidad se resuelve por id en cualquier corte,
// así un parte histórico sigue mostrando nombres aunque su corte ya no sea el
// vigente. Memoiza las carreras por instancia, como el adaptador GE.
export function crearAlcanceMatricula(client: EjecutorSql, corteId: number, cueAnexo: string): AlcanceMatricula {
  let carrerasLeidas: Promise<CarreraMatricula[]> | undefined
  const listarCarreras = () => {
    if (!carrerasLeidas) {
      const lectura = leerCarreras(client, corteId, cueAnexo)
      carrerasLeidas = lectura
      // Un fallo no queda cacheado: la siguiente llamada vuelve a consultar.
      lectura.catch(() => {
        carrerasLeidas = undefined
      })
    }
    return carrerasLeidas
  }
  return {
    sistema: 'matricula',
    corteId,
    listarCarreras,
    listUnits: async () => (await listarCarreras()).map(aUnidadAlcance),
    listMembers: (unitIds) => membresiaMatricula(client, corteId, unitIds),
    resolveIdentities: async (memberIds) => {
      if (memberIds.length === 0) return []
      const res = await client.execute({
        sql: `SELECT id, apellidos, nombres FROM matricula_alumno WHERE id IN (${marcadores(memberIds.length)})`,
        args: [...memberIds],
      })
      return res.rows.map(
        (row): IdentidadMiembro => ({
          miembroId: Number(row.id),
          nombre: String(row.nombres),
          apellido: String(row.apellidos),
        }),
      )
    },
  }
}

async function leerCarreras(client: EjecutorSql, corteId: number, cueAnexo: string): Promise<CarreraMatricula[]> {
  const res = await client.execute({
    sql: `SELECT c.id, c.nombre, c.rm, c.tipo, COUNT(a.id) AS total
          FROM matricula_carrera c
          LEFT JOIN matricula_alumno a ON a.carrera_id = c.id AND a.corte_id = c.corte_id
          WHERE c.corte_id = ? AND c.cue_anexo = ?
          GROUP BY c.id, c.nombre, c.rm, c.tipo
          ORDER BY c.nombre, c.id`,
    args: [corteId, cueAnexo],
  })
  return res.rows.map((row) => ({
    id: Number(row.id),
    nombre: String(row.nombre),
    rm: String(row.rm),
    tipo: String(row.tipo),
    totalAlumnos: Number(row.total),
  }))
}
