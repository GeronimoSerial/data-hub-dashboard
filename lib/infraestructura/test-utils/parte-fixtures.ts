import { getDb } from '@/lib/db'
import { PERIODO_ENOS_2026_2027_ID } from '@/lib/db/seed'
import {
  infraAfectacion,
  infraAfectacionAlumno,
  infraAfectacionSeccion,
  infraParte,
  infraServicioAlcance,
} from '@/lib/db/schema'

// Crea un parte vacío (sin afectaciones ni servicio) para el CUE indicado
// y devuelve su id, para que cada test agregue encima sólo lo que necesita.
export async function crearParte(cue: string, corteId = 1): Promise<string> {
  const db = getDb()
  const id = crypto.randomUUID()
  const ahora = new Date().toISOString()
  await db.insert(infraParte).values({
    id,
    periodoId: PERIODO_ENOS_2026_2027_ID,
    cueAnexo: cue,
    estadoEstablecimiento: 'habitual',
    estadoEstablecimientoRigeDesde: ahora,
    corteId,
    creadaEn: ahora,
    actualizadaEn: ahora,
  })
  return id
}

export async function crearAfectacion(params: {
  parteId: string
  motivo?: string
  categoria?: 'establecimiento' | 'alumnos'
  severidad?: 'Baja' | 'Media' | 'Alta' | 'Crítica'
  descripcion?: string | null
  rigeDesde?: string
  retiradaEn?: string | null
  secciones: number[]
  alumnos?: number[]
}): Promise<string> {
  const db = getDb()
  const id = crypto.randomUUID()
  const ahora = new Date().toISOString()
  await db.insert(infraAfectacion).values({
    id,
    parteId: params.parteId,
    motivo: params.motivo ?? 'Inundación',
    categoria: params.categoria ?? 'establecimiento',
    severidad: params.severidad ?? 'Alta',
    descripcion: params.descripcion ?? null,
    rigeDesde: params.rigeDesde ?? ahora,
    creadaEn: ahora,
    retiradaEn: params.retiradaEn ?? null,
  })
  if (params.secciones.length > 0) {
    await db
      .insert(infraAfectacionSeccion)
      .values(params.secciones.map((geSectionId) => ({ afectacionId: id, geSectionId })))
  }
  if (params.alumnos && params.alumnos.length > 0) {
    await db
      .insert(infraAfectacionAlumno)
      .values(params.alumnos.map((gePersonId) => ({ afectacionId: id, gePersonId })))
  }
  return id
}

export async function crearServicioAlcance(params: {
  parteId: string
  tipo: 'establecimiento' | 'turno' | 'seccion'
  referenciaId?: string | null
  estado: 'normal' | 'suspendido'
  rigeDesde?: string
  retiradaEn?: string | null
}): Promise<void> {
  const db = getDb()
  const ahora = new Date().toISOString()
  await db.insert(infraServicioAlcance).values({
    id: crypto.randomUUID(),
    parteId: params.parteId,
    tipo: params.tipo,
    referenciaId: params.referenciaId ?? null,
    estado: params.estado,
    rigeDesde: params.rigeDesde ?? ahora,
    creadaEn: ahora,
    retiradaEn: params.retiradaEn ?? null,
  })
}
