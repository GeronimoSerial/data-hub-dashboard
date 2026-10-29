import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { infraCentroEvacuados, infraComedorEscuela } from '@/lib/db/schema'
import { estadoComedor, type EstadoComedor } from '@/lib/infraestructura/comedores/estado'

export interface MarcasMapa {
  comedores: ReadonlyMap<string, { desayuno: boolean; almuerzo: boolean }>
  aptos: ReadonlyMap<string, boolean>
}

// Marcas por escuela que el mapa agrega a cada fila: servicio de comedor (planilla
// MEC) y "posible centro de evacuados" (job diario). Con `cueAnexo` lee sólo esa escuela.
export async function cargarMarcasMapa(cueAnexo?: string, db = getDb()): Promise<MarcasMapa> {
  const [comedores, centros] = await Promise.all([
    cueAnexo ? db.select().from(infraComedorEscuela).where(eq(infraComedorEscuela.cueAnexo, cueAnexo)) : db.select().from(infraComedorEscuela),
    cueAnexo ? db.select().from(infraCentroEvacuados).where(eq(infraCentroEvacuados.cueAnexo, cueAnexo)) : db.select().from(infraCentroEvacuados),
  ])
  return {
    comedores: new Map(comedores.map((c) => [c.cueAnexo, { desayuno: c.desayuno, almuerzo: c.almuerzo }])),
    aptos: new Map(centros.map((c) => [c.cueAnexo, c.apto])),
  }
}

// `posibleCentroEvacuados` queda ausente si el job diario todavía no calculó la escuela.
export function marcasDeEscuela(cueAnexo: string, marcas: MarcasMapa): { comedor: EstadoComedor; posibleCentroEvacuados?: boolean } {
  const apto = marcas.aptos.get(cueAnexo)
  return {
    comedor: estadoComedor(marcas.comedores.get(cueAnexo)).estado,
    ...(apto === undefined ? {} : { posibleCentroEvacuados: apto }),
  }
}
